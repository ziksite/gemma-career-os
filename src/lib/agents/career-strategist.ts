/**
 * Career Strategist — menerjemahkan tujuan karier jadi roadmap dan misi harian.
 */

import { runAgent, twinToContext } from './shared';
import {
  CareerGoalSchema,
  CareerPlanSchema,
  type CareerGoal,
  type CareerPlan,
  type CareerTwin,
} from './types';

const GOAL_SYSTEM = `Peranmu: Career Strategist.
Tugas: menerjemahkan kalimat bebas user menjadi tujuan karier terstruktur.

Aturan:
- Kalau user hanya menyebut gaji, tetap simpulkan targetRole yang paling masuk akal
  dari profilnya, dan catat gaji di targetSalaryIdr.
- Gaji selalu dinormalkan ke Rupiah per bulan (mis. "20 juta" → 20000000).
- Jangan menambah target perusahaan yang tidak disebut user.
- rawStatement diisi kalimat asli user apa adanya.`;

export async function parseGoal(
  goalStatement: string,
  twin: CareerTwin,
  onProgress?: (s: string) => void,
): Promise<CareerGoal> {
  return runAgent({
    name: 'career_strategist:goal',
    system: GOAL_SYSTEM,
    user: [
      'Profil kandidat:',
      twinToContext(twin),
      '',
      `Kalimat user: "${goalStatement}"`,
      '',
      'Keluarkan JSON: targetRole, targetSalaryIdr (angka atau null), targetIndustries,',
      'targetCompanies, workPreference (onsite|hybrid|remote|any), rawStatement.',
    ].join('\n'),
    schema: CareerGoalSchema,
    options: { maxTokens: 1024 },
    onProgress,
  });
}

const PLAN_SYSTEM = `Peranmu: Career Strategist.
Tugas: menyusun rencana dari posisi kandidat sekarang menuju target kariernya.

Aturan:
- gapAssessment harus jujur. Kalau lompatannya terlalu jauh, katakan dan sarankan
  posisi antara yang realistis.
- feasibility: realistic (< 3 bulan), stretch (3-9 bulan), unrealistic (> 9 bulan atau
  butuh perubahan mendasar).
- milestones: maksimal 6, tiap milestone punya outcome yang bisa diverifikasi.
- dailyMissions: 5 hari pertama saja, 2-3 tugas per hari, tiap tugas < 90 menit.
  Isi field "agent" dengan agent Gemma Career OS yang membantu tugas itu
  (resume_specialist, ats_specialist, job_hunter, skill_mentor, interview_coach).
- risks: hal yang bisa menggagalkan rencana ini, spesifik ke situasi kandidat.`;

export async function buildCareerPlan(
  twin: CareerTwin,
  goal: CareerGoal,
  context: { atsScore?: number; skillGaps?: string[] } = {},
  onProgress?: (s: string) => void,
): Promise<CareerPlan> {
  return runAgent({
    name: 'career_strategist:plan',
    system: PLAN_SYSTEM,
    user: [
      'Profil kandidat:',
      twinToContext({ ...twin, goal }),
      '',
      context.atsScore !== undefined
        ? `Skor ATS terhadap lowongan target: ${context.atsScore}/100`
        : '',
      context.skillGaps?.length ? `Gap skill: ${context.skillGaps.join(', ')}` : '',
      '',
      'Keluarkan JSON: gapAssessment, feasibility (realistic|stretch|unrealistic),',
      'estimatedWeeksToTarget, milestones (array {week, title, outcome, tasks}),',
      'dailyMissions (array {day, tasks:[{title, agent, estimatedMinutes}]}), risks.',
    ]
      .filter(Boolean)
      .join('\n'),
    schema: CareerPlanSchema,
    options: { maxTokens: 6144 },
    onProgress,
  });
}
