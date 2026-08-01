export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatOptions {
  /** Override model, default dari env GEMMA_MODEL. */
  model?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
  /** Aktifkan reasoning trace Gemma (chat_template_kwargs.enable_thinking). */
  enableThinking?: boolean;
  /** Prompt sistem, di-prepend sebagai message role "system". */
  system?: string;
  /** Jumlah percobaan saat kena 429/5xx. Default 3. */
  retries?: number;
  /** Timeout per request (ms). Default 120000. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface GemmaResponse {
  /** Jawaban final, sudah bersih dari blok thinking. */
  text: string;
  /** Reasoning trace kalau enableThinking aktif dan model mengembalikannya. */
  thinking: string | null;
  finishReason: string | null;
  usage: TokenUsage | null;
  model: string;
  /** Payload mentah dari Vertex AI, untuk debugging. */
  raw: unknown;
  /** Durasi request (ms). */
  latencyMs: number;
}

export class GemmaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'GemmaError';
  }
}
