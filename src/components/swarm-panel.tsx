'use client';

import { useEffect, useRef } from 'react';
import type { AgentTrace } from '@/lib/agents';
import { Badge, Card, CardHead } from './ui';

export const GEMMA_MODEL_ID = 'publishers/google/models/gemma-4-26b-a4b-it-maas';

/** Tujuh agent yang ditampilkan ke pengguna, beserta pola nama internalnya. */
export const AGENTS = [
  {
    key: 'resume_specialist',
    name: 'Resume Specialist',
    desc: 'Membaca CV, menilai kualitas, menulis ulang bullet',
  },
  {
    key: 'career_strategist',
    name: 'Career Strategist',
    desc: 'Menerjemahkan tujuan, menyusun milestone & misi harian',
  },
  {
    key: 'career_twin',
    name: 'Career Twin',
    desc: 'Membangun profil digital yang tumbuh bersama pengguna',
  },
  { key: 'job_hunter', name: 'Job Hunter', desc: 'Merangking lowongan berdasarkan peluang lolos' },
  { key: 'ats_specialist', name: 'ATS Specialist', desc: 'Mengecek keyword & penghalang wajib' },
  { key: 'skill_mentor', name: 'Skill Mentor', desc: 'Menyusun rencana belajar per dampak/jam' },
  {
    key: 'interview_coach',
    name: 'Interview Coach',
    desc: 'Menyiapkan pertanyaan & menilai jawaban',
  },
  { key: 'career_health', name: 'Career Health', desc: 'Menghitung skor dan menjelaskan hambatan' },
] as const;

export type AgentKey = (typeof AGENTS)[number]['key'];
export type AgentStatus = 'idle' | 'running' | 'done';

export interface LogLine {
  time: string;
  level: 'INFO' | 'OK' | 'WARN';
  text: string;
}

/** Nomor agent yang belum jalan diberi rona empat warna Google bergantian. */
const IDLE_TINT = [
  'border-g-blue/25 bg-g-blue/10 text-g-blue',
  'border-g-red/25 bg-g-red/10 text-g-red',
  'border-g-yellow/35 bg-g-yellow/15 text-warn',
  'border-g-green/25 bg-g-green/10 text-good',
];

const LEVEL_STYLE: Record<LogLine['level'], string> = {
  INFO: 'text-ink-3',
  OK: 'text-good',
  WARN: 'text-warn',
};

export function agentKeyFor(internalName: string): AgentKey | null {
  const found = AGENTS.find((a) => internalName.startsWith(a.key));
  return found?.key ?? null;
}

export function nowStamp(date = new Date()): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(
    Math.floor(date.getMilliseconds() / 10),
  )}`;
}

export function SwarmPanel({
  statuses,
  logs,
  phase,
  traces,
}: {
  statuses: Record<string, AgentStatus>;
  logs: LogLine[];
  phase: 'idle' | 'running' | 'done';
  traces?: AgentTrace[];
}) {
  const logRef = useRef<HTMLDivElement>(null);

  // Log baru selalu terlihat tanpa pengguna perlu menggulir.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [logs.length]);

  const totalTokens = traces?.reduce((a, t) => a + t.promptTokens + t.completionTokens, 0) ?? 0;

  return (
    <div className="flex h-full flex-col gap-4">
      <Card className="overflow-hidden">
        <CardHead
          title="Gemma Agent Swarm"
          hint="Vertex AI Model Garden"
          right={
            <Badge tone={phase === 'running' ? 'warn' : phase === 'done' ? 'good' : 'neutral'}>
              {phase === 'running' && (
                <span className="size-1.5 animate-pulse rounded-full bg-warn" />
              )}
              {phase === 'running' ? 'BEKERJA' : phase === 'done' ? 'SELESAI' : 'SIAP'}
            </Badge>
          }
        />

        <p className="border-b border-line bg-surface-2/60 px-5 py-2 font-mono text-[11px] break-all text-ink-2">
          {GEMMA_MODEL_ID}
        </p>

        <ul className="divide-y divide-line">
          {AGENTS.map((agent, i) => {
            const status = statuses[agent.key] ?? 'idle';
            return (
              <li
                key={agent.key}
                className={`flex items-start gap-3 px-5 py-3 transition-colors ${
                  status === 'running' ? 'bg-warn-soft/60' : status === 'done' ? 'bg-good-soft/40' : ''
                }`}
              >
                <span
                  className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border font-mono text-[11px] transition-colors ${
                    status === 'done'
                      ? 'border-good/25 bg-good-soft text-good'
                      : status === 'running'
                        ? 'border-warn/25 bg-warn-soft text-warn'
                        : IDLE_TINT[i % IDLE_TINT.length]
                  }`}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{agent.name}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{agent.desc}</p>
                </div>

                {status === 'done' && <Badge tone="good">SELESAI</Badge>}
                {status === 'running' && (
                  <span className="mt-1 size-3.5 shrink-0 animate-spin rounded-full border-2 border-line border-t-warn" />
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="flex min-h-64 flex-1 flex-col overflow-hidden">
        <CardHead
          title="Log Penalaran Swarm"
          right={<Badge tone="accent">STRUCTURED JSON</Badge>}
        />
        <div ref={logRef} className="thin-scroll flex-1 overflow-y-auto px-5 py-3">
          {logs.length === 0 ? (
            <p className="font-mono text-xs text-ink-3">
              Menunggu perintah. Isi tujuan karier dan CV, lalu jalankan analisis.
            </p>
          ) : (
            <ul className="grid gap-1.5">
              {logs.map((line, i) => (
                <li key={i} className="flex gap-2 font-mono text-[11px] leading-relaxed">
                  <span className="shrink-0 text-ink-3 tabular-nums">{line.time}</span>
                  <span className={`shrink-0 ${LEVEL_STYLE[line.level]}`}>[{line.level}]</span>
                  <span className="min-w-0 text-ink-2">{line.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {traces && traces.length > 0 && (
          <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-surface-2/60 px-5 py-2.5 font-mono text-[11px] text-ink-2">
            <span>{traces.length} panggilan Gemma</span>
            <span>{totalTokens.toLocaleString('id-ID')} token</span>
            {traces.some((t) => t.repaired) && (
              <span className="text-warn">
                {traces.filter((t) => t.repaired).length} dipulihkan otomatis
              </span>
            )}
          </footer>
        )}
      </Card>
    </div>
  );
}
