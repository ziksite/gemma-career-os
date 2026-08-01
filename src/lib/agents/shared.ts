/**
 * Fondasi semua agent Gemma Career OS.
 *
 * runAgent() = panggil Gemma → validasi Zod → kalau gagal, kirim error validasi
 * balik ke Gemma sekali untuk perbaikan. Ini yang bikin output agent bisa langsung
 * masuk database tanpa defensive check di mana-mana.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { z } from 'zod';
import { chat, extractJson, GemmaError } from '../gemma/index';
import type { ChatMessage, ChatOptions, GemmaResponse } from '../gemma/index';

/**
 * Semua agent memanggil Gemma lewat satu titik ini. Bisa ditukar untuk keperluan
 * pengujian offline, caching, atau kalau nanti perlu model lain untuk tugas ringan.
 */
export type CompletionBackend = (
  messages: ChatMessage[],
  options: ChatOptions,
) => Promise<GemmaResponse>;

let backend: CompletionBackend = chat;

export function setCompletionBackend(fn: CompletionBackend): void {
  backend = fn;
}

export function resetCompletionBackend(): void {
  backend = chat;
}

/** Persona bersama — semua agent adalah satu "Gemma" di mata pengguna. */
export const BASE_PERSONA = `Kamu bagian dari Gemma Career OS, AI Career Operating System.
Prinsip kerjamu:
- Jujur, bukan menyenangkan. Kalau peluang kandidat kecil, katakan apa adanya beserta alasannya.
- Berbasis bukti dari CV dan job description, bukan asumsi umum.
- Setiap penilaian harus bisa ditindaklanjuti: sebut langkah konkret, bukan saran generik.
- Konteks pasar kerja Indonesia (LinkedIn, Jobstreet, Glints, Kalibrr; gaji dalam Rupiah).
- Bahasa Indonesia yang lugas dan profesional.`;

export interface AgentTrace {
  agent: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  repaired: boolean;
  /** Kenapa perlu diulang — untuk membedakan output terpotong vs schema meleset. */
  repairReason?: string;
  ok: boolean;
  error?: string;
}

/**
 * Riwayat pemanggilan agent — dipakai UI untuk menampilkan progres.
 *
 * Disimpan per-eksekusi lewat AsyncLocalStorage, bukan satu array global. Kalau global,
 * dua request yang berjalan bersamaan di server akan saling menimpa trace-nya.
 * Fallback ke array global dipertahankan untuk pemakaian dari CLI.
 */
const traceStore = new AsyncLocalStorage<AgentTrace[]>();
const globalTraces: AgentTrace[] = [];

function currentTraces(): AgentTrace[] {
  return traceStore.getStore() ?? globalTraces;
}

export function getTraces(): readonly AgentTrace[] {
  return currentTraces();
}

export function clearTraces(): void {
  currentTraces().length = 0;
}

/** Jalankan fn dengan koleksi trace sendiri, terisolasi dari eksekusi lain. */
export function withTraceScope<T>(fn: () => Promise<T>): Promise<T> {
  return traceStore.run([], fn);
}

export interface AgentCallSpec<S extends z.ZodTypeAny> {
  /** Nama agent, muncul di trace dan log. */
  name: string;
  /** System prompt spesifik agent (BASE_PERSONA otomatis di-prepend). */
  system: string;
  /** Isi tugas untuk panggilan ini. */
  user: string;
  schema: S;
  options?: ChatOptions;
  /** Callback progres, untuk streaming status ke UI. */
  onProgress?: (status: string) => void;
}

function describeIssues(err: z.ZodError): string {
  return err.issues
    .map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
}

const DEFAULT_MAX_TOKENS = 4096;

/**
 * Jalankan satu agent dengan output terstruktur tervalidasi.
 *
 * Dua jaring pengaman, keduanya berasal dari kegagalan nyata saat diuji ke Vertex AI:
 *   1. Output terpotong (finish_reason "length") → ulangi dengan max_tokens dua kali lipat.
 *   2. Bentuk JSON tidak sesuai schema → kirim balik error validasinya ke Gemma.
 */
