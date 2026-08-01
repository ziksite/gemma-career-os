/**
 * Client Gemma (Vertex AI Model Garden, OpenAI-compatible endpoint).
 *
 * API:
 *   ask(prompt, opts)          → string
 *   chat(messages, opts)       → GemmaResponse (text + thinking + usage)
 *   chatStream(messages, opts) → AsyncGenerator<string> (token per token)
 *   chatJSON(messages, opts)   → objek hasil parse (structured output untuk agent)
 */

import { getConfig, type GemmaConfig } from './config';
import { clearTokenCache, getAccessToken } from './auth';
import {
  GemmaError,
  type ChatMessage,
  type ChatOptions,
  type GemmaResponse,
  type TokenUsage,
} from './types';

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

function buildBody(
  messages: ChatMessage[],
  cfg: GemmaConfig,
  options: ChatOptions,
  stream: boolean,
): Record<string, unknown> {
  const all: ChatMessage[] = options.system
    ? [{ role: 'system', content: options.system }, ...messages]
    : messages;

  return {
    model: options.model ?? cfg.model,
    stream,
    max_tokens: options.maxTokens ?? cfg.maxTokens,
    temperature: options.temperature ?? cfg.temperature,
    ...(options.topP !== undefined ? { top_p: options.topP } : {}),
    ...(options.stop?.length ? { stop: options.stop } : {}),
    messages: all,
    chat_template_kwargs: {
      enable_thinking: options.enableThinking ?? cfg.enableThinking,
    },
  };
}

/**
 * Gemma dengan thinking aktif kadang membungkus reasoning dalam <think>...</think>
 * di dalam content, kadang mengirimnya terpisah sebagai reasoning_content.
 * Fungsi ini menormalkan keduanya jadi { text, thinking }.
 */
export function splitThinking(content: string): { text: string; thinking: string | null } {
  const parts: string[] = [];
  const body = content.replace(
    /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi,
    (_m, inner: string) => {
      parts.push(inner.trim());
      return '';
    },
  );

  // Blok thinking yang belum tertutup (misalnya output terpotong max_tokens).
  const dangling = body.match(/<think(?:ing)?>([\s\S]*)$/i);
  if (dangling?.[1]) {
    parts.push(dangling[1].trim());
    return { text: '', thinking: parts.join('\n\n') };
  }

  return {
    text: body.trim(),
    thinking: parts.length ? parts.join('\n\n') : null,
  };
}

function parseUsage(raw: unknown): TokenUsage | null {
  const u = (raw as { usage?: Record<string, number> } | null)?.usage;
  if (!u) return null;
  return {
    promptTokens: u.prompt_tokens ?? 0,
    completionTokens: u.completion_tokens ?? 0,
    totalTokens: u.total_tokens ?? 0,
  };
}

async function postJson(
  cfg: GemmaConfig,
  body: unknown,
  options: ChatOptions,
): Promise<Response> {
  const retries = options.retries ?? 3;
  const timeoutMs = options.timeoutMs ?? 120_000;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout;

    try {
      const token = await getAccessToken();
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      });

      if (res.ok) return res;

      const text = await res.text();

      // Token kadaluarsa/ditolak → buang cache lalu mint ulang sekali.
      if (res.status === 401 || res.status === 403) {
        clearTokenCache();
        if (attempt < retries) {
          lastErr = new GemmaError(`Auth ditolak (${res.status})`, res.status, text);
          continue;
        }
      }

      if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
        lastErr = new GemmaError(`HTTP ${res.status}`, res.status, text);
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
        continue;
      }

      throw new GemmaError(
        `Vertex AI menolak request (HTTP ${res.status}): ${text.slice(0, 800)}`,
        res.status,
        text,
      );
    } catch (err) {
      if (err instanceof GemmaError && err.status && !RETRYABLE_STATUS.has(err.status)) {
        throw err;
      }
      lastErr = err;
      if (attempt >= retries) break;
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new GemmaError(`Request gagal: ${String(lastErr)}`);
}

/** Panggilan chat lengkap (non-streaming). */
export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<GemmaResponse> {
  const cfg = getConfig();
  const started = Date.now();
  const res = await postJson(cfg, buildBody(messages, cfg, options, false), options);
  const raw = (await res.json()) as {
    model?: string;
    choices?: Array<{
      message?: { content?: string; reasoning_content?: string };
      finish_reason?: string;
    }>;
  };

  const choice = raw.choices?.[0];
  const content = choice?.message?.content ?? '';
  const split = splitThinking(content);
  const reasoning = choice?.message?.reasoning_content?.trim() || null;

  return {
    text: split.text,
    thinking: reasoning ?? split.thinking,
    finishReason: choice?.finish_reason ?? null,
    usage: parseUsage(raw),
    model: raw.model ?? options.model ?? cfg.model,
    raw,
    latencyMs: Date.now() - started,
  };
}

/** Versi ringkas: satu prompt string → satu jawaban string. */
export async function ask(prompt: string, options: ChatOptions = {}): Promise<string> {
  const res = await chat([{ role: 'user', content: prompt }], options);
  return res.text;
}

