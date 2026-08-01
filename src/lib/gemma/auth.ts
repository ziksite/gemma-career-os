/**
 * Penyedia access token untuk Vertex AI.
 *
 * Urutan prioritas:
 *   1. GOOGLE_ACCESS_TOKEN        → token manual (hasil `gcloud auth print-access-token`)
 *   2. GOOGLE_APPLICATION_CREDENTIALS / ADC → via google-auth-library (service account)
 *   3. gcloud CLI                 → `gcloud auth print-access-token`
 *
 * Token di-cache di memori sampai mendekati expiry, jadi tidak minting ulang tiap request.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { GoogleAuth } from 'google-auth-library';
import { loadEnv } from './config';

const execAsync = promisify(exec);

const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
/** Refresh 2 menit sebelum benar-benar expired. */
const EXPIRY_BUFFER_MS = 120_000;

interface CachedToken {
  token: string;
  expiresAt: number;
  source: string;
}

let cache: CachedToken | null = null;
let googleAuth: GoogleAuth | null = null;
let inFlight: Promise<CachedToken> | null = null;

async function fromAdc(): Promise<CachedToken | null> {
  try {
    googleAuth ??= new GoogleAuth({ scopes: [SCOPE] });
    const client = await googleAuth.getClient();
    const res = await client.getAccessToken();
    if (!res.token) return null;

    // google-auth-library menyimpan expiry di credentials setelah refresh.
    const expiry = (client as { credentials?: { expiry_date?: number } }).credentials
      ?.expiry_date;
    return {
      token: res.token,
      expiresAt: expiry ?? Date.now() + 55 * 60_000,
      source: process.env.GOOGLE_APPLICATION_CREDENTIALS
        ? 'service-account'
        : 'application-default-credentials',
    };
  } catch {
    return null;
  }
}

async function fromGcloudCli(): Promise<CachedToken | null> {
  const candidates =
    process.platform === 'win32' ? ['gcloud.cmd', 'gcloud'] : ['gcloud'];

  for (const bin of candidates) {
    try {
      // Command string tetap (tanpa input user), jadi aman dijalankan lewat shell.
      const { stdout } = await execAsync(`${bin} auth print-access-token`, {
        timeout: 30_000,
      });
      const token = stdout.trim();
      if (token) {
        // gcloud tidak melaporkan expiry; token OAuth Google umurnya ~60 menit.
        return { token, expiresAt: Date.now() + 55 * 60_000, source: 'gcloud-cli' };
      }
    } catch {
      // coba kandidat berikutnya
    }
  }
  return null;
}

async function mint(): Promise<CachedToken> {
  loadEnv();

  const manual = process.env.GOOGLE_ACCESS_TOKEN?.trim();
  if (manual) {
    // Token manual tidak punya metadata expiry — asumsikan sisa umur konservatif.
    return { token: manual, expiresAt: Date.now() + 50 * 60_000, source: 'env-token' };
  }

  const adc = await fromAdc();
  if (adc) return adc;

  const cli = await fromGcloudCli();
  if (cli) return cli;

  throw new Error(
    '[gemma] Tidak menemukan kredensial Google Cloud. Pilih salah satu:\n' +
      '  1) set GOOGLE_ACCESS_TOKEN=<hasil `gcloud auth print-access-token`> di .env\n' +
      '  2) set GOOGLE_APPLICATION_CREDENTIALS=<path service-account.json> di .env\n' +
      '  3) install gcloud SDK lalu jalankan `gcloud auth application-default login`',
  );
}

/** Ambil access token yang valid (cached). */
export async function getAccessToken(): Promise<string> {
  if (cache && Date.now() < cache.expiresAt - EXPIRY_BUFFER_MS) {
    return cache.token;
  }
  inFlight ??= mint().finally(() => {
    inFlight = null;
  });
  cache = await inFlight;
  return cache.token;
}

/** Sumber kredensial yang terakhir dipakai — berguna untuk logging/diagnostik. */
export function getAuthSource(): string | null {
  return cache?.source ?? null;
}

/** Buang cache token (dipakai saat server balas 401). */
export function clearTokenCache(): void {
  cache = null;
}
