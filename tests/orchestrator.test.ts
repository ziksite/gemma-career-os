/**
 * Menguji wiring orchestrator dengan Gemma tiruan.
 *
 * Tujuannya bukan menilai kualitas jawaban model, tapi memastikan:
 *   - semua agent dipanggil dengan urutan dan ketergantungan yang benar
 *   - output tiap agent mengalir ke agent berikutnya
 *   - jalur repair bekerja saat model mengembalikan bentuk yang salah
 *   - Career Health dihitung dari output agent, bukan angka acak
 *
 * Tidak menyentuh jaringan, jadi bisa dijalankan kapan saja.
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  runOnboarding,
  setCompletionBackend,
  resetCompletionBackend,
  type JobPosting,
} from '../src/lib/agents/index';
import type { ChatMessage, ChatOptions, GemmaResponse } from '../src/lib/gemma/index';

/** Jawaban palsu per agent, dipilih berdasarkan isi system prompt. */
const FAKE: Array<{ match: RegExp; body: unknown }> = [
  {
    match: /mengubah teks CV mentah/,
    body: {
      fullName: 'Dzikri Ramadhan',
      headline: 'QA Engineer',
      summary: 'QA Engineer 3 tahun.',
      currentRole: 'QA Engineer',
      industry: 'E-commerce',
      seniority: 'mid',
      yearsExperience: 3,
      skills: [
        { name: 'SQL', level: 'beginner', evidence: 'SQL dasar' },
        { name: 'Jira', level: 'advanced', evidence: '40 bug/bulan' },
      ],
      experiences: [
        {
          role: 'QA Engineer',
          company: 'PT Tokoloka Digital',
          startDate: '2023-03',
          endDate: '',
          highlights: ['Menemukan 40 bug per bulan', 'Membuat dashboard untuk 3 tim'],
        },
      ],
      education: [{ degree: 'S1 Sistem Informasi', institution: 'Gunadarma', year: '2021' }],
      certifications: ['ISTQB Foundation Level'],
      languages: ['Indonesia', 'Inggris'],
      strengths: ['Detail'],
      weaknesses: ['Belum ada pengalaman product'],
    },
  },
  {
    match: /tujuan karier terstruktur/,
    body: {
      targetRole: 'Product Manager',
      targetSalaryIdr: 20000000,
      targetIndustries: ['E-commerce'],
      targetCompanies: [],
      workPreference: 'any',
      rawStatement: 'pindah dari QA jadi PM gaji 20 juta',
    },
  },
  {
    match: /headline dan summary/,
    body: { headline: 'QA → Product Manager', summary: 'Ringkasan baru.' },
  },
  {
    match: /peluang kandidat lolos ke tahap interview/,
    body: {
      matches: [
        {
          jobId: 'job-003',
          matchScore: 72,
          verdict: 'improve_first',
          reasons: ['Latar QA relevan untuk BA'],
          missingRequirements: ['SQL menengah'],
          potentialScoreAfterUpskilling: 85,
        },
        {
          jobId: 'job-001',
          matchScore: 64,
          verdict: 'improve_first',
          reasons: ['Belum pernah menulis PRD'],
          missingRequirements: ['PRD', 'A/B testing'],
          potentialScoreAfterUpskilling: 80,
        },
        {
          jobId: 'job-002',
          matchScore: 12,
          verdict: 'skip',
          reasons: ['Butuh 6 tahun sebagai PM'],
          missingRequirements: ['6 tahun PM'],
          potentialScoreAfterUpskilling: null,
        },
      ],
      summary: 'Fokus ke BA dulu.',
    },
  },
  {
    match: /set pertanyaan interview/,
    body: {
      questions: [
        {
          id: 'q1',
          question: 'Kenapa pindah dari QA ke PM?',
          category: 'behavioral',
          lookingFor: 'Kejelasan motivasi',
        },
      ],
      focusAreas: ['Cerita transisi karier'],
    },
  },
  {
    match: /lolos filter ATS/,
    body: {
      atsScore: 58,
      matchedKeywords: ['Jira', 'Agile', 'UAT'],
      missingKeywords: ['PRD', 'A/B testing', 'roadmap'],
      hardBlockers: [],
      formattingIssues: ['Tidak ada angka pencapaian'],
      recommendation: 'Tambahkan bukti kepemilikan fitur.',
    },
  },
  {
    match: /menulis ulang bagian CV/,
    body: {
      summary: 'Ringkasan CV baru.',
      rewrittenHighlights: [
        { before: 'Membantu PM melakukan UAT', after: 'Memimpin UAT 12 rilis', reason: 'Ada angka' },
      ],
      addedKeywords: ['PRD'],
      removedFluff: ['hardworking'],
      resumeQualityScore: 78,
    },
  },
  {
    match: /roadmap belajar/,
    body: {
      steps: [
        {
          skill: 'SQL',
          why: 'Wajib untuk analisis produk',
          estimatedHours: 20,
          resources: ['Mode Analytics SQL Tutorial'],
          proofOfWork: 'Dashboard funnel',
        },
      ],
      totalEstimatedHours: 20,
      expectedScoreGain: 12,
      rationale: 'SQL muncul di semua JD.',
    },
  },
  {
    match: /rencana dari posisi kandidat/,
    body: {
      gapAssessment: 'Lompatan ke PM langsung terlalu jauh.',
      feasibility: 'stretch',
      estimatedWeeksToTarget: 16,
      milestones: [{ week: 2, title: 'Kuasai SQL', outcome: 'Dashboard jadi', tasks: ['Belajar join'] }],
      dailyMissions: [
        { day: 1, tasks: [{ title: 'Perbaiki CV', agent: 'resume_specialist', estimatedMinutes: 60 }] },
      ],
      risks: ['Waktu belajar terbatas'],
    },
  },
  {
    match: /menjelaskan Career Health Score/,
    body: {
      biggestBlocker: 'Belum ada bukti kepemilikan produk',
      explanation: 'Penjelasan.',
      quickWins: ['Tulis satu PRD'],
    },
  },
];

