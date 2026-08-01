'use client';

import { useState } from 'react';
import type { OnboardingResult } from '@/lib/agents';
import { Badge, Bar, Card, ScoreRing, SoonBadge, VerdictTag } from './ui';

const TABS = [
  { id: 'ringkasan', label: 'Ringkasan' },
  { id: 'misi', label: 'Career Mission' },
  { id: 'lowongan', label: 'Lowongan' },
  { id: 'cv', label: 'CV & ATS' },
  { id: 'skill', label: 'Skill' },
  { id: 'interview', label: 'Interview' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const COMPONENT_LABEL: Record<string, string> = {
  resumeQuality: 'Kualitas CV',
  atsCompatibility: 'Kecocokan ATS',
  experienceRelevance: 'Relevansi pengalaman',
  skillRelevancy: 'Relevansi skill',
  portfolioStrength: 'Kekuatan portofolio',
  interviewReadiness: 'Kesiapan interview',
  marketDemand: 'Permintaan pasar',
};

const FEASIBILITY = {
  realistic: { label: 'REALISTIS', tone: 'good' as const },
  stretch: { label: 'MENANTANG', tone: 'warn' as const },
  unrealistic: { label: 'TERLALU JAUH', tone: 'bad' as const },
};

function rupiah(n: number | null): string {
  return n === null ? '—' : `Rp${n.toLocaleString('id-ID')}`;
}

export function Dashboard({ result }: { result: OnboardingResult }) {
  const [tab, setTab] = useState<TabId>('ringkasan');
  const [done, setDone] = useState<Set<string>>(new Set());

  const { twin, health, healthExplanation, careerPlan, jobRanking, ats, resumeRewrite } = result;
  const jobById = new Map(result.jobs.map((j) => [j.id, j]));
  const feas = FEASIBILITY[careerPlan.feasibility];

  const toggle = (key: string) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const totalTasks = careerPlan.dailyMissions.reduce((a, d) => a + d.tasks.length, 0);

  return (
    <Card className="animate-rise overflow-hidden">
      {/* Identitas + target */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">TARGET</Badge>
            <h1 className="truncate text-lg font-semibold">
              {twin.goal?.targetRole ?? 'Target karier'}
            </h1>
          </div>
          <p className="mt-1.5 text-sm text-ink-2">
            {twin.fullName || 'Kandidat'} · {twin.currentRole || '—'} · {twin.yearsExperience} tahun
            {twin.goal?.targetSalaryIdr ? ` · target ${rupiah(twin.goal.targetSalaryIdr)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={feas.tone}>{feas.label}</Badge>
          <Badge>{careerPlan.estimatedWeeksToTarget} MINGGU</Badge>
        </div>
      </div>

      {/* Tab bagian */}
      <nav className="thin-scroll flex gap-1 overflow-x-auto border-b border-line px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === t.id ? 'bg-ink text-white' : 'text-ink-2 hover:bg-surface-2'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="p-5">
        {/* ── Ringkasan ─────────────────────────────────────────────── */}
        {tab === 'ringkasan' && (
          <div className="animate-rise grid gap-5">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
              <ScoreRing score={health.score} />
              <div className="w-full min-w-0 flex-1">
                <p className="label">Penghambat utama</p>
                <p className="mt-1 font-medium">{healthExplanation.biggestBlocker}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">
                  {healthExplanation.explanation}
                </p>
                <div className="mt-5 grid gap-2.5">
                  {Object.entries(health.components).map(([key, value]) => (
                    <Bar key={key} label={COMPONENT_LABEL[key] ?? key} score={value} />
                  ))}
                </div>
              </div>
            </div>

            {healthExplanation.quickWins.length > 0 && (
              <div className="rounded-lg border border-line bg-surface-2/50 p-4">
                <p className="label mb-3">Bisa dikerjakan hari ini</p>
                <ul className="grid gap-2">
                  {healthExplanation.quickWins.map((w) => (
                    <li key={w} className="flex gap-2.5 text-sm leading-relaxed">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="label mb-2">Profil terbaca</p>
              <p className="text-sm leading-relaxed text-ink-2">{twin.summary}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {twin.skills.slice(0, 12).map((s) => (
                  <Badge key={s.name} mono={false}>
                    {s.name}
                    <span className="text-ink-3">· {s.level}</span>
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Career Mission ────────────────────────────────────────── */}
        {tab === 'misi' && (
          <div className="animate-rise grid gap-5">
            <p className="text-sm leading-relaxed text-ink-2">{careerPlan.gapAssessment}</p>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="label">Lima hari pertama</p>
                <span className="font-mono text-xs text-ink-3">
                  {done.size}/{totalTasks} selesai
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {careerPlan.dailyMissions.map((day) => (
                  <div key={day.day} className="rounded-lg border border-line p-4">
                    <p className="label mb-3">Hari {day.day}</p>
                    <ul className="grid gap-2.5">
                      {day.tasks.map((task, i) => {
                        const key = `${day.day}-${i}`;
                        const checked = done.has(key);
                        return (
                          <li key={key}>
                            <button
                              onClick={() => toggle(key)}
                              className="flex w-full items-start gap-2.5 text-left"
                            >
                              <span
                                className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border text-[10px] transition ${
                                  checked
                                    ? 'border-ink bg-ink text-white'
                                    : 'border-line-strong text-transparent'
                                }`}
                              >
                                ✓
                              </span>
                              <span className="min-w-0">
                                <span
                                  className={`block text-sm leading-snug transition ${
                                    checked ? 'text-ink-3 line-through' : ''
                                  }`}
                                >
                                  {task.title}
                                </span>
                                <span className="mt-0.5 block font-mono text-[11px] text-ink-3">
                                  {task.estimatedMinutes} menit
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {careerPlan.milestones.length > 0 && (
              <div>
                <p className="label mb-3">Milestone</p>
                <ol className="border-l border-line">
                  {careerPlan.milestones.map((m) => (
                    <li key={`${m.week}-${m.title}`} className="relative py-2.5 pl-5">
                      <span className="absolute top-4 -left-[4.5px] size-2 rounded-full border-2 border-surface bg-accent" />
                      <p className="text-sm font-medium">
                        <span className="font-mono text-xs text-ink-3">M{m.week}</span> {m.title}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-2">{m.outcome}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {careerPlan.risks.length > 0 && (
              <div className="rounded-lg border border-warn/20 bg-warn-soft p-4">
                <p className="label mb-2 text-warn">Risiko</p>
                <ul className="grid gap-1.5">
                  {careerPlan.risks.map((r) => (
                    <li key={r} className="text-sm leading-relaxed text-ink-2">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ── Lowongan ──────────────────────────────────────────────── */}
        {tab === 'lowongan' && (
          <div className="animate-rise grid gap-3">
            {/* Sumber data masih contoh — dinyatakan terbuka, bukan disembunyikan. */}
            <div className="flex flex-wrap items-start gap-3 rounded-xl border border-g-yellow/35 bg-warn-soft px-4 py-3">
              <SoonBadge>SEGERA REALTIME</SoonBadge>
              <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-2">
                Lowongan di bawah masih dari kumpulan contoh, jadi penilaian peluangnya nyata
                tetapi daftarnya belum. Berikutnya: tarikan langsung dari LinkedIn, Jobstreet,
                Glints, dan Kalibrr, lalu Gemma menilai lowongan baru begitu muncul —
                tanpa kamu perlu membuka aplikasi.
              </p>
            </div>

            {[...jobRanking.matches]
              .sort((a, b) => b.matchScore - a.matchScore)
              .map((m) => {
                const job = jobById.get(m.jobId);
                return (
                  <div key={m.jobId} className="rounded-lg border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {job ? job.title : m.jobId}
                          {job && <span className="text-ink-2"> — {job.company}</span>}
                        </p>
                        {job && (
                          <p className="mt-0.5 font-mono text-[11px] text-ink-3">
                            {job.location} · {job.workType}
                            {job.salaryIdr ? ` · ${rupiah(job.salaryIdr)}` : ''}
                          </p>
                        )}
                      </div>
                      <VerdictTag verdict={m.verdict} />
                    </div>

                    <div className="mt-3">
                      <Bar score={m.matchScore} />
                    </div>

                    {m.reasons.length > 0 && (
                      <ul className="mt-3 grid gap-1">
                        {m.reasons.slice(0, 2).map((r) => (
                          <li key={r} className="text-sm leading-relaxed text-ink-2">
                            {r}
                          </li>
                        ))}
                      </ul>
                    )}

                    {m.potentialScoreAfterUpskilling !== null && (
                      <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-2">
                        Bisa naik ke{' '}
                        <span className="font-mono font-medium text-good">
                          {m.potentialScoreAfterUpskilling}%
                        </span>{' '}
                        setelah menutup: {m.missingRequirements.join(', ') || '—'}
                      </p>
                    )}
                  </div>
                );
              })}
            {jobRanking.summary && (
              <p className="text-sm leading-relaxed text-ink-2">{jobRanking.summary}</p>
            )}
          </div>
        )}

        {/* ── CV & ATS ──────────────────────────────────────────────── */}
        {tab === 'cv' && (
          <div className="animate-rise grid gap-5 lg:grid-cols-2">
            <div>
              <p className="label mb-3">
                ATS — {result.targetJob.title} @ {result.targetJob.company}
              </p>
              <Bar score={ats.atsScore} label="Skor ATS" />

              {ats.hardBlockers.length > 0 && (
                <div className="mt-4 rounded-lg border border-bad/20 bg-bad-soft p-3">
                  <p className="label mb-1.5 text-bad">Penghalang wajib</p>
                  <ul className="grid gap-1">
                    {ats.hardBlockers.map((h) => (
                      <li key={h} className="text-xs leading-relaxed text-ink-2">
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="label mt-4 mb-2">Sudah cocok</p>
              <div className="flex flex-wrap gap-1.5">
                {ats.matchedKeywords.map((k) => (
                  <Badge key={k} tone="good" mono={false}>
                    {k}
                  </Badge>
                ))}
              </div>

              <p className="label mt-4 mb-2">Masih kurang</p>
              <div className="flex flex-wrap gap-1.5">
                {ats.missingKeywords.map((k) => (
                  <Badge key={k} tone="bad" mono={false}>
                    {k}
                  </Badge>
                ))}
              </div>

              <p className="mt-4 text-sm leading-relaxed text-ink-2">{ats.recommendation}</p>
            </div>

            <div>
              <p className="label mb-3">Perbaikan CV — kualitas {resumeRewrite.resumeQualityScore}/100</p>
              <p className="rounded-lg border border-line bg-surface-2/50 p-3 text-sm leading-relaxed text-ink-2">
                {resumeRewrite.summary}
              </p>
              <ul className="mt-4 grid gap-4">
                {resumeRewrite.rewrittenHighlights.map((h) => (
                  <li key={h.before} className="border-l-2 border-line pl-4">
                    <p className="text-xs leading-relaxed text-ink-3 line-through">{h.before}</p>
                    <p className="mt-1 text-sm leading-relaxed">{h.after}</p>
                    <p className="mt-1 text-xs text-accent">{h.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ── Skill ─────────────────────────────────────────────────── */}
        {tab === 'skill' && (
          <div className="animate-rise">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge>{result.learningRoadmap.totalEstimatedHours} JAM TOTAL</Badge>
              <Badge tone="good">PELUANG +{result.learningRoadmap.expectedScoreGain}%</Badge>
            </div>
            <ol className="grid gap-4">
              {result.learningRoadmap.steps.map((s, i) => (
                <li key={s.skill} className="flex gap-3.5 rounded-lg border border-line p-4">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 font-mono text-xs">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">
                      {s.skill}
                      <span className="ml-2 font-mono text-xs font-normal text-ink-3">
                        {s.estimatedHours} jam
                      </span>
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-2">{s.why}</p>
                    {s.proofOfWork && (
                      <p className="mt-2 rounded-md bg-accent-soft px-3 py-2 text-xs leading-relaxed text-accent">
                        Bukti kerja: {s.proofOfWork}
                      </p>
                    )}
                    {s.resources.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {s.resources.map((r) => (
                          <Badge key={r} mono={false}>
                            {r}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* ── Interview ─────────────────────────────────────────────── */}
        {tab === 'interview' && (
          <div className="animate-rise">
            {result.interviewSet.focusAreas.length > 0 && (
              <>
                <p className="label mb-2">Fokus latihan</p>
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {result.interviewSet.focusAreas.map((f) => (
                    <Badge key={f} tone="accent" mono={false}>
                      {f}
                    </Badge>
                  ))}
                </div>
              </>
            )}
            <ol className="grid gap-3">
              {result.interviewSet.questions.map((q, i) => (
                <li key={q.id || i} className="rounded-lg border border-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm leading-relaxed">{q.question}</p>
                    <Badge>{q.category.replace('_', ' ').toUpperCase()}</Badge>
                  </div>
                  {q.lookingFor && (
                    <p className="mt-2 text-xs leading-relaxed text-ink-2">
                      <span className="text-ink-3">Yang dicari:</span> {q.lookingFor}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </Card>
  );
}
