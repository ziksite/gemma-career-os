/**
 * Resume Specialist — parsing CV mentah jadi data terstruktur, lalu memperbaikinya.
 */

import { runAgent, twinToContext } from './shared';
import {
  ResumeParseSchema,
  ResumeRewriteSchema,
  type ResumeParse,
  type ResumeRewrite,
} from './types';

const PARSE_SYSTEM = `Peranmu: Resume Specialist.
Tugas sekarang: mengubah teks CV mentah menjadi data terstruktur.

Aturan:
- Ekstrak hanya yang benar-benar tertulis. Jangan mengarang pengalaman atau skill.
- Level skill dinilai dari bukti di CV: disebut sekali = beginner, dipakai di proyek = intermediate,
  memimpin/mengajarkan = advanced, jadi rujukan tim = expert.
- "seniority" dinilai dari tanggung jawab, bukan hanya lama bekerja.
- "weaknesses" diisi celah yang terlihat dari CV (mis. tidak ada angka pencapaian,
  tidak ada pengalaman memimpin), bukan tebakan sifat pribadi.`;

export async function parseResume(
  resumeText: string,
  onProgress?: (s: string) => void,
): Promise<ResumeParse> {
  return runAgent({
    name: 'resume_specialist:parse',
    system: PARSE_SYSTEM,
    user: [
      'Teks CV:',
      '---',
      resumeText.slice(0, 20000),
      '---',
      '',
      'Keluarkan JSON dengan field: fullName, headline, summary, currentRole, industry,',
      'seniority (intern|junior|mid|senior|lead|manager|executive), yearsExperience (angka),',
      'skills (array {name, level, evidence}), experiences (array {role, company, startDate, endDate, highlights}),',
      'education (array {degree, institution, year}), certifications, languages, strengths, weaknesses.',
    ].join('\n'),
    schema: ResumeParseSchema,
    options: { maxTokens: 6144 },
    onProgress,
  });
}

const REWRITE_SYSTEM = `Peranmu: Resume Specialist.
Tugas sekarang: menulis ulang bagian CV agar lolos ATS dan meyakinkan recruiter.

Aturan penulisan:
- Setiap bullet: kata kerja aksi + apa yang dikerjakan + dampak terukur.
- Kalau CV asli tidak punya angka, JANGAN mengarang angka. Tulis placeholder eksplisit
  seperti "[isi: jumlah pengguna]" agar user melengkapi sendiri.
- Buang kata kosong: "bertanggung jawab atas", "membantu tim", "hardworking", "team player".
- Sisipkan keyword dari target role secara natural, bukan keyword stuffing.
- resumeQualityScore: 0-100 untuk kualitas CV SETELAH perbaikan.`;

export async function rewriteResume(
  parse: ResumeParse,
  targetRole: string,
  missingKeywords: string[] = [],
  onProgress?: (s: string) => void,
): Promise<ResumeRewrite> {
  return runAgent({
    name: 'resume_specialist:rewrite',
    system: REWRITE_SYSTEM,
    user: [
      'Profil kandidat:',
      twinToContext(parse),
      '',
      `Target role: ${targetRole}`,
      missingKeywords.length
        ? `Keyword yang kurang menurut ATS Specialist: ${missingKeywords.join(', ')}`
        : '',
      '',
      'Keluarkan JSON: summary (ringkasan profil baru, 2-3 kalimat),',
      'rewrittenHighlights (array {before, after, reason}) untuk maksimal 6 bullet terpenting,',
      'addedKeywords, removedFluff, resumeQualityScore.',
    ]
      .filter(Boolean)
      .join('\n'),
    schema: ResumeRewriteSchema,
    options: { maxTokens: 5120 },
    onProgress,
  });
}
