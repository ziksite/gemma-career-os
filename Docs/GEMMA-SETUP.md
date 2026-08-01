# Gemma Integration — Setup & Usage

Integrasi Gemma untuk **Gemma Career OS**, via Vertex AI Model Garden (OpenAI-compatible endpoint).
Model: `google/gemma-4-26b-a4b-it-maas` — sesuai ketentuan Gemma Hackathon Cloud Next Extended.

---

## 1. Setup (2 menit)

```powershell
# dependency sudah terinstall; kalau di mesin lain:
npm install

# isi kredensial
Copy-Item .env.example .env
```

Buka `.env`, isi **`GOOGLE_CLOUD_PROJECT`** dengan Project ID dari akun Gemini Enterprise Agent
yang diberikan panitia.

### Pilih satu cara autentikasi

| Cara | Kapan dipakai | Isi di `.env` |
|---|---|---|
| **Access token manual** | Paling cepat saat hari-H hackathon. Umur token ~60 menit. | `GOOGLE_ACCESS_TOKEN=ya29....` |
| **Service Account key** | Paling stabil, tidak butuh gcloud CLI, aman untuk deploy. | `GOOGLE_APPLICATION_CREDENTIALS=./secrets/sa-key.json` |
| **gcloud CLI / ADC** | Kalau gcloud SDK sudah terpasang. | *(kosongkan keduanya)* |

> **Status mesin ini:** `gcloud` **belum terinstall**. Jadi gunakan opsi 1 atau 2, atau
> install [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) dulu lalu jalankan
> `gcloud auth application-default login`.

Token manual bisa diambil dari Cloud Shell (browser, tanpa install apa pun):

```bash
gcloud auth print-access-token
```

**Jangan commit `.env` atau file key.** Keduanya sudah masuk `.gitignore` —
penting karena repo hackathon wajib publik.

---

## 2. Verifikasi

```powershell
npm run gemma:test
```

Menguji 4 hal yang jadi fondasi Gemma Career OS:
1. Auth + koneksi ke Vertex AI
2. Chat non-streaming (termasuk deteksi *thinking*)
3. Streaming token-per-token
4. Structured JSON output — pola yang dipakai semua agent

Tanya cepat dari terminal:

```powershell
npm run gemma:ask -- "Bagaimana cara pindah dari QA ke Product Manager?"
```

Verifikasi tanpa lewat kode aplikasi (padanan snippet curl resmi):

```powershell
.\scripts\gemma.ps1 -ProjectId "your-project-id" -Prompt "Summer travel plan to Paris"
```

---

## 3. Cara pakai di kode

```ts
import { ask, chat, chatStream, chatJSON } from '@/lib/gemma';
```

### Jawaban singkat

```ts
const jawaban = await ask('Sebutkan 3 skill wajib Product Manager.');
```

### Chat lengkap (dapat usage, latency, thinking)

```ts
const res = await chat(
  [{ role: 'user', content: 'Review CV saya...' }],
  { system: 'Kamu Resume Specialist di Gemma Career OS.', maxTokens: 4096 },
);

res.text;        // jawaban final, blok <think> sudah dibuang
res.thinking;    // reasoning trace (null kalau enableThinking: false)
res.usage;       // { promptTokens, completionTokens, totalTokens }
res.latencyMs;
```

### Streaming (untuk UI chat)

```ts
for await (const chunk of chatStream(messages)) {
  process.stdout.write(chunk); // blok thinking otomatis di-filter dari stream
}
```

### Structured output — pola inti semua agent

```ts
interface AtsResult {
  ats_score: number;
  missing_keywords: string[];
  recommendation: string;
}

const { data } = await chatJSON<AtsResult>(
  [{ role: 'user', content: `JD:\n${jd}\n\nCV:\n${cv}\n\nKeluarkan JSON: ats_score, missing_keywords, recommendation.` }],
  { system: 'Kamu ATS Specialist di Gemma Career OS.' },
);

data.ats_score; // sudah objek TypeScript, siap masuk DB
```

`chatJSON` menurunkan temperature ke 0.2, menambah instruksi JSON-only, dan mem-parse output
lewat brace-matching — tahan terhadap code fence, prosa pembuka, dan tanda kurung di dalam string.

---

## 4. Struktur file

```
src/lib/gemma/
├── config.ts    Env & pembentukan URL endpoint (global / regional)
├── auth.ts      Access token: env token → service account/ADC → gcloud CLI, dengan cache
├── client.ts    chat / ask / chatStream / chatJSON + retry + parsing thinking
├── types.ts     ChatMessage, ChatOptions, GemmaResponse, GemmaError
└── index.ts     Public exports

scripts/
├── test-gemma.ts  Smoke test 4 kapabilitas
├── ask.ts         Tanya cepat via terminal
└── gemma.ps1      Padanan curl resmi (tanpa kode aplikasi)
```

---

## 5. Perilaku yang sudah ditangani

| Hal | Penanganan |
|---|---|
| Token expired (401/403) | Cache dibuang, token di-mint ulang, request diulang |
| Rate limit / 5xx | Retry 3x dengan exponential backoff (500ms → 1s → 2s) |
| Request menggantung | Timeout default 120 detik, bisa di-override + support `AbortSignal` |
| Output `<think>` bocor ke UI | Dipisah ke field `thinking`, difilter juga dari stream |
| Model membalas JSON dalam code fence / diselingi prosa | `extractJson` pakai brace-matching, bukan regex naif |
| Thinking terpotong karena `max_tokens` | Terdeteksi sebagai blok tidak tertutup, `text` dikembalikan kosong (bukan bocor) |

---

## 6. Catatan konfigurasi

- **Region.** Default `global` sesuai snippet resmi. Kalau diganti ke region spesifik
  (mis. `us-central1`), host otomatis jadi `us-central1-aiplatform.googleapis.com`.
- **`max_tokens`.** Snippet resmi memakai 128000. Default di sini **8192** — cukup untuk
  semua agent Gemma Career OS dan jauh lebih cepat untuk demo. Naikkan per-panggilan lewat
  `{ maxTokens: ... }` kalau perlu (mis. rewrite CV panjang).
- **`enable_thinking`.** Default aktif. Matikan (`enableThinking: false`) untuk agent yang
  butuh respons cepat seperti ranking lowongan — thinking menambah latensi cukup besar.

---

## 7. Lapisan di atasnya

Client ini adalah lapisan transport. Di atasnya sudah ada **agent layer + orchestrator**
(`src/lib/agents/`) — tujuh agent Gemma Career OS, Career Health Score, dan dua mode orchestration.
Lihat [ARCHITECTURE.md](ARCHITECTURE.md).

Agent tidak memanggil `chat()` langsung, melainkan lewat `runAgent()` yang menambahkan
validasi Zod dan repair pass. Kalau menambah agent baru, ikuti pola yang sama.

Yang belum dibangun: frontend Next.js, persistensi PostgreSQL, dan pencarian lowongan live.
