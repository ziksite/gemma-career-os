/**
 * Career Health Score — satu angka yang diberitahukan ke pengguna di dashboard.
 *
 * Keputusan desain: agregasi skor dilakukan DETERMINISTIK, bukan ditanyakan ke LLM.
 * Skor yang sama harus selalu menghasilkan angka yang sama, kalau tidak pengguna
 * akan melihat Career Health mereka naik-turun sendiri tanpa melakukan apa pun.
 * Gemma hanya dipakai untuk menjelaskan angkanya.
 */

import { runAgent, twinToContext } from './shared';
import {
  HealthComponentsSchema,
  HealthExplanationSchema,
  type CareerTwin,
  type HealthComponents,
  type HealthExplanation,
} from './types';

/** Bobot tiap komponen. Total = 1.0 */
export const HEALTH_WEIGHTS: Record<keyof HealthComponents, number> = {
  resumeQuality: 0.15,
  atsCompatibility: 0.2,
  experienceRelevance: 0.2,
  skillRelevancy: 0.2,
  portfolioStrength: 0.08,
  interviewReadiness: 0.12,
  marketDemand: 0.05,
};

export interface CareerHealth {
  score: number;
  components: HealthComponents;
  /** Komponen dengan kontribusi hilang terbesar (bobot × kekurangan). */
  weakestComponent: keyof HealthComponents;
}

/** Hitung Career Health Score. Fungsi murni — mudah diuji, hasilnya stabil. */
export function computeCareerHealth(input: Partial<HealthComponents>): CareerHealth {
  const components = HealthComponentsSchema.parse({
    resumeQuality: input.resumeQuality ?? 50,
    atsCompatibility: input.atsCompatibility ?? 50,
    experienceRelevance: input.experienceRelevance ?? 50,
    skillRelevancy: input.skillRelevancy ?? 50,
    portfolioStrength: input.portfolioStrength ?? 40,
    interviewReadiness: input.interviewReadiness ?? 40,
    marketDemand: input.marketDemand ?? 60,
  });

  let score = 0;
  let weakest: keyof HealthComponents = 'resumeQuality';
  let worstLoss = -1;

  for (const key of Object.keys(HEALTH_WEIGHTS) as Array<keyof HealthComponents>) {
    const weight = HEALTH_WEIGHTS[key];
    score += components[key] * weight;

    // Yang dicari: komponen di mana perbaikan memberi kenaikan skor terbesar.
    const loss = (100 - components[key]) * weight;
    if (loss > worstLoss) {
      worstLoss = loss;
      weakest = key;
    }
  }

  return { score: Math.round(score), components, weakestComponent: weakest };
}

const SYSTEM = `Peranmu: Career Strategist yang menjelaskan Career Health Score.

Aturan:
- Angka skor sudah dihitung sistem. JANGAN menghitung ulang atau membantahnya.
- biggestBlocker: sebut SATU penyebab utama, dengan bahasa yang dimengerti orang awam
  (bukan nama variabel seperti "atsCompatibility").
- explanation: 2-3 kalimat. Jelaskan mengapa komponen itu menahan skor, dan dampaknya
  pada peluang kerja.
- quickWins: maksimal 3 tindakan yang bisa diselesaikan dalam 1-2 hari dan langsung
  menaikkan skor. Harus spesifik ke profil ini.`;

/** Terjemahkan angka jadi penjelasan yang bisa ditindaklanjuti. */
export async function explainCareerHealth(
  health: CareerHealth,
  twin: CareerTwin,
  onProgress?: (s: string) => void,
): Promise<HealthExplanation> {
  const breakdown = (Object.keys(health.components) as Array<keyof HealthComponents>)
    .map((k) => `  ${k}: ${health.components[k]}/100 (bobot ${HEALTH_WEIGHTS[k]})`)
    .join('\n');

  return runAgent({
    name: 'career_health:explain',
    system: SYSTEM,
    user: [
      'Profil kandidat:',
      twinToContext(twin),
      '',
      `Career Health Score: ${health.score}/100`,
      'Rincian komponen:',
      breakdown,
      `Komponen terlemah menurut sistem: ${health.weakestComponent}`,
      '',
      'Keluarkan JSON: biggestBlocker, explanation, quickWins.',
    ].join('\n'),
    schema: HealthExplanationSchema,
    options: { maxTokens: 1536 },
    onProgress,
  });
}
