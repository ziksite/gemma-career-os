/**
 * Orchestrator — Gemma sebagai pengatur agent, bukan sekadar penjawab.
 *
 * Dua mode:
 *   runOnboarding()  Pipeline tetap untuk alur pengguna inti. Urutannya deterministik
 *                    karena tiap tahap memang bergantung pada output tahap sebelumnya,
 *                    dan alur inti harus bisa diandalkan saat demo.
 *   route()          Untuk input bebas. Di sini Gemma yang memutuskan agent mana
 *                    yang relevan — inilah bagian agentic-nya.
 */

import { analyzeAts } from './ats-specialist';
import { buildCareerPlan, parseGoal } from './career-strategist';
import { computeCareerHealth, explainCareerHealth, type CareerHealth } from './career-health';
import { createTwin, refreshNarrative } from './career-twin';
import { prepareInterview } from './interview-coach';
import { rankJobs } from './job-hunter';
import { parseResume, rewriteResume } from './resume-specialist';
import {
  clearTraces,
  getTraces,
  runAgent,
  twinToContext,
  withTraceScope,
  type AgentTrace,
} from './shared';
import {
  AGENT_NAMES,
  RoutingDecisionSchema,
  type AtsAnalysis,
  type CareerPlan,
  type CareerTwin,
  type HealthExplanation,
  type InterviewSet,
  type JobPosting,
  type JobRanking,
  type LearningRoadmap,
  type ResumeRewrite,
  type RoutingDecision,
} from './types';
import { buildLearningRoadmap } from './skill-mentor';

export interface OnboardingResult {
  twin: CareerTwin;
  jobRanking: JobRanking;
  ats: AtsAnalysis;
  resumeRewrite: ResumeRewrite;
  learningRoadmap: LearningRoadmap;
  careerPlan: CareerPlan;
  interviewSet: InterviewSet;
  health: CareerHealth;
  healthExplanation: HealthExplanation;
  /** Lowongan dengan peluang tertinggi — dipakai sebagai fokus analisis. */
  targetJob: JobPosting;
  /** Semua lowongan yang dianalisis, supaya UI bisa menampilkan detailnya. */
  jobs: JobPosting[];
  traces: AgentTrace[];
  totalLatencyMs: number;
}

/**
 * Turunkan komponen Career Health dari output agent.
 * Heuristiknya sengaja eksplisit dan deterministik supaya skor bisa dipertanggungjawabkan.
 */
function deriveHealthComponents(args: {
  ats: AtsAnalysis;
  ranking: JobRanking;
  rewrite: ResumeRewrite;
  twin: CareerTwin;
}) {
  const { ats, ranking, rewrite, twin } = args;
  const scores = ranking.matches.map((m) => m.matchScore);
  const top3 = [...scores].sort((a, b) => b - a).slice(0, 3);

  const keywordTotal = ats.matchedKeywords.length + ats.missingKeywords.length;
  const skillRelevancy = keywordTotal
    ? Math.round((ats.matchedKeywords.length / keywordTotal) * 100)
    : 50;

  // Portofolio dinilai dari bukti nyata di CV: sertifikasi + bullet yang berisi angka.
  const quantifiedHighlights = twin.experiences
    .flatMap((e) => e.highlights)
    .filter((h) => /\d/.test(h)).length;
  const portfolioStrength = Math.min(
    100,
    twin.certifications.length * 15 + quantifiedHighlights * 10,
  );

  // Permintaan pasar: berapa persen lowongan yang dinilai layak dikejar.
  const viable = scores.filter((s) => s >= 60).length;
  const marketDemand = scores.length
    ? Math.round((viable / scores.length) * 100)
    : 50;

  return {
    resumeQuality: rewrite.resumeQualityScore,
    atsCompatibility: ats.atsScore,
    experienceRelevance: top3.length
      ? Math.round(top3.reduce((a, b) => a + b, 0) / top3.length)
      : 50,
    skillRelevancy,
    portfolioStrength,
    // Belum ada mock interview yang dikerjakan user pada tahap onboarding.
    interviewReadiness: 40,
    marketDemand,
  };
}

/**
 * Alur pengguna inti: CV + tujuan karier → dashboard lengkap.
 */
export function runOnboarding(
  resumeText: string,
  goalStatement: string,
  jobs: JobPosting[],
  onProgress: (status: string) => void = () => {},
): Promise<OnboardingResult> {
  if (!jobs.length) {
    return Promise.reject(
      new Error('[orchestrator] Butuh minimal satu lowongan untuk dianalisis.'),
    );
  }
  // Trace dikumpulkan per-eksekusi supaya dua request bersamaan tidak saling menimpa.
  return withTraceScope(() => onboardingPipeline(resumeText, goalStatement, jobs, onProgress));
}