export async function runAgent<S extends z.ZodTypeAny>(
  spec: AgentCallSpec<S>,
): Promise<z.infer<S>> {
  const { name, system, user, schema, options = {}, onProgress } = spec;
  const started = Date.now();
  onProgress?.(`${name} bekerja...`);

  const fullSystem = [
    BASE_PERSONA,
    '',
    system,
    '',
    'Balas HANYA dengan JSON valid. Tanpa penjelasan, tanpa markdown, tanpa code fence.',
  ].join('\n');
  let repaired = false;
  let repairReason: string | undefined;

  try {
    const baseOptions = {
      system: fullSystem,
      temperature: 0.2,
      // Thinking dimatikan untuk output terstruktur: ia memakan jatah token yang
      // dibutuhkan JSON, dan menambah latensi tanpa memperbaiki kepatuhan schema.
      enableThinking: false,
      maxTokens: DEFAULT_MAX_TOKENS,
      ...options,
    };

    let first = await backend([{ role: 'user', content: user }], baseOptions);
    let firstData: unknown;

    try {
      if (first.finishReason === 'length') {
        throw new GemmaError('Output terpotong sebelum JSON selesai.');
      }
      firstData = extractJson<unknown>(first.text);
    } catch (err) {
      // Ruang tulis kurang. Coba sekali lagi dengan jatah token dua kali lipat.
      repaired = true;
      repairReason = `output tidak terbaca: ${err instanceof Error ? err.message : String(err)}`;
      onProgress?.(`${name} mengulang dengan ruang output lebih besar...`);

      first = await backend([{ role: 'user', content: user }], {
        ...baseOptions,
        maxTokens: (baseOptions.maxTokens ?? DEFAULT_MAX_TOKENS) * 2,
      });

      try {
        firstData = extractJson<unknown>(first.text);
      } catch (err2) {
        // Masih tidak terbaca. Kirim balik teksnya dan minta JSON yang sah.
        repairReason = `sintaks JSON rusak: ${err2 instanceof Error ? err2.message : String(err2)}`;
        onProgress?.(`${name} memperbaiki sintaks JSON...`);

        const fix = await backend(
          [
            { role: 'user', content: user },
            { role: 'assistant', content: first.text.slice(0, 12000) },
            {
              role: 'user',
              content: [
                'Teks di atas bukan JSON yang sah dan gagal di-parse.',
                'Kirim ulang isi yang sama sebagai JSON valid.',
                'Perhatikan: tanda kutip ganda di dalam nilai teks harus di-escape (\\") atau diganti kutip tunggal.',
                'Hanya JSON, tanpa penjelasan apa pun.',
              ].join('\n'),
            },
          ],
          { ...baseOptions, temperature: 0.1 },
        );
        firstData = extractJson<unknown>(fix.text);
      }
    }

    let parsed = schema.safeParse(firstData);

    if (!parsed.success) {
      // Repair pass: tunjukkan output sebelumnya + error validasinya.
      repaired = true;
      repairReason = `schema meleset: ${describeIssues(parsed.error).replace(/\n/g, ' | ')}`;
      onProgress?.(`${name} memperbaiki format output...`);

      const repair = await backend(
        [
          { role: 'user', content: user },
          { role: 'assistant', content: JSON.stringify(firstData) },
          {
            role: 'user',
            content: [
              'JSON di atas tidak lolos validasi schema:',
              describeIssues(parsed.error),
              '',
              'Kirim ulang JSON lengkap yang sudah diperbaiki. Hanya JSON, tanpa penjelasan.',
            ].join('\n'),
          },
        ],
        { ...baseOptions, temperature: 0.1 },
      );

      parsed = schema.safeParse(extractJson(repair.text));

      if (!parsed.success) {
        throw new GemmaError(
          `Agent "${name}" gagal menghasilkan output valid setelah repair:\n${describeIssues(parsed.error)}`,
        );
      }
    }

    currentTraces().push({
      agent: name,
      latencyMs: Date.now() - started,
      promptTokens: first.usage?.promptTokens ?? 0,
      completionTokens: first.usage?.completionTokens ?? 0,
      repaired,
      repairReason,
      ok: true,
    });

    onProgress?.(`${name} selesai.`);
    return parsed.data;
  } catch (err) {
    currentTraces().push({
      agent: name,
      latencyMs: Date.now() - started,
      promptTokens: 0,
      completionTokens: 0,
      repaired,
      repairReason,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** Ringkas Career Twin jadi konteks padat untuk prompt agent lain. */
export function twinToContext(twin: {
  headline?: string;
  currentRole?: string;
  seniority?: string;
  yearsExperience?: number;
  industry?: string;
  skills?: Array<{ name: string; level: string }>;
  experiences?: Array<{ role: string; company: string; highlights: string[] }>;
  certifications?: string[];
  goal?: { targetRole: string; rawStatement: string } | null;
}): string {
  const lines = [
    `Peran saat ini: ${twin.currentRole || '-'} (${twin.seniority || '-'}, ${twin.yearsExperience ?? 0} tahun pengalaman)`,
    `Industri: ${twin.industry || '-'}`,
    `Skill: ${(twin.skills ?? []).map((s) => `${s.name} (${s.level})`).join(', ') || '-'}`,
    `Sertifikasi: ${(twin.certifications ?? []).join(', ') || '-'}`,
    'Pengalaman:',
    ...(twin.experiences ?? []).map(
      (e) => `  • ${e.role} @ ${e.company}: ${e.highlights.slice(0, 3).join('; ') || '-'}`,
    ),
  ];
  if (twin.goal) {
    lines.push(`Target karier: ${twin.goal.targetRole} — "${twin.goal.rawStatement}"`);
  }
  return lines.join('\n');
}
