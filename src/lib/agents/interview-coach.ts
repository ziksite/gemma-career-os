/**
 * Interview Coach — menyiapkan pertanyaan dan menilai jawaban mock interview.
 */

import { runAgent, twinToContext } from './shared';
import {
  InterviewFeedbackSchema,
  InterviewSetSchema,
  type CareerTwin,
  type InterviewFeedback,
  type InterviewSet,
} from './types';

const PREP_SYSTEM = `Peranmu: Interview Coach.
Tugas: menyusun set pertanyaan interview untuk satu posisi spesifik.

Aturan:
- Pertanyaan harus menyerang titik lemah kandidat, bukan hanya yang mudah dijawab.
  Kalau kandidat pindah jalur karier, tanyakan alasan pindah dan bukti kesiapannya.
- Campur kategori: behavioral, technical, situational, culture_fit.
- lookingFor menjelaskan sinyal apa yang dicari pewawancara dari jawaban itu.
- Gunakan gaya pertanyaan yang lazim dipakai perusahaan teknologi di Indonesia.`;

export async function prepareInterview(
  twin: CareerTwin,
  targetRole: string,
  jobDescription = '',
  count = 6,
  onProgress?: (s: string) => void,
): Promise<InterviewSet> {
  return runAgent({
    name: 'interview_coach:prepare',
    system: PREP_SYSTEM,
    user: [
      'Profil kandidat:',
      twinToContext(twin),
      '',
      `Posisi yang dilamar: ${targetRole}`,
      jobDescription ? `Job Description:\n${jobDescription.slice(0, 6000)}` : '',
      '',
      `Keluarkan JSON: questions (array ${count} item {id, question, category, lookingFor}),`,
      'focusAreas (area yang paling perlu dilatih kandidat).',
    ]
      .filter(Boolean)
      .join('\n'),
    schema: InterviewSetSchema,
    options: { maxTokens: 3072 },
    onProgress,
  });
}

const FEEDBACK_SYSTEM = `Peranmu: Interview Coach.
Tugas: menilai satu jawaban mock interview.

Aturan penilaian:
- contentScore    → substansi: ada situasi, aksi, dan hasil yang konkret?
- structureScore  → keterbacaan: pakai struktur STAR atau melompat-lompat?
- confidenceScore → ketegasan bahasa: hindari "sepertinya", "mungkin", "kurang tahu ya".
- overallScore    → gabungan, bukan rata-rata buta. Jawaban tanpa hasil terukur
  tidak boleh dapat overallScore di atas 70 meski disampaikan lancar.
- modelAnswer: contoh jawaban kuat MENGGUNAKAN pengalaman nyata kandidat dari profil,
  bukan cerita fiktif.`;

export async function evaluateAnswer(
  twin: CareerTwin,
  question: string,
  answer: string,
  onProgress?: (s: string) => void,
): Promise<InterviewFeedback> {
  return runAgent({
    name: 'interview_coach:evaluate',
    system: FEEDBACK_SYSTEM,
    user: [
      'Profil kandidat:',
      twinToContext(twin),
      '',
      `Pertanyaan: ${question}`,
      `Jawaban kandidat: ${answer}`,
      '',
      'Keluarkan JSON: contentScore, structureScore, confidenceScore, overallScore,',
      'strengths, improvements, modelAnswer.',
    ].join('\n'),
    schema: InterviewFeedbackSchema,
    options: { maxTokens: 3072 },
    onProgress,
  });
}
