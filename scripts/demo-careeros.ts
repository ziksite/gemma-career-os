/**
 * Demo alur pengguna inti Gemma Career OS — inilah yang direkam untuk video submission.
 *
 *   npm run demo                                  # pakai CV & tujuan contoh
 *   npm run demo -- --goal "Saya ingin jadi Business Analyst"
 *   npm run demo -- --cv ./data/cv-saya.txt
 *   npm run demo -- --json out.json               # simpan hasil lengkap
 */

import { readFile, writeFile } from 'node:fs/promises';
import { JobPostingSchema, runOnboarding, type JobPosting } from '../src/lib/agents/index';

const DIM = '\x1b[2m';
const B = '\x1b[1m';
const R = '\x1b[0m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function rule(title: string) {
  console.log(`\n${B}${CYAN}${'─'.repeat(72)}${R}`);
  console.log(`${B}${CYAN} ${title}${R}`);
  console.log(`${B}${CYAN}${'─'.repeat(72)}${R}`);
}

function bar(score: number, width = 30): string {
  const filled = Math.round((score / 100) * width);
  const color = score >= 75 ? GREEN : score >= 50 ? YELLOW : RED;
  return `${color}${'█'.repeat(filled)}${DIM}${'░'.repeat(width - filled)}${R}`;
}

function rupiah(n: number | null): string {
  return n === null ? '-' : `Rp${n.toLocaleString('id-ID')}`;
}