/**
 * Streaming SSE. Yield potongan teks jawaban (blok <think> di-skip supaya
 * yang tampil di UI hanya jawaban final).
 */
export async function* chatStream(
  messages: ChatMessage[],
  options: ChatOptions = {},
): AsyncGenerator<string, void, unknown> {
  const cfg = getConfig();
  const res = await postJson(cfg, buildBody(messages, cfg, options, true), options);
  if (!res.body) throw new GemmaError('Response streaming tanpa body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let insideThinking = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        let parsed: {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue; // chunk belum utuh / keepalive
        }

        let piece = parsed.choices?.[0]?.delta?.content;
        if (!piece) continue;

        // Filter blok thinking dari stream yang tampil ke user.
        if (insideThinking) {
          const end = piece.search(/<\/think(?:ing)?>/i);
          if (end === -1) continue;
          piece = piece.slice(piece.indexOf('>', end) + 1);
          insideThinking = false;
        }
        const start = piece.search(/<think(?:ing)?>/i);
        if (start !== -1) {
          insideThinking = true;
          piece = piece.slice(0, start);
        }

        if (piece) yield piece;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Perbaiki kerusakan sintaks JSON yang lazim dihasilkan LLM.
 *
 * Dua yang benar-benar terjadi pada Gemma:
 *   - tanda kutip ganda di dalam nilai string tanpa escape, sehingga string
 *     berakhir lebih awal dan sisa kalimat jadi token liar;
 *   - baris baru mentah di dalam string.
 * Ditambah koma menggantung, yang murah untuk sekalian ditangani.
 *
 * Penentuan kutip penutup: pada JSON yang sah, kutip penutup selalu diikuti
 * (setelah spasi) oleh `,` `}` `]` `:` atau akhir teks. Selain itu berarti
 * kutip literal di tengah kalimat.
 */
export function repairJsonText(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;

    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j]!)) j++;
        const next = text[j];
        if (next === undefined || next === ',' || next === '}' || next === ']' || next === ':') {
          inString = false;
          out += ch;
        } else {
          out += '\\"';
        }
        continue;
      }
      if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '\\r';
      else if (ch === '\t') out += '\\t';
      else out += ch;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j]!)) j++;
      if (text[j] === '}' || text[j] === ']') continue; // koma menggantung
    }
    out += ch;
  }

  return out;
}

/** Parse JSON, dengan satu percobaan perbaikan sintaks kalau gagal. */
function parseLenient<T>(candidate: string): T {
  try {
    return JSON.parse(candidate) as T;
  } catch (err) {
    try {
      return JSON.parse(repairJsonText(candidate)) as T;
    } catch {
      throw err; // laporkan error aslinya, lebih informatif
    }
  }
}

/** Ambil objek JSON pertama yang valid dari teks (tahan code fence & prosa). */
export function extractJson<T = unknown>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();

  try {
    return parseLenient<T>(candidate);
  } catch {
    // lanjut ke pencarian brace-matching
  }

  const startIdx = candidate.search(/[{[]/);
  if (startIdx === -1) {
    throw new GemmaError(`Output Gemma tidak mengandung JSON:\n${text.slice(0, 500)}`);
  }

  const open = candidate[startIdx] as '{' | '[';
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        const slice = candidate.slice(startIdx, i + 1);
        try {
          return parseLenient<T>(slice);
        } catch (err) {
          // Kutip liar bisa mengacaukan pelacakan string di atas, sehingga kurung
          // penutup yang ditemukan salah. Coba sekali lagi sampai kurung terakhir.
          const tail = candidate.slice(startIdx, candidate.lastIndexOf(close) + 1);
          if (tail.length > slice.length) {
            try {
              return parseLenient<T>(tail);
            } catch {
              // jatuh ke error di bawah
            }
          }
          throw new GemmaError(`JSON tidak valid: ${(err as Error).message}\n${slice.slice(0, 500)}`);
        }
      }
    }
  }

  // Belum ketemu kurung penutup — kemungkinan kutip liar mengacaukan pelacakan.
  const lastClose = candidate.lastIndexOf(close);
  if (lastClose > startIdx) {
    try {
      return parseLenient<T>(candidate.slice(startIdx, lastClose + 1));
    } catch {
      // jatuh ke error di bawah
    }
  }

  throw new GemmaError(`JSON tidak lengkap (kurung tidak tertutup):\n${candidate.slice(0, 500)}`);
}

/**
 * Structured output untuk agent Gemma Career OS (skor ATS, roadmap, ranking job, dst).
 * Suhu default diturunkan supaya output lebih deterministik.
 */
export async function chatJSON<T = unknown>(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<{ data: T; response: GemmaResponse }> {
  const guard =
    'Balas HANYA dengan JSON valid. Tanpa penjelasan, tanpa markdown, tanpa code fence.';
  const response = await chat(messages, {
    temperature: 0.2,
    ...options,
    system: options.system ? `${options.system}\n\n${guard}` : guard,
  });
  return { data: extractJson<T>(response.text), response };
}
