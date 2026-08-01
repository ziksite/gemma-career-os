/**
 * Konfigurasi endpoint Gemma di Vertex AI (OpenAI-compatible surface).
 *
 * Ekuivalen dengan snippet resmi hackathon:
 *   ENDPOINT=aiplatform.googleapis.com
 *   REGION=global
 *   POST https://${ENDPOINT}/v1/projects/${PROJECT_ID}/locations/${REGION}/endpoints/openapi/chat/completions
 */

let envLoaded = false;

/** Load .env sekali saja (Node >= 20.12 punya process.loadEnvFile bawaan). */
export function loadEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  try {
    process.loadEnvFile('.env');
  } catch {
    // .env tidak ada — tidak masalah, env var bisa datang dari shell/hosting.
  }
}

export interface GemmaConfig {
  projectId: string;
  region: string;
  endpoint: string;
  model: string;
  maxTokens: number;
  temperature: number;
  enableThinking: boolean;
  /** URL lengkap chat/completions. */
  url: string;
}

function required(name: string, value: string | undefined): string {
  if (!value || value === 'YOUR_PROJECT_ID') {
    throw new Error(
      `[gemma] Env "${name}" belum diisi. Copy .env.example ke .env lalu isi ${name}.`,
    );
  }
  return value;
}

export function getConfig(overrides: Partial<GemmaConfig> = {}): GemmaConfig {
  loadEnv();

  const projectId =
    overrides.projectId ??
    required(
      'GOOGLE_CLOUD_PROJECT',
      process.env.GOOGLE_CLOUD_PROJECT ?? process.env.PROJECT_ID,
    );
  const region = overrides.region ?? process.env.VERTEX_REGION ?? 'global';
  const endpoint =
    overrides.endpoint ??
    process.env.VERTEX_ENDPOINT ??
    (region === 'global'
      ? 'aiplatform.googleapis.com'
      : `${region}-aiplatform.googleapis.com`);
  const model =
    overrides.model ?? process.env.GEMMA_MODEL ?? 'google/gemma-4-26b-a4b-it-maas';

  return {
    projectId,
    region,
    endpoint,
    model,
    maxTokens: overrides.maxTokens ?? Number(process.env.GEMMA_MAX_TOKENS ?? 8192),
    temperature:
      overrides.temperature ?? Number(process.env.GEMMA_TEMPERATURE ?? 0.7),
    // Default MATI. Diukur pada gemma-4-26b: thinking memakan ~1.900 karakter
    // sebelum jawaban mulai ditulis, sehingga output panjang (JSON agent) sering
    // terpotong max_tokens, dan latensinya naik drastis. Aktifkan hanya bila
    // memang butuh jejak penalaran.
    enableThinking:
      overrides.enableThinking ?? process.env.GEMMA_ENABLE_THINKING === 'true',
    url: `https://${endpoint}/v1/projects/${projectId}/locations/${region}/endpoints/openapi/chat/completions`,
  };
}
