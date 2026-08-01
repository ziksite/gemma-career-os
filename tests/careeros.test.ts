/**
 * Tes untuk logika deterministik — bagian yang TIDAK boleh berubah-ubah
 * meski Gemma menjawab berbeda. Tidak memanggil API, jadi bisa jalan offline.
 *
 *   npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractJson, splitThinking } from '../src/lib/gemma/index';
import {
  applyEvent,
  CareerPlanSchema,
  computeCareerHealth,
  createTwin,
  HEALTH_WEIGHTS,
  InterviewSetSchema,
  JobRankingSchema,
  LearningRoadmapSchema,
  ResumeParseSchema,
  type CareerTwin,
  type ResumeParse,
} from '../src/lib/agents/index';

// ─── Parsing output Gemma ────────────────────────────────────────────────────

test('splitThinking memisahkan reasoning dari jawaban', () => {
  const r = splitThinking('<think>menimbang opsi</think>Jawabannya A.');
  assert.equal(r.text, 'Jawabannya A.');
  assert.equal(r.thinking, 'menimbang opsi');
});

test('splitThinking menahan blok thinking yang terpotong max_tokens', () => {
  const r = splitThinking('<think>kepotong di tengah');
  assert.equal(r.text, '', 'reasoning mentah tidak boleh bocor sebagai jawaban');
  assert.equal(r.thinking, 'kepotong di tengah');
});

test('kutip ganda tanpa escape di dalam string diperbaiki', () => {
  // Kasus nyata dari career_strategist:plan — string berakhir lebih awal.
  const broken = '{"gapAssessment": "Transisi dari "mencari bug" ke "menentukan nilai bisnis"."}';
  const parsed = extractJson<{ gapAssessment: string }>(broken);
  assert.equal(
    parsed.gapAssessment,
    'Transisi dari "mencari bug" ke "menentukan nilai bisnis".',
  );
});

test('baris baru mentah dan koma menggantung diperbaiki', () => {
  const broken = '{\n "a": "baris satu\nbaris dua",\n "b": [1, 2,],\n}';
  const parsed = extractJson<{ a: string; b: number[] }>(broken);
  assert.equal(parsed.a, 'baris satu\nbaris dua');
  assert.deepEqual(parsed.b, [1, 2]);
});

test('JSON yang sudah sah tidak diubah oleh perbaikan', () => {
  const good = '{"a": "kutip di dalam: \\"aman\\"", "b": {"c": [1, "dua"]}}';
  assert.deepEqual(extractJson(good), {
    a: 'kutip di dalam: "aman"',
    b: { c: [1, 'dua'] },
  });
});

test('extractJson tahan code fence dan prosa pembuka', () => {
  assert.deepEqual(extractJson('Ini hasilnya:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Hasil: {"n":"kurung } di string"} selesai.'), {
    n: 'kurung } di string',
  });
  assert.throws(() => extractJson('tidak ada json'));
});

// ─── Toleransi bentuk output Gemma ───────────────────────────────────────────
// Kasus di bawah ini BUKAN karangan — semuanya tercatat saat menjalankan
// pipeline ke Vertex AI. Dulu tiap satu memicu panggilan ulang penuh.

test('languages berupa objek diratakan jadi string', () => {
  const parsed = ResumeParseSchema.parse({
    currentRole: 'QA Engineer',
    languages: [
      { name: 'Indonesia', level: 'native' },
      { name: 'Inggris', level: 'pasif' },
    ],
  });
  assert.deepEqual(parsed.languages, ['Indonesia — native', 'Inggris — pasif']);
});

test('id berupa angka diterima sebagai string', () => {
  const parsed = InterviewSetSchema.parse({
    questions: [{ id: 1, question: 'Kenapa pindah karier?', category: 'Behavioral' }],
  });
  assert.equal(parsed.questions[0]?.id, '1');
  assert.equal(parsed.questions[0]?.category, 'behavioral');
});

test('field array yang diisi satu kalimat tidak dipecah di koma', () => {
  const parsed = JobRankingSchema.parse({
    matches: [
      {
        jobId: 'job-001',
        matchScore: '72',
        verdict: 'Improve First',
        reasons: 'Latar QA relevan, tapi belum pernah menulis PRD',
      },
    ],
  });
  const match = parsed.matches[0];
  assert.equal(match?.matchScore, 72);
  assert.equal(match?.verdict, 'improve_first');
  assert.deepEqual(
    match?.reasons,
    ['Latar QA relevan, tapi belum pernah menulis PRD'],
    'koma di tengah kalimat tidak boleh jadi pemisah item',
  );
});

test('daftar yang dipisah baris baru dipecah jadi beberapa item', () => {
  const parsed = LearningRoadmapSchema.parse({
    steps: [{ skill: 'SQL', why: '-', estimatedHours: 20, resources: '- Mode Analytics\n- SQLZoo' }],
    totalEstimatedHours: 20,
    expectedScoreGain: 12,
  });
  assert.deepEqual(parsed.steps[0]?.resources, ['Mode Analytics', 'SQLZoo']);
});

test('angka dalam bentuk teks dan objek yang seharusnya string ditangani', () => {
  const parsed = CareerPlanSchema.parse({
    gapAssessment: { ringkasan: 'Lompatan terlalu jauh', catatan: 'butuh portofolio' },
    feasibility: 'Tidak Realistis',
    estimatedWeeksToTarget: '16 minggu',
    milestones: [{ week: 'Minggu 4', title: 'Kuasai SQL' }],
    dailyMissions: [{ day: 1, tasks: [{ title: 'Perbaiki CV' }] }],
  });
  assert.equal(parsed.gapAssessment, 'Lompatan terlalu jauh — butuh portofolio');
  assert.equal(parsed.feasibility, 'unrealistic');
  assert.equal(parsed.estimatedWeeksToTarget, 16);
  assert.equal(parsed.milestones[0]?.week, 4);
  assert.equal(parsed.dailyMissions[0]?.tasks[0]?.estimatedMinutes, 30);
});

test('gaji format Indonesia dan skor di luar batas dinormalkan', () => {
  const parsed = ResumeParseSchema.parse({ yearsExperience: '3 tahun' });
  assert.equal(parsed.yearsExperience, 3);

  const ranking = JobRankingSchema.parse({
    matches: [{ jobId: 'a', matchScore: 120, verdict: 'skip' }],
  });
  assert.equal(ranking.matches[0]?.matchScore, 100, 'skor di atas 100 dijepit, bukan ditolak');
});

// ─── Career Health ───────────────────────────────────────────────────────────

test('bobot Career Health berjumlah tepat 1.0', () => {
  const total = Object.values(HEALTH_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `total bobot ${total}, seharusnya 1.0`);
});

test('Career Health deterministik dan terbatas 0-100', () => {
  const input = { resumeQuality: 80, atsCompatibility: 60, skillRelevancy: 55 };
  const a = computeCareerHealth(input);
  const b = computeCareerHealth(input);
  assert.equal(a.score, b.score, 'input sama harus menghasilkan skor sama');
  assert.ok(a.score >= 0 && a.score <= 100);

  assert.equal(computeCareerHealth({}).score >= 0, true);
  const perfect = computeCareerHealth({
    resumeQuality: 100,
    atsCompatibility: 100,
    experienceRelevance: 100,
    skillRelevancy: 100,
    portfolioStrength: 100,
    interviewReadiness: 100,
    marketDemand: 100,
  });
  assert.equal(perfect.score, 100);
});

test('weakestComponent memilih perbaikan berdampak terbesar, bukan skor terendah', () => {
  // marketDemand paling rendah (10) tapi bobotnya cuma 0.05 → rugi 4.5
  // atsCompatibility 40 dengan bobot 0.20 → rugi 12. Ini yang harus dipilih.
  const h = computeCareerHealth({
    resumeQuality: 90,
    atsCompatibility: 40,
    experienceRelevance: 90,
    skillRelevancy: 90,
    portfolioStrength: 90,
    interviewReadiness: 90,
    marketDemand: 10,
  });
  assert.equal(h.weakestComponent, 'atsCompatibility');
});

// ─── Career Twin ─────────────────────────────────────────────────────────────

const baseParse = {
  fullName: 'Dzikri',
  headline: 'QA Engineer',
  summary: '',
  currentRole: 'QA Engineer',
  industry: 'E-commerce',
  seniority: 'mid' as const,
  yearsExperience: 3,
  skills: [{ name: 'SQL', level: 'beginner' as const, evidence: 'disebut di CV' }],
  experiences: [],
  education: [],
  certifications: ['ISTQB Foundation'],
  languages: [],
  strengths: [],
  weaknesses: [],
} satisfies ResumeParse;

function twin(): CareerTwin {
  return createTwin(baseParse, null, '2026-08-01T00:00:00Z');
}

test('level skill hanya naik, tidak pernah turun', () => {
  const naik = applyEvent(twin(), {
    type: 'skill_learned',
    payload: { skill: { name: 'sql', level: 'advanced', evidence: 'proyek dashboard' } },
    at: '2026-08-02T00:00:00Z',
  });
  assert.equal(naik.skills.find((s) => s.name.toLowerCase() === 'sql')?.level, 'advanced');

  const turun = applyEvent(naik, {
    type: 'skill_learned',
    payload: { skill: { name: 'SQL', level: 'beginner', evidence: '' } },
    at: '2026-08-03T00:00:00Z',
  });
  assert.equal(turun.skills.find((s) => s.name.toLowerCase() === 'sql')?.level, 'advanced');
});

test('skill baru ditambahkan tanpa menggandakan yang lama', () => {
  const next = applyEvent(twin(), {
    type: 'skill_learned',
    payload: { skill: { name: 'Amplitude', level: 'intermediate', evidence: '' } },
    at: '2026-08-02T00:00:00Z',
  });
  assert.equal(next.skills.length, 2);
});

test('sertifikasi tidak digandakan', () => {
  const once = applyEvent(twin(), {
    type: 'certification_added',
    payload: { certification: 'ISTQB Foundation' },
    at: '2026-08-02T00:00:00Z',
  });
  assert.equal(once.certifications.length, 1);
});

test('applyEvent tidak mengubah objek asal', () => {
  const original = twin();
  const snapshot = JSON.stringify(original);
  applyEvent(original, {
    type: 'skill_learned',
    payload: { skill: { name: 'Figma', level: 'beginner', evidence: '' } },
    at: '2026-08-02T00:00:00Z',
  });
  assert.equal(JSON.stringify(original), snapshot);
});