let calls: string[] = [];
/** Agent mana yang sudah sengaja dibuat gagal sekali, untuk menguji jalur repair. */
let brokenOnce = false;

function fakeBackend(messages: ChatMessage[], options: ChatOptions): Promise<GemmaResponse> {
  const system = options.system ?? '';
  const entry = FAKE.find((f) => f.match.test(system));
  if (!entry) throw new Error(`Tidak ada jawaban palsu untuk system prompt:\n${system.slice(0, 200)}`);

  calls.push(entry.match.source);

  // Sekali saja, ATS Specialist mengembalikan tipe yang salah untuk menguji repair.
  const isRepairTurn = messages.some((m) => m.content.includes('tidak lolos validasi schema'));
  let body: unknown = entry.body;
  if (entry.match.source.includes('ATS') && !brokenOnce && !isRepairTurn) {
    brokenOnce = true;
    body = { ...(entry.body as object), atsScore: 'lima puluh delapan' };
  }

  return Promise.resolve({
    text: `\`\`\`json\n${JSON.stringify(body)}\n\`\`\``,
    thinking: null,
    finishReason: 'stop',
    usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    model: 'fake',
    raw: {},
    latencyMs: 1,
  });
}

const JOBS: JobPosting[] = [
  {
    id: 'job-001',
    title: 'Associate Product Manager',
    company: 'Tokopedia',
    location: 'Jakarta',
    workType: 'hybrid',
    salaryIdr: 18000000,
    description: 'Butuh SQL, PRD, A/B testing.',
    source: 'LinkedIn',
  },
  {
    id: 'job-002',
    title: 'Senior Product Manager',
    company: 'Gojek',
    location: 'Jakarta',
    workType: 'hybrid',
    salaryIdr: 45000000,
    description: 'Minimal 6 tahun sebagai PM.',
    source: 'LinkedIn',
  },
  {
    id: 'job-003',
    title: 'Business Analyst',
    company: 'Bank Jago',
    location: 'Jakarta',
    workType: 'onsite',
    salaryIdr: 15000000,
    description: 'Butuh SQL, BRD, UAT.',
    source: 'Jobstreet',
  },
];

beforeEach(() => {
  calls = [];
  brokenOnce = false;
  setCompletionBackend(fakeBackend);
});

afterEach(() => resetCompletionBackend());

test('runOnboarding menjalankan seluruh agent dan merangkai hasilnya', async () => {
  const result = await runOnboarding('teks cv', 'pindah dari QA jadi PM gaji 20 juta', JOBS);

  // Semua agent inti terpanggil.
  for (const expected of [
    'mengubah teks CV mentah',
    'tujuan karier terstruktur',
    'headline dan summary',
    'peluang kandidat lolos ke tahap interview',
    'lolos filter ATS',
    'menulis ulang bagian CV',
    'roadmap belajar',
    'rencana dari posisi kandidat',
    'set pertanyaan interview',
    'menjelaskan Career Health Score',
  ]) {
    assert.ok(
      calls.some((c) => c.includes(expected)),
      `agent "${expected}" tidak dipanggil`,
    );
  }

  // Twin gabungan CV + tujuan + narasi baru.
  assert.equal(result.twin.fullName, 'Dzikri Ramadhan');
  assert.equal(result.twin.goal?.targetRole, 'Product Manager');
  assert.equal(result.twin.headline, 'QA → Product Manager');

  // Lowongan berpeluang tertinggi jadi target analisis ATS.
  assert.equal(result.targetJob.id, 'job-003');

  // Career Health memakai angka dari agent, bukan default.
  assert.equal(result.health.components.atsCompatibility, 58);
  assert.equal(result.health.components.resumeQuality, 78);
  // top-3 matchScore = (72 + 64 + 12) / 3 = 49.33 → 49
  assert.equal(result.health.components.experienceRelevance, 49);
  // 3 keyword cocok dari 6 total → 50
  assert.equal(result.health.components.skillRelevancy, 50);
  // 1 dari 3 lowongan bernilai >= 60... job-003 (72) & job-001 (64) → 2/3 = 67
  assert.equal(result.health.components.marketDemand, 67);
  assert.ok(result.health.score > 0 && result.health.score < 100);
});

test('jalur repair menyelamatkan output yang tidak sesuai schema', async () => {
  const result = await runOnboarding('teks cv', 'jadi PM', JOBS);

  const atsTrace = result.traces.find((t) => t.agent === 'ats_specialist');
  assert.ok(atsTrace, 'trace ATS tidak ditemukan');
  assert.equal(atsTrace.repaired, true, 'seharusnya lewat jalur repair');
  assert.equal(atsTrace.ok, true);
  assert.equal(result.ats.atsScore, 58, 'nilai hasil repair harus terpakai');
});

test('menolak jalan tanpa lowongan, bukan diam-diam menghasilkan dashboard kosong', async () => {
  await assert.rejects(() => runOnboarding('cv', 'jadi PM', []), /minimal satu lowongan/);
});

test('trace mencatat setiap pemanggilan Gemma untuk audit', async () => {
  const result = await runOnboarding('teks cv', 'jadi PM', JOBS);
  assert.equal(result.traces.length, 10);
  assert.ok(result.traces.every((t) => t.ok));
  assert.ok(result.traces.every((t) => t.completionTokens > 0));
});
