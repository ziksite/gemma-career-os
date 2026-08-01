/**
 * Job Hunter — merangking lowongan berdasarkan peluang lolos, bukan kemiripan kata.
 *
 * Catatan: pencarian lowongan live (scraping / job board API) belum ada. Agent ini
 * menerima daftar lowongan dari pemanggil, jadi sumbernya bisa diganti kapan saja.
 */

import { runAgent, twinToContext } from './shared';
import {
  JobRankingSchema,
  type CareerTwin,
  type JobPosting,
  type JobRanking,
} from './types';

const SYSTEM = `Peranmu: Job Hunter.
Tugas: menilai peluang kandidat lolos ke tahap interview untuk tiap lowongan, lalu merangkingnya.

Aturan penilaian:
- matchScore = estimasi peluang lolos screening (0-100), bukan seberapa menarik lowongannya.
- verdict:
  • apply_now      → matchScore >= 75
  • improve_first  → 45-74, gap-nya bisa ditutup dalam hitungan minggu
  • skip           → < 45, atau ada syarat wajib yang mustahil dipenuhi jangka pendek
- potentialScoreAfterUpskilling = perkiraan skor setelah missingRequirements ditutup.
  Isi null kalau gap-nya struktural (mis. butuh 5 tahun pengalaman yang tidak bisa dipercepat).
- Jangan memberi semua lowongan skor tinggi. Bedakan dengan tegas.
- reasons harus merujuk bukti spesifik dari profil dan JD.`;

export async function rankJobs(
  twin: CareerTwin,
  jobs: JobPosting[],
  onProgress?: (s: string) => void,
): Promise<JobRanking> {
  const catalog = jobs
    .map((j) =>
      [
        `[${j.id}] ${j.title} — ${j.company} (${j.location}, ${j.workType}${
          j.salaryIdr ? `, Rp${j.salaryIdr.toLocaleString('id-ID')}` : ''
        })`,
        j.description.slice(0, 2000),
      ].join('\n'),
    )
    .join('\n\n');

  return runAgent({
    name: 'job_hunter',
    system: SYSTEM,
    user: [
      'Profil kandidat:',
      twinToContext(twin),
      '',
      `Daftar lowongan (${jobs.length}):`,
      '---',
      catalog,
      '---',
      '',
      'Keluarkan JSON: matches (array {jobId, matchScore, verdict, reasons,',
      'missingRequirements, potentialScoreAfterUpskilling}) diurutkan dari matchScore tertinggi,',
      'dan summary (1-2 kalimat kesimpulan untuk kandidat).',
      'Wajib menilai SEMUA jobId yang diberikan.',
    ].join('\n'),
    schema: JobRankingSchema,
    options: { maxTokens: 6144 },
    onProgress,
  });
}
