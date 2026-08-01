/**
 * ATS Specialist — membandingkan profil kandidat dengan job description.
 */

import { runAgent, twinToContext } from './shared';
import { AtsAnalysisSchema, type AtsAnalysis, type CareerTwin } from './types';

const SYSTEM = `Peranmu: ATS Specialist.
Tugas: menilai seberapa besar kemungkinan CV ini lolos filter ATS dan screening recruiter
untuk satu lowongan tertentu.

Cara menilai:
- matchedKeywords / missingKeywords diambil dari istilah yang benar-benar muncul di JD.
- hardBlockers = syarat wajib yang tidak dipenuhi sama sekali (mis. "minimal 5 tahun sebagai PM",
  sertifikasi wajib, bahasa wajib). Ini penyebab langsung penolakan otomatis.
- atsScore harus konsisten dengan temuan: kalau ada hardBlockers, skor TIDAK BOLEH di atas 55.
- Jangan memberi skor tinggi karena kandidat terlihat pintar — ATS tidak menilai potensi.
- recommendation: satu kalimat, langkah paling berdampak yang harus dilakukan lebih dulu.`;

export async function analyzeAts(
  twin: CareerTwin,
  jobDescription: string,
  onProgress?: (s: string) => void,
): Promise<AtsAnalysis> {
  return runAgent({
    name: 'ats_specialist',
    system: SYSTEM,
    user: [
      'Profil kandidat:',
      twinToContext(twin),
      '',
      'Job Description:',
      '---',
      jobDescription.slice(0, 12000),
      '---',
      '',
      'Keluarkan JSON: atsScore (0-100), matchedKeywords, missingKeywords,',
      'hardBlockers, formattingIssues, recommendation.',
    ].join('\n'),
    schema: AtsAnalysisSchema,
    options: { maxTokens: 3072 },
    onProgress,
  });
}
