/** Elemen tampilan bersama — tema terang, gaya panel aplikasi. */

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent';

const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-2 border-line',
  good: 'bg-good-soft text-good border-good/20',
  warn: 'bg-warn-soft text-warn border-warn/20',
  bad: 'bg-bad-soft text-bad border-bad/20',
  accent: 'bg-accent-soft text-accent border-accent/20',
};

export function toneForScore(score: number): Tone {
  if (score >= 70) return 'good';
  if (score >= 45) return 'warn';
  return 'bad';
}

export function scoreColor(score: number): string {
  if (score >= 70) return 'var(--color-good)';
  if (score >= 45) return 'var(--color-warn)';
  return 'var(--color-bad)';
}

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-line bg-surface ${className}`}>
      {children}
    </section>
  );
}

export function CardHead({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
      <div className="min-w-0">
        <h2 className="label">{title}</h2>
        {hint && <p className="mt-0.5 truncate text-xs text-ink-2">{hint}</p>}
      </div>
      {right}
    </header>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  mono = true,
}: {
  children: React.ReactNode;
  tone?: Tone;
  mono?: boolean;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] leading-5 ${
        mono ? 'font-mono tracking-wide' : ''
      } ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

export function Bar({ score, label }: { score: number; label?: string }) {
  const value = Math.min(100, Math.max(0, score));
  return (
    <div className="flex items-center gap-3">
      {label && <span className="w-44 shrink-0 truncate text-sm text-ink-2">{label}</span>}
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${value}%`, background: scoreColor(value) }}
        />
      </div>
      <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-ink-2">
        {Math.round(value)}
      </span>
    </div>
  );
}

/** Cincin skor Career Health. */
export function ScoreRing({ score, size = 148 }: { score: number; size?: number }) {
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-surface-2)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={scoreColor(score)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[2.5rem] leading-none font-semibold tabular-nums">
          {Math.round(score)}
        </span>
        <span className="label mt-1.5">Career Health</span>
      </div>
    </div>
  );
}

const VERDICT = {
  apply_now: { label: 'LAMAR SEKARANG', tone: 'good' as Tone },
  improve_first: { label: 'PERBAIKI DULU', tone: 'warn' as Tone },
  skip: { label: 'LEWATI', tone: 'bad' as Tone },
};

export function VerdictTag({ verdict }: { verdict: keyof typeof VERDICT }) {
  const v = VERDICT[verdict];
  return <Badge tone={v.tone}>{v.label}</Badge>;
}

export function Button({
  children,
  onClick,
  disabled,
  variant = 'primary',
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
  className?: string;
}) {
  const style =
    variant === 'primary'
      ? 'bg-accent text-white shadow-sm enabled:hover:bg-accent/90 disabled:bg-line disabled:text-ink-3 disabled:shadow-none'
      : 'border border-line bg-surface text-accent enabled:hover:bg-accent-soft';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-5 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${style} ${className}`}
    >
      {children}
    </button>
  );
}

/** Penanda fitur yang belum aktif. Dipakai konsisten di seluruh aplikasi. */
export function SoonBadge({ children = 'SEGERA' }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-g-yellow/40 bg-warn-soft px-2 py-0.5 font-mono text-[10px] tracking-wide text-warn">
      <span className="size-1.5 rounded-full bg-g-yellow" />
      {children}
    </span>
  );
}

/** Logo empat titik warna Google. */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 grid-cols-2 gap-[3px] rounded-xl border border-line bg-surface p-2 shadow-sm"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span className="rounded-full bg-g-blue" />
      <span className="rounded-full bg-g-red" />
      <span className="rounded-full bg-g-yellow" />
      <span className="rounded-full bg-g-green" />
    </span>
  );
}
