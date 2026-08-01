/**
 * Career Twin — profil digital pengguna yang terus tumbuh.
 *
 * Keputusan desain: penggabungan state dilakukan secara DETERMINISTIK di kode,
 * bukan diserahkan ke LLM. Menyuruh model "update profil ini" berisiko menghapus
 * atau mengarang data lama. Gemma hanya dipakai untuk hal yang butuh penilaian —
 * yaitu menulis ulang headline & summary setelah profil berubah.
 */

import { runAgent, twinToContext } from './shared';
import { z } from 'zod';
import {
  CareerTwinSchema,
  type CareerGoal,
  type CareerTwin,
  type ResumeParse,
  type Skill,
} from './types';

export interface TwinEvent {
  type:
    | 'skill_learned'
    | 'application_sent'
    | 'interview_done'
    | 'certification_added'
    | 'goal_changed';
  payload: Record<string, unknown>;
  at: string;
}

/** Bentuk Career Twin awal dari hasil parsing CV + tujuan karier. */
export function createTwin(
  parse: ResumeParse,
  goal: CareerGoal | null,
  now: string,
): CareerTwin {
  return CareerTwinSchema.parse({ ...parse, goal, updatedAt: now });
}

function mergeSkills(existing: Skill[], incoming: Skill[]): Skill[] {
  const byName = new Map(existing.map((s) => [s.name.toLowerCase(), s]));
  const order: Skill['level'][] = ['beginner', 'intermediate', 'advanced', 'expert'];

  for (const skill of incoming) {
    const key = skill.name.toLowerCase();
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, skill);
      continue;
    }
    // Level hanya naik — belajar tidak membuat orang jadi lebih tidak mampu.
    const better =
      order.indexOf(skill.level) > order.indexOf(prev.level) ? skill.level : prev.level;
    byName.set(key, {
      ...prev,
      level: better,
      evidence: skill.evidence || prev.evidence,
    });
  }
  return [...byName.values()];
}

/** Terapkan satu event ke Career Twin. Murni, tanpa memanggil LLM. */
export function applyEvent(twin: CareerTwin, event: TwinEvent): CareerTwin {
  const next: CareerTwin = { ...twin, updatedAt: event.at };

  switch (event.type) {
    case 'skill_learned': {
      const skill = event.payload.skill as Skill | undefined;
      if (skill) next.skills = mergeSkills(twin.skills, [skill]);
      break;
    }
    case 'certification_added': {
      const cert = event.payload.certification as string | undefined;
      if (cert && !twin.certifications.includes(cert)) {
        next.certifications = [...twin.certifications, cert];
      }
      break;
    }
    case 'goal_changed': {
      next.goal = (event.payload.goal as CareerGoal | undefined) ?? twin.goal;
      break;
    }
    case 'interview_done':
    case 'application_sent':
      // Riwayat lamaran/interview disimpan di tabel terpisah (Application Tracker);
      // di sini hanya menandai profil sudah bergerak.
      break;
  }
  return next;
}

const REFRESH_SYSTEM = `Peranmu: Career Twin.
Tugas: menulis ulang headline dan summary profil agar selaras dengan target karier terbaru.

Aturan:
- headline: satu baris, maksimal 12 kata, menyebut posisi yang dituju dan kekuatan utama.
- summary: 2-3 kalimat, hanya berdasarkan pengalaman dan skill yang ADA di profil.
- Jangan menambahkan kemampuan yang tidak tercantum.
- Kalau kandidat sedang pindah jalur karier, jembatani pengalaman lama ke target baru
  secara eksplisit — jangan sembunyikan latar belakangnya.`;

const RefreshSchema = z.object({
  headline: z.string(),
  summary: z.string(),
});

/** Segarkan headline & summary setelah profil atau target berubah. */
export async function refreshNarrative(
  twin: CareerTwin,
  onProgress?: (s: string) => void,
): Promise<CareerTwin> {
  const result = await runAgent({
    name: 'career_twin:refresh',
    system: REFRESH_SYSTEM,
    user: [
      'Profil terkini:',
      twinToContext(twin),
      '',
      `Headline sekarang: ${twin.headline || '-'}`,
      '',
      'Keluarkan JSON: headline, summary.',
    ].join('\n'),
    schema: RefreshSchema,
    options: { maxTokens: 1024 },
    onProgress,
  });

  return { ...twin, headline: result.headline, summary: result.summary };
}
