/**
 * Skill Mentor — mengubah gap skill jadi rencana belajar yang terukur.
 */

import { runAgent, twinToContext } from './shared';
import {
  LearningRoadmapSchema,
  type CareerTwin,
  type LearningRoadmap,
} from './types';

const SYSTEM = `Peranmu: Skill Mentor.
Tugas: menyusun roadmap belajar yang paling cepat menaikkan peluang kandidat diterima.

Aturan:
- Urutkan berdasarkan dampak per jam belajar, bukan urutan abjad atau tingkat kesulitan.
- Maksimal 5 langkah. Roadmap yang terlalu panjang tidak akan dijalankan.
- estimatedHours harus realistis untuk orang yang masih bekerja penuh waktu (5-10 jam/minggu).
- proofOfWork wajib berupa artefak yang bisa ditaruh di CV atau portofolio
  (mis. "dashboard analisis funnel di Looker Studio dengan data publik"),
  bukan "menyelesaikan kursus".
- resources: sebutkan platform yang benar-benar ada dan mudah diakses dari Indonesia.
- expectedScoreGain: kenaikan peluang diterima setelah SEMUA langkah selesai. Konservatif saja —
  menutup gap skill tidak menghapus gap pengalaman.`;

export async function buildLearningRoadmap(
  twin: CareerTwin,
  gaps: string[],
  targetRole: string,
  onProgress?: (s: string) => void,
): Promise<LearningRoadmap> {
  return runAgent({
    name: 'skill_mentor',
    system: SYSTEM,
    user: [
      'Profil kandidat:',
      twinToContext(twin),
      '',
      `Target role: ${targetRole}`,
      `Gap yang terdeteksi agent lain: ${gaps.join(', ') || '(belum ada, tentukan sendiri dari profil)'}`,
      '',
      'Keluarkan JSON: steps (array {skill, why, estimatedHours, resources, proofOfWork}),',
      'totalEstimatedHours, expectedScoreGain, rationale.',
    ].join('\n'),
    schema: LearningRoadmapSchema,
    options: { maxTokens: 4096 },
    onProgress,
  });
}
