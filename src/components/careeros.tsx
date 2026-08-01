'use client';

import { useRef, useState } from 'react';
import type { AgentTrace, OnboardingResult } from '@/lib/agents';
import { Dashboard } from './dashboard';
import {
  AGENTS,
  agentKeyFor,
  nowStamp,
  SwarmPanel,
  type AgentStatus,
  type LogLine,
} from './swarm-panel';
import { Badge, Button, Card, CardHead, Logo, SoonBadge } from './ui';

type Phase = 'idle' | 'running' | 'done';

export const APP_NAME = 'Gemma Career OS';

const GOAL_EXAMPLES = [
  'Pindah dari QA menjadi Product Manager',
  'Naik gaji ke 20 juta',
  'Kerja remote di perusahaan global',
];

/** Ubah nama agent internal jadi kalimat yang dimengerti pengguna. */
const AGENT_COPY: Array<[string, string]> = [
  ['resume_specialist:parse', 'Membaca dan memetakan isi CV'],
  ['resume_specialist:rewrite', 'Menulis ulang bullet CV'],
  ['career_strategist:goal', 'Menerjemahkan tujuan karier'],
  ['career_strategist:plan', 'Menyusun rencana dan misi harian'],
  ['career_twin:refresh', 'Menyegarkan profil digital'],
  ['job_hunter', 'Menghitung peluang tiap lowongan'],
  ['ats_specialist', 'Mengecek kecocokan sistem ATS'],
  ['skill_mentor', 'Menyusun rencana belajar'],
  ['interview_coach:prepare', 'Menyiapkan pertanyaan interview'],
  ['career_health:explain', 'Menjelaskan Career Health'],
];

function describe(internal: string): string {
  const hit = AGENT_COPY.find(([k]) => internal.startsWith(k));
  return hit?.[1] ?? internal.replace(/[:_]/g, ' ');
}

/** Penanda urutan langkah pada form masukan. */
function StepDot({ n }: { n: number }) {
  return (
    <span className="flex size-5 items-center justify-center rounded-full bg-accent font-mono text-[10px] font-semibold text-white">
      {n}
    </span>
  );
}

