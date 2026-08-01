/**
 * Domain model Gemma Career OS.
 *
 * Semua schema pakai Zod supaya output Gemma bisa divalidasi runtime — bukan cuma
 * di-cast. Kalau model mengembalikan bentuk yang salah, agent akan minta perbaikan
 * sekali sebelum menyerah (lihat shared.ts).
 */

import { z } from 'zod';

/**
 * Enum yang toleran terhadap variasi penulisan model.
 *
 * Diuji ke Vertex AI: Gemma sering menulis "Mid-Level" atau "Apply Now" alih-alih
 * "mid" / "apply_now". Menolaknya berarti satu panggilan ulang penuh — mahal dan lambat.
 * Normalisasi huruf/pemisah jauh lebih murah daripada memaksa model patuh persis.
 */
function looseEnum<const T extends readonly [string, ...string[]]>(
  values: T,
  aliases: Record<string, T[number]> = {},
) {
  return z.preprocess((raw) => {
    if (typeof raw !== 'string') return raw;
    const norm = raw.trim().toLowerCase().replace(/[\s\-/]+/g, '_');
    return aliases[norm] ?? norm;
  }, z.enum(values));
}

/**
 * Ratakan nilai apa pun menjadi teks yang terbaca manusia.
 * Gemma kadang mengirim objek untuk field yang diminta berupa string —
 * mis. languages: [{name:"Indonesia", level:"native"}] alih-alih ["Indonesia"].
 */
function flatten(raw: unknown): unknown {
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  if (Array.isArray(raw)) return raw.map(flatten).filter(Boolean).join(' — ');
  if (raw && typeof raw === 'object') {
    return Object.values(raw as Record<string, unknown>)
      .map(flatten)
      .filter((v) => typeof v === 'string' && v.length > 0)
      .join(' — ');
  }
  return raw;
}

/** String yang menerima angka atau objek dan meratakannya. */
function looseString() {
  return z.preprocess(flatten, z.string());
}

/**
 * Angka yang menerima string. Menangani pemisah ribuan gaya Indonesia
 * ("20.000.000" → 20000000) dan angka di dalam kalimat ("Minggu 4" → 4).
 * Nilai di luar batas dijepit, bukan ditolak — menolak berarti satu panggilan ulang.
 */
function toNumber(raw: unknown, min?: number, max?: number): unknown {
  let n: number | undefined;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'string') {
    const match = raw.replace(/[.,](?=\d{3}\b)/g, '').match(/-?\d+(\.\d+)?/);
    if (match) n = Number(match[0]);
  }
  if (n === undefined || Number.isNaN(n)) return raw;
  if (min !== undefined) n = Math.max(min, n);
  if (max !== undefined) n = Math.min(max, n);
  return n;
}

function looseNumber(min?: number, max?: number) {
  return z.preprocess((raw) => toNumber(raw, min, max), z.number());
}

function looseNullableNumber(min?: number, max?: number) {
  return z.preprocess(
    (raw) => (raw === null || raw === undefined ? null : toNumber(raw, min, max)),
    z.number().nullable(),
  );
}

/**
 * Array yang menerima satu nilai tunggal. Gemma sering menulis satu kalimat
 * untuk field yang diminta berupa array.
 *
 * Pemisahan hanya pada baris baru dan titik koma — bukan koma, karena koma
 * lazim muncul di tengah kalimat dan memecahnya akan merusak makna.
 */
function looseArray<S extends z.ZodTypeAny>(item: S) {
  return z.preprocess((raw) => {
    if (raw === null || raw === undefined) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      const parts = raw
        .split(/[\n;]+/)
        .map((s) => s.replace(/^\s*[-*•]\s*/, '').trim())
        .filter(Boolean);
      return parts.length ? parts : [raw];
    }
    return [raw];
  }, z.array(item));
}

/** Array of string dengan semua toleransi di atas. */
const looseStrings = () => looseArray(looseString());

// ─── Career Twin ─────────────────────────────────────────────────────────────

export const SkillSchema = z.object({
  name: z.string(),
  level: looseEnum(['beginner', 'intermediate', 'advanced', 'expert'], {
    basic: 'beginner',
    dasar: 'beginner',
    novice: 'beginner',
    pemula: 'beginner',
    menengah: 'intermediate',
    proficient: 'advanced',
    mahir: 'advanced',
    ahli: 'expert',
  }),
  /** Bukti dari CV yang mendukung klaim level ini. */
  evidence: looseString().default(''),
});

export const ExperienceSchema = z.object({
  role: looseString(),
  company: looseString(),
  startDate: looseString().default(''),
  endDate: looseString().default(''),
  /** Poin pencapaian, idealnya sudah mengandung angka. */
  highlights: looseStrings().default([]),
});

export const EducationSchema = z.object({
  degree: looseString(),
  institution: looseString(),
  year: looseString().default(''),
});