async function onboardingPipeline(
  resumeText: string,
  goalStatement: string,
  jobs: JobPosting[],
  onProgress: (status: string) => void,
): Promise<OnboardingResult> {
  clearTraces();
  const started = Date.now();
  const now = new Date().toISOString();

  // 1. Baca CV.
  const parse = await parseResume(resumeText, onProgress);

  // 2. Pahami tujuan karier (butuh profil agar tujuan yang kabur bisa disimpulkan).
  const goal = await parseGoal(goalStatement, { ...parse, goal: null, updatedAt: now }, onProgress);

  // 3. Bentuk Career Twin, lalu selaraskan narasinya dengan target.
  let twin = createTwin(parse, goal, now);
  twin = await refreshNarrative(twin, onProgress);

  // 4. Rangking lowongan ∥ siapkan interview — keduanya hanya butuh twin.
  const [ranking, interviewSet] = await Promise.all([
    rankJobs(twin, jobs, onProgress),
    prepareInterview(twin, goal.targetRole, '', 6, onProgress),
  ]);

  // 5. Analisis ATS terhadap lowongan berpeluang tertinggi.
  const best = [...ranking.matches].sort((a, b) => b.matchScore - a.matchScore)[0];
  const targetJob = jobs.find((j) => j.id === best?.jobId) ?? jobs[0]!;
  const ats = await analyzeAts(twin, targetJob.description, onProgress);

  // 6. Gap dari ATS jadi masukan tiga agent berikutnya.
  const gaps = [...new Set([...ats.missingKeywords, ...(best?.missingRequirements ?? [])])];

  const [resumeRewrite, learningRoadmap, careerPlan] = await Promise.all([
    rewriteResume(parse, goal.targetRole, ats.missingKeywords, onProgress),
    buildLearningRoadmap(twin, gaps, goal.targetRole, onProgress),
    buildCareerPlan(twin, goal, { atsScore: ats.atsScore, skillGaps: gaps }, onProgress),
  ]);

  // 7. Career Health: hitung deterministik, jelaskan dengan Gemma.
  const health = computeCareerHealth(
    deriveHealthComponents({ ats, ranking, rewrite: resumeRewrite, twin }),
  );
  const healthExplanation = await explainCareerHealth(health, twin, onProgress);

  return {
    twin,
    jobRanking: ranking,
    ats,
    resumeRewrite,
    learningRoadmap,
    careerPlan,
    interviewSet,
    health,
    healthExplanation,
    targetJob,
    jobs,
    traces: [...getTraces()],
    totalLatencyMs: Date.now() - started,
  };
}

const ROUTER_SYSTEM = `Peranmu: Orchestrator Gemma Career OS.
Tugas: membaca permintaan pengguna dan memutuskan agent mana yang harus dijalankan.

Agent yang tersedia:
- resume_specialist  → membaca, menilai, atau menulis ulang CV
- ats_specialist     → membandingkan CV dengan satu job description tertentu
- career_strategist  → tujuan karier, roadmap, rencana harian
- job_hunter         → mencari dan merangking lowongan
- skill_mentor       → gap skill dan rencana belajar
- interview_coach    → latihan interview dan evaluasi jawaban
- career_twin        → memperbarui profil digital pengguna

Aturan:
- Pilih agent seminimal mungkin. Memanggil semua agent membuang waktu pengguna.
- Urutkan sesuai ketergantungan: agent yang menghasilkan data lebih dulu.
- Kalau pertanyaannya bisa dijawab langsung tanpa analisis (mis. "apa itu ATS?"),
  tetap pilih satu agent paling relevan DAN isi directReply dengan jawabannya.
- reasoning: satu kalimat, mengapa agent itu yang dipilih.`;

/** Mode agentic: Gemma yang memilih agent untuk input bebas. */
export async function route(
  userMessage: string,
  twin: CareerTwin | null = null,
  onProgress?: (s: string) => void,
): Promise<RoutingDecision> {
  return runAgent({
    name: 'orchestrator:route',
    system: ROUTER_SYSTEM,
    user: [
      twin ? `Profil pengguna:\n${twinToContext(twin)}\n` : 'Pengguna belum punya profil.\n',
      `Permintaan pengguna: "${userMessage}"`,
      '',
      `Keluarkan JSON: agents (array dari: ${AGENT_NAMES.join(', ')}), reasoning, directReply.`,
    ].join('\n'),
    schema: RoutingDecisionSchema,
    options: { maxTokens: 1024, enableThinking: false },
    onProgress,
  });
}