export function CareerApp() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [goal, setGoal] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({});
  const abortRef = useRef<AbortController | null>(null);

  const addLog = (level: LogLine['level'], text: string, time = nowStamp()) =>
    setLogs((prev) => [...prev, { time, level, text }]);

  async function loadSample() {
    const res = await fetch('/api/sample-cv');
    setResumeText(await res.text());
    addLog('INFO', 'CV contoh dimuat ke editor.');
  }

  function handleProgress(status: string, at?: string) {
    const time = at ? nowStamp(new Date(at)) : nowStamp();
    const internal = status.split(' ')[0] ?? status;
    const key = agentKeyFor(internal);

    if (status.includes('selesai')) {
      if (key) setStatuses((p) => ({ ...p, [key]: 'done' }));
      addLog('OK', `${describe(internal)} — selesai`, time);
    } else if (status.includes('memperbaiki') || status.includes('mengulang')) {
      addLog('WARN', `${describe(internal)} — output dipulihkan otomatis`, time);
    } else {
      if (key) setStatuses((p) => ({ ...p, [key]: 'running' }));
      addLog('INFO', `${describe(internal)}…`, time);
    }
  }

  async function start() {
    setError(null);
    setResult(null);
    setLogs([]);
    setStatuses({});
    setPhase('running');
    addLog('INFO', `Mengirim CV & tujuan ke Gemma via Vertex AI Model Garden`);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText, goal }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;

          const event = JSON.parse(payload) as
            | { type: 'progress'; status: string; at?: string }
            | { type: 'done'; result: OnboardingResult }
            | { type: 'error'; message: string };

          if (event.type === 'progress') {
            handleProgress(event.status, event.at);
          } else if (event.type === 'done') {
            const traces: AgentTrace[] = event.result.traces;
            addLog(
              'OK',
              `Analisis selesai — ${traces.length} panggilan Gemma, ${(
                event.result.totalLatencyMs / 1000
              ).toFixed(1)} detik`,
            );
            setStatuses(Object.fromEntries(AGENTS.map((a) => [a.key, 'done' as AgentStatus])));
            setResult(event.result);
            setPhase('done');
          } else {
            throw new Error(event.message);
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const message = err instanceof Error ? err.message : String(err);
      addLog('WARN', `Gagal: ${message}`);
      setError(message);
      setPhase('idle');
    }
  }

  function reset() {
    abortRef.current?.abort();
    setResult(null);
    setLogs([]);
    setStatuses({});
    setError(null);
    setPhase('idle');
  }

  const canStart = goal.trim().length > 0 && resumeText.trim().length >= 100;

  return (
    <div className="min-h-dvh">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <p className="leading-tight font-semibold">
                Gemma <span className="text-accent">Career OS</span>
              </p>
              <p className="font-mono text-[10px] text-ink-3">
                Partner karier bertenaga Gemma di Vertex AI
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {phase === 'running' && (
              <Badge tone="warn">
                <span className="size-1.5 animate-pulse rounded-full bg-warn" />
                MENGANALISIS
              </Badge>
            )}
            {phase === 'done' && (
              <Button variant="ghost" onClick={reset}>
                Mulai ulang
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* ── Dua kolom ───────────────────────────────────────────────── */}
      <main className="mx-auto grid max-w-[1600px] items-start gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {result ? (
            <Dashboard result={result} />
          ) : (
            <Card className="animate-rise overflow-hidden">
              <CardHead
                title="Mulai dari sini"
                hint="Dua langkah — tujuan kariermu, lalu CV-mu"
                right={
                  <Badge tone={phase === 'running' ? 'warn' : 'neutral'}>
                    {phase === 'running' ? 'TERKUNCI' : 'MENUNGGU'}
                  </Badge>
                }
              />

              <div className="grid gap-6 p-5">
                {/* Langkah 1 — tujuan karier */}
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <StepDot n={1} />
                    <label htmlFor="goal" className="text-sm font-medium">
                      Apa tujuan kariermu?
                    </label>
                  </div>
                  <input
                    id="goal"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    disabled={phase === 'running'}
                    placeholder="Saya ingin…"
                    className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none transition placeholder:text-ink-3 focus:border-accent focus:ring-3 focus:ring-accent-soft disabled:opacity-60"
                  />
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {GOAL_EXAMPLES.map((ex) => (
                      <button
                        key={ex}
                        onClick={() => setGoal(ex)}
                        disabled={phase === 'running'}
                        className="rounded-full border border-line px-3 py-1 text-xs text-ink-2 transition hover:border-accent hover:bg-accent-soft hover:text-accent disabled:opacity-40"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Langkah 2 — CV */}
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <StepDot n={2} />
                      <label htmlFor="cv" className="text-sm font-medium">
                        CV kamu
                      </label>
                    </div>
                    <button
                      onClick={loadSample}
                      disabled={phase === 'running'}
                      className="text-xs text-accent transition hover:underline disabled:opacity-40"
                    >
                      pakai CV contoh
                    </button>
                  </div>

                  {/* Upload PDF — tampilan saja, belum aktif */}
                  <div
                    aria-disabled
                    className="mb-3 flex cursor-not-allowed flex-wrap items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface-2/50 px-4 py-3.5"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-ink-3 shadow-sm">
                      <svg viewBox="0 0 24 24" className="size-4.5" fill="none" strokeWidth={2} stroke="currentColor">
                        <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" strokeLinecap="round" />
                      </svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink-2">
                        Unggah CV dalam PDF
                        <SoonBadge />
                      </p>
                      <p className="mt-0.5 text-xs text-ink-3">
                        Nanti CV bisa langsung diunggah dan dibaca otomatis. Untuk sekarang,
                        tempel teksnya di bawah.
                      </p>
                    </div>
                  </div>

                  <textarea
                    id="cv"
                    value={resumeText}
                    onChange={(e) => setResumeText(e.target.value)}
                    disabled={phase === 'running'}
                    rows={14}
                    placeholder="Tempel teks CV-mu di sini…"
                    className="w-full resize-y rounded-xl border border-line bg-surface-2/40 px-4 py-3 font-mono text-xs leading-relaxed outline-none transition placeholder:text-ink-3 focus:border-accent focus:bg-surface focus:ring-3 focus:ring-accent-soft disabled:opacity-60"
                  />
                  <p className="mt-2 font-mono text-[11px] text-ink-3">
                    {resumeText.trim().length} karakter
                    {resumeText.trim().length > 0 && resumeText.trim().length < 100
                      ? ' — minimal 100'
                      : ''}
                  </p>
                </div>

                {error && (
                  <p className="rounded-xl border border-bad/25 bg-bad-soft px-3.5 py-2.5 text-sm text-bad">
                    {error}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                  <p className="text-xs text-ink-3">
                    Analisis penuh memanggil Gemma 10 kali — sekitar 2 menit.
                  </p>
                  <Button onClick={start} disabled={!canStart || phase === 'running'}>
                    {phase === 'running' ? 'Menganalisis…' : 'Jalankan analisis'}
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>

        <div className="min-w-0 lg:sticky lg:top-[4.5rem]">
          <SwarmPanel
            statuses={statuses}
            logs={logs}
            phase={phase}
            traces={result?.traces}
          />
        </div>
      </main>
    </div>
  );
}