export const CareerGoalSchema = z.object({
  targetRole: looseString(),
  targetSalaryIdr: looseNullableNumber(0).default(null),
  targetIndustries: looseStrings().default([]),
  targetCompanies: looseStrings().default([]),
  workPreference: looseEnum(['onsite', 'hybrid', 'remote', 'any'], {
    on_site: 'onsite',
    wfh: 'remote',
    work_from_home: 'remote',
    wfo: 'onsite',
    fleksibel: 'any',
    flexible: 'any',
    apa_saja: 'any',
  }).default('any'),
  /** Kalimat asli user, disimpan supaya nuansanya tidak hilang. */
  rawStatement: looseString().default(''),
});

export const CareerTwinSchema = z.object({
  fullName: looseString().default(''),
  headline: looseString().default(''),
  summary: looseString().default(''),
  currentRole: looseString().default(''),
  industry: looseString().default(''),
  seniority: looseEnum(
    ['intern', 'junior', 'mid', 'senior', 'lead', 'manager', 'executive'],
    {
      internship: 'intern',
      magang: 'intern',
      entry: 'junior',
      entry_level: 'junior',
      junior_level: 'junior',
      associate: 'junior',
      mid_level: 'mid',
      middle: 'mid',
      intermediate: 'mid',
      senior_level: 'senior',
      staff: 'senior',
      principal: 'lead',
      tech_lead: 'lead',
      team_lead: 'lead',
      head: 'manager',
      director: 'executive',
      vp: 'executive',
      c_level: 'executive',
    },
  ).default('mid'),
  yearsExperience: looseNumber(0, 60).default(0),
  skills: looseArray(SkillSchema).default([]),
  experiences: looseArray(ExperienceSchema).default([]),
  education: looseArray(EducationSchema).default([]),
  certifications: looseStrings().default([]),
  languages: looseStrings().default([]),
  strengths: looseStrings().default([]),
  weaknesses: looseStrings().default([]),
  goal: CareerGoalSchema.nullable().default(null),
  updatedAt: z.string().default(''),
});

// ─── Resume Specialist ───────────────────────────────────────────────────────

export const ResumeParseSchema = CareerTwinSchema.omit({
  goal: true,
  updatedAt: true,
});

export const ResumeRewriteSchema = z.object({
  summary: looseString(),
  /** Bullet lama → bullet baru, supaya user bisa lihat perubahannya. */
  rewrittenHighlights: looseArray(
    z.object({
      before: looseString(),
      after: looseString(),
      reason: looseString().default(''),
    }),
  ).default([]),
  addedKeywords: looseStrings().default([]),
  removedFluff: looseStrings().default([]),
  resumeQualityScore: looseNumber(0, 100),
});

// ─── ATS Specialist ──────────────────────────────────────────────────────────

export const AtsAnalysisSchema = z.object({
  atsScore: looseNumber(0, 100),
  matchedKeywords: looseStrings().default([]),
  missingKeywords: looseStrings().default([]),
  /** Syarat wajib di JD yang tidak dipenuhi sama sekali — ini yang paling mematikan. */
  hardBlockers: looseStrings().default([]),
  formattingIssues: looseStrings().default([]),
  recommendation: looseString(),
});

// ─── Job Hunter ──────────────────────────────────────────────────────────────

export const JobPostingSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string().default(''),
  workType: looseEnum(['onsite', 'hybrid', 'remote'], {
    on_site: 'onsite',
    wfh: 'remote',
    wfo: 'onsite',
  }).default('onsite'),
  salaryIdr: looseNullableNumber(0).default(null),
  description: z.string(),
  source: z.string().default(''),
});

export const JobMatchSchema = z.object({
  jobId: looseString(),
  /** Peluang lolos screening, 0-100. */
  matchScore: looseNumber(0, 100),
  verdict: looseEnum(['apply_now', 'improve_first', 'skip'], {
    apply: 'apply_now',
    lamar: 'apply_now',
    lamar_sekarang: 'apply_now',
    improve: 'improve_first',
    perbaiki_dulu: 'improve_first',
    lewati: 'skip',
  }),
  reasons: looseStrings().default([]),
  missingRequirements: looseStrings().default([]),
  /** Estimasi skor setelah gap ditutup. */
  potentialScoreAfterUpskilling: looseNullableNumber(0, 100).default(null),
});

export const JobRankingSchema = z.object({
  matches: looseArray(JobMatchSchema),
  summary: looseString().default(''),
});

// ─── Skill Mentor ────────────────────────────────────────────────────────────

export const LearningStepSchema = z.object({
  skill: looseString(),
  why: looseString().default(''),
  estimatedHours: looseNumber(0).default(0),
  resources: looseStrings().default([]),
  /** Bukti konkret yang harus dihasilkan — bukan sekadar "sudah nonton kursus". */
  proofOfWork: looseString().default(''),
});

export const LearningRoadmapSchema = z.object({
  steps: looseArray(LearningStepSchema),
  totalEstimatedHours: looseNumber(0).default(0),
  expectedScoreGain: looseNumber(0, 100).default(0),
  rationale: looseString().default(''),
});

// ─── Interview Coach ─────────────────────────────────────────────────────────

