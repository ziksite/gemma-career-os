/**
 * POST /api/onboarding
 *
 * Menjalankan alur pengguna inti dan mengalirkan progres tiap agent sebagai SSE,
 * supaya pengguna melihat AI-nya bekerja, bukan spinner kosong selama 1-2 menit.
 *
 * Event:
 *   {"type":"progress","status":"..."}
 *   {"type":"done","result":{...}}
 *   {"type":"error","message":"..."}
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JobPostingSchema, runOnboarding, type JobPosting } from '@/lib/agents';

export const runtime = 'nodejs';
/** Pipeline penuh memanggil Gemma 10 kali; beri ruang waktu yang cukup. */
export const maxDuration = 300;

let cachedJobs: JobPosting[] | null = null;

async function loadJobs(): Promise<JobPosting[]> {
  if (cachedJobs) return cachedJobs;
  const raw = await readFile(join(process.cwd(), 'data', 'sample-jobs.json'), 'utf8');
  cachedJobs = JobPostingSchema.array().parse(JSON.parse(raw));
  return cachedJobs;
}

/**
 * Terjemahkan error mentah Vertex AI jadi instruksi yang bisa ditindaklanjuti.
 * Token akses manual hanya hidup ~60 menit, jadi kasus ini pasti terjadi saat sesi panjang.
 */
function humanizeError(raw: string): string {
  if (/401|UNAUTHENTICATED|ACCESS_TOKEN_TYPE_UNSUPPORTED|invalid authentication/i.test(raw)) {
    return (
      'Token akses Google Cloud sudah kedaluwarsa atau tidak berlaku. ' +
      'Ambil token baru di Cloud Shell dengan "gcloud auth print-access-token", ' +
      'perbarui GOOGLE_ACCESS_TOKEN di file .env, lalu jalankan ulang server.'
    );
  }
  if (/403|PERMISSION_DENIED/i.test(raw)) {
    return (
      'Akun ini tidak punya izin memanggil Vertex AI pada project tersebut. ' +
      'Pastikan login memakai akun dari panitia dan GOOGLE_CLOUD_PROJECT sudah benar.'
    );
  }
  if (/404|not found|NOT_FOUND/i.test(raw)) {
    return (
      'Model Gemma tidak ditemukan pada project ini. ' +
      'Periksa kembali GOOGLE_CLOUD_PROJECT di file .env.'
    );
  }
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(raw)) {
    return 'Kuota Vertex AI sedang penuh. Tunggu sebentar lalu coba lagi.';
  }
  return raw;
}

export async function POST(req: Request) {
  let body: { resumeText?: string; goal?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body bukan JSON yang valid.' }, { status: 400 });
  }

  const resumeText = body.resumeText?.trim() ?? '';
  const goal = body.goal?.trim() ?? '';

  if (resumeText.length < 100) {
    return Response.json(
      { error: 'Teks CV terlalu pendek. Tempel CV lengkap agar analisisnya berarti.' },
      { status: 400 },
    );
  }
  if (!goal) {
    return Response.json({ error: 'Tujuan karier belum diisi.' }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // Klien menutup koneksi — abaikan.
        }
      };

      try {
        const jobs = await loadJobs();
        const result = await runOnboarding(resumeText, goal, jobs, (status) =>
          // Waktu dari server supaya log menampilkan kapan agent benar-benar berjalan,
          // bukan kapan browser kebetulan memproses event-nya.
          send({ type: 'progress', status, at: new Date().toISOString() }),
        );
        send({ type: 'done', result });
      } catch (err) {
        send({
          type: 'error',
          message: humanizeError(err instanceof Error ? err.message : String(err)),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