async function main() {
  const cvPath = arg('--cv') ?? './data/sample-cv.txt';
  const goal =
    arg('--goal') ?? 'Saya ingin pindah dari QA menjadi Product Manager dengan gaji 20 juta';

  const [resumeText, jobsRaw] = await Promise.all([
    readFile(cvPath, 'utf8'),
    readFile('./data/sample-jobs.json', 'utf8'),
  ]);
  const jobs: JobPosting[] = JobPostingSchema.array().parse(JSON.parse(jobsRaw));

  console.log(`\n${B}Gemma Career OS${R} ${DIM}— Your AI Career Operating System${R}`);
  console.log(`${DIM}CV       : ${cvPath}${R}`);
  console.log(`${DIM}Tujuan   : "${goal}"${R}`);
  console.log(`${DIM}Lowongan : ${jobs.length} posisi${R}\n`);

  const result = await runOnboarding(resumeText, goal, jobs, (status) =>
    console.log(`${DIM}  ⟳ ${status}${R}`),
  );

  // ── Dashboard ──────────────────────────────────────────────────────────────
  rule('CAREER HEALTH');
  console.log(`\n  ${B}${result.health.score}%${R}  ${bar(result.health.score)}\n`);
  for (const [key, value] of Object.entries(result.health.components)) {
    console.log(`  ${key.padEnd(20)} ${String(value).padStart(3)}  ${bar(value, 20)}`);
  }
  console.log(`\n  ${B}Penghambat utama:${R} ${result.healthExplanation.biggestBlocker}`);
  console.log(`  ${result.healthExplanation.explanation}`);
  console.log(`\n  ${B}Quick wins:${R}`);
  result.healthExplanation.quickWins.forEach((w) => console.log(`   • ${w}`));

  // ── Profil ─────────────────────────────────────────────────────────────────
  rule('CAREER TWIN');
  console.log(`\n  ${B}${result.twin.fullName || '(nama tidak terbaca)'}${R}`);
  console.log(`  ${result.twin.headline}`);
  console.log(`\n  ${result.twin.summary}`);
  console.log(
    `\n  ${DIM}Seniority: ${result.twin.seniority} · ${result.twin.yearsExperience} tahun · ${result.twin.skills.length} skill terdeteksi${R}`,
  );
  if (result.twin.goal) {
    console.log(
      `  ${DIM}Target: ${result.twin.goal.targetRole} · ${rupiah(result.twin.goal.targetSalaryIdr)} · ${result.twin.goal.workPreference}${R}`,
    );
  }

  // ── Lowongan ───────────────────────────────────────────────────────────────
  rule('JOB HUNTER');
  console.log();
  for (const m of result.jobRanking.matches) {
    const job = jobs.find((j) => j.id === m.jobId);
    const tag =
      m.verdict === 'apply_now'
        ? `${GREEN}LAMAR SEKARANG${R}`
        : m.verdict === 'improve_first'
          ? `${YELLOW}PERBAIKI DULU${R}`
          : `${RED}LEWATI${R}`;
    console.log(
      `  ${B}${String(m.matchScore).padStart(3)}%${R} ${bar(m.matchScore, 16)} ${job?.title ?? m.jobId} — ${job?.company ?? ''}  [${tag}]`,
    );
    if (m.reasons[0]) console.log(`       ${DIM}${m.reasons[0]}${R}`);
    if (m.potentialScoreAfterUpskilling !== null) {
      console.log(
        `       ${DIM}→ bisa naik ke ${m.potentialScoreAfterUpskilling}% setelah menutup gap${R}`,
      );
    }
  }
  console.log(`\n  ${result.jobRanking.summary}`);

  // ── ATS ────────────────────────────────────────────────────────────────────
  rule(`ATS SPECIALIST — ${result.targetJob.title} @ ${result.targetJob.company}`);
  console.log(`\n  ATS Score: ${B}${result.ats.atsScore}%${R} ${bar(result.ats.atsScore)}`);
  console.log(`\n  ${GREEN}Cocok  :${R} ${result.ats.matchedKeywords.join(', ') || '-'}`);
  console.log(`  ${RED}Kurang :${R} ${result.ats.missingKeywords.join(', ') || '-'}`);
  if (result.ats.hardBlockers.length) {
    console.log(`\n  ${RED}${B}Penghalang wajib:${R}`);
    result.ats.hardBlockers.forEach((h) => console.log(`   ✗ ${h}`));
  }
  console.log(`\n  ${B}Rekomendasi:${R} ${result.ats.recommendation}`);

  // ── Resume ─────────────────────────────────────────────────────────────────
  rule('RESUME SPECIALIST');
  console.log(`\n  Kualitas CV setelah perbaikan: ${B}${result.resumeRewrite.resumeQualityScore}%${R}`);
  console.log(`\n  ${B}Ringkasan baru:${R}\n  ${result.resumeRewrite.summary}`);
  console.log(`\n  ${B}Perbaikan bullet:${R}`);
  for (const h of result.resumeRewrite.rewrittenHighlights.slice(0, 4)) {
    console.log(`\n   ${RED}sebelum${R} ${h.before}`);
    console.log(`   ${GREEN}sesudah${R} ${h.after}`);
    console.log(`   ${DIM}alasan : ${h.reason}${R}`);
  }

  // ── Skill ──────────────────────────────────────────────────────────────────
  rule('SKILL MENTOR');
  console.log(
    `\n  Total ${B}${result.learningRoadmap.totalEstimatedHours} jam${R} → peluang naik ${B}+${result.learningRoadmap.expectedScoreGain}%${R}\n`,
  );
  result.learningRoadmap.steps.forEach((s, i) => {
    console.log(`  ${B}${i + 1}. ${s.skill}${R} ${DIM}(${s.estimatedHours} jam)${R}`);
    console.log(`     ${s.why}`);
    console.log(`     ${DIM}Bukti kerja: ${s.proofOfWork}${R}`);
    if (s.resources.length) console.log(`     ${DIM}Sumber: ${s.resources.join(', ')}${R}`);
  });

  // ── Rencana ────────────────────────────────────────────────────────────────
  rule('CAREER STRATEGIST');
  const feasColor =
    result.careerPlan.feasibility === 'realistic'
      ? GREEN
      : result.careerPlan.feasibility === 'stretch'
        ? YELLOW
        : RED;
  console.log(
    `\n  Kelayakan: ${feasColor}${B}${result.careerPlan.feasibility}${R} · estimasi ${result.careerPlan.estimatedWeeksToTarget} minggu`,
  );
  console.log(`\n  ${result.careerPlan.gapAssessment}`);
  console.log(`\n  ${B}Milestone:${R}`);
  result.careerPlan.milestones.forEach((m) =>
    console.log(`   Minggu ${m.week}: ${m.title} ${DIM}→ ${m.outcome}${R}`),
  );
  console.log(`\n  ${B}Career Mission 5 hari pertama:${R}`);
  result.careerPlan.dailyMissions.forEach((d) => {
    console.log(`   ${B}Hari ${d.day}${R}`);
    d.tasks.forEach((t) =>
      console.log(`     ☐ ${t.title} ${DIM}(${t.estimatedMinutes} menit · ${t.agent})${R}`),
    );
  });
  if (result.careerPlan.risks.length) {
    console.log(`\n  ${B}Risiko:${R}`);
    result.careerPlan.risks.forEach((r) => console.log(`   ⚠ ${r}`));
  }

  // ── Interview ──────────────────────────────────────────────────────────────
  rule('INTERVIEW COACH');
  console.log(`\n  Fokus latihan: ${result.interviewSet.focusAreas.join(', ') || '-'}\n`);
  result.interviewSet.questions.forEach((q, i) => {
    console.log(`  ${i + 1}. ${q.question} ${DIM}[${q.category}]${R}`);
    console.log(`     ${DIM}Dicari: ${q.lookingFor}${R}`);
  });

  // ── Trace ──────────────────────────────────────────────────────────────────
  rule('AGENT TRACE');
  console.log();
  let promptTok = 0;
  let compTok = 0;
  for (const t of result.traces) {
    promptTok += t.promptTokens;
    compTok += t.completionTokens;
    const status = t.ok ? `${GREEN}✓${R}` : `${RED}✗${R}`;
    const repaired = t.repaired ? ` ${YELLOW}(repaired)${R}` : '';
    console.log(
      `  ${status} ${t.agent.padEnd(30)} ${String(t.latencyMs).padStart(6)} ms  ${String(
        t.completionTokens,
      ).padStart(5)} tok${repaired}`,
    );
    if (t.repairReason) console.log(`     ${DIM}${t.repairReason.slice(0, 160)}${R}`);
  }
  console.log(
    `\n  ${B}${result.traces.length} pemanggilan Gemma${R} · ${(result.totalLatencyMs / 1000).toFixed(1)} detik · ${promptTok + compTok} token total`,
  );

  const jsonPath = arg('--json');
  if (jsonPath) {
    await writeFile(jsonPath, JSON.stringify(result, null, 2), 'utf8');
    console.log(`\n${DIM}Hasil lengkap disimpan ke ${jsonPath}${R}`);
  }
  console.log();
}

main().catch((err: unknown) => {
  console.error(`\n${RED}✗ ${err instanceof Error ? err.message : String(err)}${R}\n`);
  process.exitCode = 1;
});