export const InterviewQuestionSchema = z.object({
  id: looseString().default(''),
  question: looseString(),
  category: looseEnum(['behavioral', 'technical', 'situational', 'culture_fit'], {
    behavior: 'behavioral',
    behaviour: 'behavioral',
    perilaku: 'behavioral',
    teknis: 'technical',
    situation: 'situational',
    situasional: 'situational',
    culture: 'culture_fit',
    culturefit: 'culture_fit',
    budaya: 'culture_fit',
  }),
  /** Yang dicari pewawancara dari jawaban ini. */
  lookingFor: looseString().default(''),
});

export const InterviewSetSchema = z.object({
  questions: looseArray(InterviewQuestionSchema),
  focusAreas: looseStrings().default([]),
});

export const InterviewFeedbackSchema = z.object({
  contentScore: looseNumber(0, 100),
  structureScore: looseNumber(0, 100),
  confidenceScore: looseNumber(0, 100),
  overallScore: looseNumber(0, 100),
  strengths: looseStrings().default([]),
  improvements: looseStrings().default([]),
  modelAnswer: looseString().default(''),
});

// ─── Career Strategist ───────────────────────────────────────────────────────

export const MilestoneSchema = z.object({
  week: looseNumber(1),
  title: looseString(),
  outcome: looseString().default(''),
  tasks: looseStrings().default([]),
});

export const DailyMissionSchema = z.object({
  day: looseNumber(1),
  tasks: looseArray(
    z.object({
      title: looseString(),
      agent: looseString().default(''),
      estimatedMinutes: looseNumber(0).default(30),
    }),
  ),
});

export const CareerPlanSchema = z.object({
  /** Penilaian jujur soal jarak dari posisi sekarang ke target. */
  gapAssessment: looseString(),
  feasibility: looseEnum(['realistic', 'stretch', 'unrealistic'], {
    realistis: 'realistic',
    achievable: 'realistic',
    challenging: 'stretch',
    menantang: 'stretch',
    ambitious: 'stretch',
    tidak_realistis: 'unrealistic',
    unrealistis: 'unrealistic',
  }),
  estimatedWeeksToTarget: looseNumber(0).default(0),
  milestones: looseArray(MilestoneSchema).default([]),
  dailyMissions: looseArray(DailyMissionSchema).default([]),
  risks: looseStrings().default([]),
});

// ─── Career Health ───────────────────────────────────────────────────────────

export const HealthComponentsSchema = z.object({
  resumeQuality: z.number().min(0).max(100),
  atsCompatibility: z.number().min(0).max(100),
  experienceRelevance: z.number().min(0).max(100),
  skillRelevancy: z.number().min(0).max(100),
  portfolioStrength: z.number().min(0).max(100),
  interviewReadiness: z.number().min(0).max(100),
  marketDemand: z.number().min(0).max(100),
});

export const HealthExplanationSchema = z.object({
  /** Satu penyebab utama skor tertahan — bukan daftar panjang. */
  biggestBlocker: looseString(),
  explanation: looseString(),
  quickWins: looseStrings().default([]),
});

// ─── Orchestrator ────────────────────────────────────────────────────────────

export const AGENT_NAMES = [
  'resume_specialist',
  'ats_specialist',
  'career_strategist',
  'job_hunter',
  'skill_mentor',
  'interview_coach',
  'career_twin',
] as const;

export const RoutingDecisionSchema = z.object({
  /** Agent yang dipanggil, urut sesuai ketergantungan. */
  agents: looseArray(looseEnum(AGENT_NAMES)).pipe(z.array(z.enum(AGENT_NAMES)).min(1)),
  reasoning: looseString(),
  /** Balasan langsung kalau tidak ada agent yang perlu dipanggil. */
  directReply: looseString().default(''),
});

// ─── Type exports ────────────────────────────────────────────────────────────

export type Skill = z.infer<typeof SkillSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type CareerGoal = z.infer<typeof CareerGoalSchema>;
export type CareerTwin = z.infer<typeof CareerTwinSchema>;
export type ResumeParse = z.infer<typeof ResumeParseSchema>;
export type ResumeRewrite = z.infer<typeof ResumeRewriteSchema>;
export type AtsAnalysis = z.infer<typeof AtsAnalysisSchema>;
export type JobPosting = z.infer<typeof JobPostingSchema>;
export type JobMatch = z.infer<typeof JobMatchSchema>;
export type JobRanking = z.infer<typeof JobRankingSchema>;
export type LearningRoadmap = z.infer<typeof LearningRoadmapSchema>;
export type InterviewSet = z.infer<typeof InterviewSetSchema>;
export type InterviewFeedback = z.infer<typeof InterviewFeedbackSchema>;
export type CareerPlan = z.infer<typeof CareerPlanSchema>;
export type HealthComponents = z.infer<typeof HealthComponentsSchema>;
export type HealthExplanation = z.infer<typeof HealthExplanationSchema>;
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;
export type AgentName = (typeof AGENT_NAMES)[number];
