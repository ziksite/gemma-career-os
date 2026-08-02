'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from './ui';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = '.pdf,.txt,.md,application/pdf,text/plain,text/markdown';

interface LoadedFile {
  name: string;
  sizeBytes: number;
  pages: number | null;
  /** Blob URL untuk pratinjau dokumen asli; hanya untuk PDF. */
  previewUrl: string | null;
}

/**
 * Ekstraksi teks PDF di sisi klien.
 *
 * Dijalankan di browser, bukan server: berkas CV tidak perlu dikirim ke mana pun
 * selain teks hasilnya, dan tidak ada batas ukuran request yang perlu diurus.
 */
async function extractPdf(buffer: ArrayBuffer): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  // Salin buffer — pdf.js bisa memindahkan kepemilikannya ke worker.
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const lines: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = '';
    for (const item of content.items as Array<{ str?: string; hasEOL?: boolean }>) {
      if (typeof item.str !== 'string') continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line.trimEnd());
        line = '';
      }
    }
    if (line.trim()) lines.push(line.trimEnd());
    if (i < doc.numPages) lines.push('');
  }

  return {
    text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    pages: doc.numPages,
  };
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function CvInput({
  value,
  onChange,
  disabled = false,
  onUseSample,
}: {
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
  onUseSample: () => void | Promise<void>;
}) {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [tab, setTab] = useState<'teks' | 'dokumen'>('teks');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(null);

  // Blob URL harus dicabut agar berkas tidak menggantung di memori.
  const releaseUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  useEffect(() => releaseUrl, [releaseUrl]);

  async function handleFile(f: File) {
    setError(null);

    if (f.size > MAX_BYTES) {
      setError(`Berkas terlalu besar (${formatSize(f.size)}). Maksimal 10 MB.`);
      return;
    }

    const lower = f.name.toLowerCase();
    const isPdf = f.type === 'application/pdf' || lower.endsWith('.pdf');
    const isText = /\.(txt|md|markdown)$/.test(lower) || f.type.startsWith('text/');

    if (!isPdf && !isText) {
      setError(
        lower.endsWith('.docx') || lower.endsWith('.doc')
          ? 'Format Word belum didukung. Simpan CV sebagai PDF, atau tempel teksnya di bawah.'
          : 'Format tidak didukung. Pakai PDF, TXT, atau MD.',
      );
      return;
    }

    setBusy(true);
    releaseUrl();

    try {
      if (isPdf) {
        const buffer = await f.arrayBuffer();
        const { text, pages } = await extractPdf(buffer);

        if (text.length < 50) {
          setError(
            'PDF ini tidak punya lapisan teks — kemungkinan hasil pindaian atau foto. ' +
              'Salin teks CV-mu secara manual ke kotak di bawah.',
          );
          setBusy(false);
          return;
        }

        const url = URL.createObjectURL(f);
        urlRef.current = url;
        setFile({ name: f.name, sizeBytes: f.size, pages, previewUrl: url });
        onChange(text);
      } else {
        const text = await f.text();
        setFile({ name: f.name, sizeBytes: f.size, pages: null, previewUrl: null });
        onChange(text);
      }
      setTab('teks');
    } catch (err) {
      setError(`Gagal membaca berkas: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  function clearFile() {
    releaseUrl();
    setFile(null);
    setTab('teks');
    onChange('');
    if (inputRef.current) inputRef.current.value = '';
  }

  const chars = value.trim().length;
  const tooShort = chars > 0 && chars < 100;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {/* Area unggah */}
      {!file ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (disabled) return;
            const f = e.dataTransfer.files?.[0];
            if (f) void handleFile(f);
          }}
          onClick={() => !disabled && !busy && inputRef.current?.click()}
          role="button"
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (!disabled && !busy) inputRef.current?.click();
            }
          }}
          className={`mb-3 flex cursor-pointer flex-wrap items-center gap-3 rounded-xl border border-dashed px-4 py-4 transition ${
            dragging
              ? 'border-accent bg-accent-soft'
              : 'border-line-strong bg-surface-2/50 hover:border-accent hover:bg-accent-soft/50'
          } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-accent shadow-sm">
            {busy ? (
              <span className="size-4 animate-spin rounded-full border-2 border-line border-t-accent" />
            ) : (
              <svg viewBox="0 0 24 24" className="size-4.5" fill="none" strokeWidth={2} stroke="currentColor">
                <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" strokeLinecap="round" />
              </svg>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {busy ? 'Membaca berkas…' : 'Unggah CV — klik atau seret ke sini'}
            </p>
            <p className="mt-0.5 text-xs text-ink-3">
              PDF, TXT, atau MD · maksimal 10 MB · diproses di browser, tidak diunggah ke server
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              void onUseSample();
            }}
            disabled={disabled}
            className="shrink-0 rounded-full border border-line bg-surface px-3 py-1 text-xs text-accent transition hover:bg-accent-soft disabled:opacity-40"
          >
            pakai CV contoh
          </button>
        </div>
      ) : (
        /* Berkas termuat */
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2/50 px-4 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-good shadow-sm">
            <svg viewBox="0 0 24 24" className="size-4.5" fill="none" strokeWidth={2.5} stroke="currentColor">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="mt-0.5 font-mono text-[11px] text-ink-3">
              {formatSize(file.sizeBytes)}
              {file.pages ? ` · ${file.pages} halaman` : ''} · {chars.toLocaleString('id-ID')} karakter
              terbaca
            </p>
          </div>
          <button
            onClick={clearFile}
            disabled={disabled}
            className="shrink-0 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2 transition hover:border-bad/40 hover:text-bad disabled:opacity-40"
          >
            Ganti berkas
          </button>
        </div>
      )}

      {error && (
        <p className="mb-3 rounded-xl border border-warn/25 bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
          {error}
        </p>
      )}

      {/* Pratinjau */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
          <button
            onClick={() => setTab('teks')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              tab === 'teks' ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
            }`}
          >
            Teks yang dibaca AI
          </button>
          <button
            onClick={() => setTab('dokumen')}
            disabled={!file?.previewUrl}
            className={`rounded-md px-3 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
              tab === 'dokumen' ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
            }`}
          >
            Dokumen asli
          </button>
        </div>
        {tooShort && <Badge tone="warn">MINIMAL 100 KARAKTER</Badge>}
      </div>

      {tab === 'teks' ? (
        <>
          <textarea
            id="cv"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            rows={14}
            placeholder="Unggah CV di atas, atau tempel teksnya langsung di sini…"
            className="w-full resize-y rounded-xl border border-line bg-surface-2/40 px-4 py-3 font-mono text-xs leading-relaxed outline-none transition placeholder:text-ink-3 focus:border-accent focus:bg-surface focus:ring-3 focus:ring-accent-soft disabled:opacity-60"
          />
          <p className="mt-2 text-[11px] text-ink-3">
            Teks ini yang dibaca agent — silakan rapikan dulu kalau hasil ekstraksinya berantakan.
          </p>
        </>
      ) : (
        <object
          data={file?.previewUrl ?? ''}
          type="application/pdf"
          className="h-[26rem] w-full rounded-xl border border-line bg-surface-2"
          aria-label={`Pratinjau ${file?.name ?? 'dokumen'}`}
        >
          <p className="p-4 text-sm text-ink-2">
            Browser ini tidak bisa menampilkan PDF di halaman.{' '}
            <a
              href={file?.previewUrl ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline"
            >
              Buka di tab baru
            </a>
          </p>
        </object>
      )}
    </div>
  );
}
