# Gemma Career OS — Partner Karier Bertenaga AI

Gemma Hackathon · Cloud Next Extended Jakarta

Gemma Career OS bukan resume builder, bukan ATS checker, bukan job portal. Gemma Career OS adalah
**AI career partner**: pengguna cukup mengunggah CV dan menyebut tujuan kariernya,
lalu tujuh agent yang dijalankan Gemma bekerja bersama menghasilkan penilaian,
rencana, dan langkah harian yang konkret.

```
CV + "Saya ingin pindah dari QA jadi Product Manager"
        ↓
   Gemma Orchestrator
        ↓
Resume Specialist → Career Strategist → Career Twin
        ↓                    ↓
   Job Hunter  ∥  Interview Coach
        ↓
  ATS Specialist
        ↓
Resume Rewrite ∥ Skill Mentor ∥ Career Plan
        ↓
Career Health Score + Career Mission
```

---

## Quickstart

```powershell
npm install
Copy-Item .env.example .env      # isi GOOGLE_CLOUD_PROJECT + kredensial
npm run gemma:test               # pastikan koneksi Gemma hidup
npm run dev                      # buka http://localhost:3000
```

Detail autentikasi ada di [Docs/GEMMA-SETUP.md](Docs/GEMMA-SETUP.md).

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Aplikasi web — tulis tujuan, tempel CV, lihat agent bekerja live |
| `npm run demo` | Alur yang sama di terminal, berguna untuk debugging |
| `npm run route -- "..."` | Mode agentic: Gemma memilih agent yang relevan |
| `npm run gemma:test` | Smoke test koneksi & kapabilitas Gemma |
| `npm run gemma:ask -- "..."` | Tanya bebas ke Gemma (streaming) |
| `npm test` | 14 tes offline, tanpa memanggil API |
| `npm run typecheck` | Typecheck TypeScript |

Opsi demo:

```powershell
npm run demo -- --goal "Saya ingin jadi Business Analyst"
npm run demo -- --cv ./data/cv-saya.txt --json hasil.json
```

## Struktur

```
src/app/            Next.js App Router — halaman + API route (SSE progres)
src/components/     UI: onboarding, live agent trace, dashboard
src/lib/gemma/      Client Gemma: auth, chat, streaming, structured output
src/lib/agents/     Tujuh agent + orchestrator + Career Health
scripts/            Demo dan utilitas CLI
tests/              Tes offline (logika deterministik + wiring orchestrator)
data/               CV dan lowongan contoh untuk demo
Docs/               Setup, arsitektur, materi hackathon
```

## Status

| Bagian | Status |
|---|---|
| Client Gemma (auth, retry, streaming, JSON terstruktur) | Selesai, teruji ke Vertex AI |
| 7 agent + orchestrator + Career Health | Selesai, 10/10 agent lolos tanpa repair |
| Frontend Next.js + dashboard | Selesai, alur penuh diverifikasi dari browser (~100 detik) |
| Persistensi (PostgreSQL / Cloud SQL) | Belum dibangun — hasil hanya ada di state browser |
| Pencarian lowongan live | Belum — lowongan disuplai dari `data/sample-jobs.json` |

Tiga temuan dari pengujian nyata — cara `enable_thinking` merusak output terstruktur, variasi
bentuk JSON yang dikirim Gemma, dan kutip tanpa escape — beserta penanganannya ada di
[Docs/ARCHITECTURE.md](Docs/ARCHITECTURE.md#tiga-temuan-dari-pengujian-nyata-ke-vertex-ai).

Arsitektur lengkap dan rencana selanjutnya: [Docs/ARCHITECTURE.md](Docs/ARCHITECTURE.md).
