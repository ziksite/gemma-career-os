# Gemma Career OS — Arsitektur

Dokumen ini jadi bahan mentah untuk Kaggle write-up dan blog submission.
Yang **sudah dibangun** dan yang **belum** dibedakan secara eksplisit — supaya tidak ada
klaim yang tidak bisa diverifikasi juri.

---

## 1. Masalah

Mencari kerja hari ini berarti memakai lima alat terpisah yang tidak saling bicara:
job portal, resume builder, ATS checker, cover letter generator, dan interview simulator.
Pencari kerja yang menanggung beban integrasinya — mereka yang harus mengingat konteks,
memindahkan data antar-tools, dan memutuskan langkah berikutnya.

Akibatnya orang melamar secara membabi buta: 100 lamaran, 3 balasan, tanpa pernah tahu
penyebab penolakannya keyword yang kurang, pengalaman yang tidak relevan, atau target
yang memang terlalu tinggi.

## 2. Solusi

Satu partner AI yang memegang konteks penuh dan mengambil inisiatif. Pengguna menyatakan
tujuan, bukan memberi perintah per-langkah.

Perbedaan intinya: alat lain **menjawab pertanyaan**; Gemma Career OS **punya tujuan** —
membuat pengguna diterima kerja — dan bekerja mundur dari situ.

## 3. Peran Gemma

Gemma bukan pelengkap; Gemma adalah mesin penilaiannya. Setiap keputusan yang butuh
pertimbangan dijalankan Gemma:

| Keputusan | Agent | Output Gemma |
|---|---|---|
| Apa isi CV ini sebenarnya | Resume Specialist | Profil terstruktur + level tiap skill beserta buktinya |
| Apa maksud tujuan karier user | Career Strategist | Target role, gaji, industri dari kalimat bebas |
| Seberapa besar peluang lolos lowongan X | Job Hunter | matchScore + verdict + gap per lowongan |
| Kenapa CV ini ditolak ATS | ATS Specialist | Keyword hilang, hard blocker, skor |
| Bagaimana memperbaiki CV | Resume Specialist | Bullet ditulis ulang, sebelum → sesudah |
| Apa yang harus dipelajari lebih dulu | Skill Mentor | Roadmap diurutkan per dampak/jam |
| Rencana realistis menuju target | Career Strategist | Milestone + misi harian + risiko |
| Apa yang akan ditanya pewawancara | Interview Coach | Pertanyaan + sinyal yang dicari |
| Kenapa skor saya segini | Career Health | Penghambat utama + quick wins |

**Yang sengaja TIDAK diserahkan ke Gemma**, dengan alasannya:

- **Agregasi Career Health Score** — dihitung deterministik dengan bobot tetap
  ([career-health.ts](../src/lib/agents/career-health.ts)). Kalau LLM yang menjumlahkan,
  skor pengguna akan naik-turun sendiri tanpa mereka melakukan apa pun. Gemma tetap
  dipakai untuk *menjelaskan* angkanya.
- **Penggabungan state Career Twin** — dilakukan di kode
  ([career-twin.ts](../src/lib/agents/career-twin.ts)). Menyuruh model "perbarui profil ini"
  berisiko menghapus atau mengarang data lama. Aturan seperti "level skill hanya boleh naik"
  ditegakkan kode, bukan prompt.

Batasan ini adalah bagian dari desain: LLM untuk penilaian, kode untuk invarian.

## 4. Arsitektur agent

```
                    ┌─────────────────┐
   input bebas ───► │  Orchestrator   │ ──► route(): Gemma memilih agent
                    │    (Gemma)      │
   CV + tujuan ───► │                 │ ──► runOnboarding(): pipeline tetap
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
 Resume Specialist   Career Strategist       Career Twin
        │                    │                    │
        └────────────────────┴──────────┬─────────┘
                                        ▼
                        ┌───────────────┴───────────────┐
                        ▼                               ▼
                   Job Hunter                   Interview Coach     (paralel)
                        │
                        ▼
                  ATS Specialist
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
 Resume Rewrite   Skill Mentor    Career Plan               (paralel)
        └───────────────┼───────────────┘
                        ▼
              Career Health Score
```

**Dua mode orchestration:**

- `runOnboarding()` — urutan tetap. Dipilih karena tiap tahap memang bergantung pada output
  tahap sebelumnya, dan alur pengguna inti harus bisa diandalkan saat demo. Dua titik
  dijalankan paralel (`Promise.all`) di mana ketergantungannya memang tidak ada.
- `route()` — Gemma yang memutuskan agent mana yang relevan untuk permintaan bebas.

**Kenapa bukan satu prompt besar:** tiap agent punya schema output sendiri yang divalidasi
terpisah. Kalau satu agent gagal, sisanya tetap jalan dan kegagalannya terlihat di trace —
bukan satu blob JSON raksasa yang gagal seluruhnya karena satu field.

## 5. Penanganan prompt & output

Ini bagian yang paling menentukan keandalan, dan ada di
[shared.ts](../src/lib/agents/shared.ts):

1. **Persona bersama** — semua agent memakai `BASE_PERSONA` yang sama, jadi di mata pengguna
   tetap terasa satu AI. Prinsip di dalamnya eksplisit: jujur meski tidak menyenangkan,
   berbasis bukti dari CV/JD, konteks pasar kerja Indonesia.
2. **Instruksi JSON-only** ditambahkan otomatis ke setiap system prompt.
3. **Validasi Zod** atas output. Bukan `as Type`.
4. **Repair pass** — kalau validasi gagal, output yang salah dikirim balik ke Gemma
   bersama daftar error validasinya, dengan temperature 0.1. Diuji di
   [tests/orchestrator.test.ts](../tests/orchestrator.test.ts).
5. **Trace** — tiap pemanggilan dicatat: agent, latensi, token, apakah lewat repair.
   Ditampilkan di akhir demo.

Penanganan khusus Gemma di [client.ts](../src/lib/gemma/client.ts):

- `enable_thinking` menghasilkan blok `<think>`. Blok ini dipisah ke field `thinking`,
  dan difilter juga dari stream supaya tidak bocor ke UI.
- Blok thinking yang terpotong `max_tokens` terdeteksi sebagai blok tak tertutup dan
  `text` dikembalikan kosong — lebih baik gagal jelas daripada menampilkan reasoning
  mentah sebagai jawaban.
- Ekstraksi JSON pakai brace-matching, bukan regex, jadi tahan terhadap code fence,
  prosa pembuka, dan kurung kurawal di dalam string.

### Tiga temuan dari pengujian nyata ke Vertex AI

Ketiganya baru terlihat setelah pipeline benar-benar dijalankan, bukan dari membaca dokumentasi.

**1. `enable_thinking` merusak output terstruktur.** Snippet resmi mengaktifkannya. Diukur pada
`gemma-4-26b`: reasoning memakan ~1.900 karakter sebelum jawaban mulai ditulis. Pada permintaan
JSON, jatah `max_tokens` habis di tengah reasoning dan JSON-nya terpotong — `finish_reason`
kembali sebagai `length` dengan `text` kosong. Latensi satu panggilan juga turun dari
**32,5 detik menjadi 10,5 detik** setelah dimatikan. Sekarang default MATI untuk semua agent;
tetap bisa dinyalakan per-panggilan bila jejak penalaran memang dibutuhkan.

**2. Kepatuhan schema gagal pada bentuk, bukan isi.** Menjalankan pipeline penuh mencatat
5 dari 10 agent masuk jalur repair. Setelah alasannya dicatat, polanya seragam — isinya selalu
benar, hanya pembungkusnya berbeda:

| Yang dikirim Gemma | Yang diminta schema |
|---|---|
| `languages: [{name, level}]` | array of string |
| `id: 1` | `"q1"` |
| `reasons: "satu kalimat"` | array |
| `resources: "A, B, C"` | array |
| `week: "Minggu 4"` | `4` |
| `gapAssessment: {ringkasan, catatan}` | string |

Solusinya bukan memaksa model lebih patuh, melainkan schema yang menerima variasi:
`looseString` meratakan objek, `looseNumber` menarik angka dari kalimat dan menjepit nilai
di luar batas, `looseArray` membungkus nilai tunggal. Hasilnya **repair turun dari 5/10 ke 0/10**
dan total waktu pipeline dari **174 detik menjadi 112 detik**.

Satu detail yang sengaja dijaga: `looseArray` memecah string hanya pada baris baru dan titik
koma, **tidak pada koma**. Koma lazim muncul di tengah kalimat Indonesia, dan memecahnya akan
merusak makna. Aturan ini dikunci oleh tes.

**3. Output terpotong ditangani terpisah dari schema meleset.** Kalau `finish_reason` bernilai
`length` atau JSON tidak terbaca, agent mengulang dengan `max_tokens` dua kali lipat — bukan
mengirim ulang ke Gemma dengan pesan error validasi, karena masalahnya ruang tulis, bukan
pemahaman. Trace mencatat alasannya (`output tidak terbaca` vs `schema meleset` vs
`sintaks JSON rusak`) supaya ketiganya bisa dibedakan saat menelusuri masalah.

**4. JSON-nya kadang rusak secara sintaks, dan sifatnya acak.** Menjalankan lewat UI memunculkan
kegagalan yang tidak pernah muncul di CLI: Gemma menulis tanda kutip ganda di dalam nilai string
tanpa escape — `"Transisi dari "mencari bug" ke ..."` — sehingga string berakhir lebih awal dan
sisa kalimat menjadi token liar. Ini bergantung pada kalimat yang kebetulan dihasilkan, jadi
tidak bisa diandalkan hilang dengan mengubah prompt.

Penanganannya berlapis, dari yang paling murah:

1. `repairJsonText` memperbaiki secara deterministik — meng-escape kutip yang bukan penutup
   (pada JSON sah, kutip penutup selalu diikuti `,` `}` `]` `:` atau akhir teks), baris baru
   mentah, dan koma menggantung. Tanpa panggilan tambahan.
2. Kalau pelacakan kurung ikut kacau, ekstraksi diulang sampai kurung penutup terakhir.
3. Barulah, sebagai upaya terakhir, teks rusak itu dikirim balik ke Gemma untuk ditulis ulang.

Lapisan 1–2 gratis; lapisan 3 menambah satu panggilan tetapi hanya jalan saat benar-benar perlu.

**Prompt constraint yang penting untuk kualitas output:**

| Constraint | Alasan |
|---|---|
| "Kalau CV tidak punya angka, JANGAN mengarang. Tulis `[isi: ...]`" | Mencegah CV berisi klaim palsu |
| "Kalau ada hardBlockers, atsScore TIDAK BOLEH di atas 55" | Menahan model memberi skor optimistis |
| "proofOfWork harus artefak, bukan 'menyelesaikan kursus'" | Belajar harus jadi bukti yang bisa masuk CV |
| "Jangan memberi semua lowongan skor tinggi" | Ranking yang tidak membedakan tidak berguna |
| "modelAnswer memakai pengalaman NYATA kandidat" | Contoh jawaban fiktif tidak bisa dipakai |

## 6. Arsitektur Google Cloud

**Sudah dipakai:**

| Layanan | Peran |
|---|---|
| Vertex AI Model Garden | Menjalankan `gemma-4-26b-a4b-it-maas` lewat endpoint OpenAI-compatible |
| Google Cloud IAM | Autentikasi via service account / ADC, scope `cloud-platform` |

Aplikasinya sendiri Next.js App Router: satu route handler (`/api/onboarding`) menjalankan
pipeline dan mengalirkan progres tiap agent sebagai Server-Sent Events, supaya pengguna
melihat agent bekerja satu per satu alih-alih spinner kosong selama satu-dua menit.
Trace dikumpulkan per-eksekusi lewat `AsyncLocalStorage`, bukan variabel global, agar dua
request bersamaan tidak saling menimpa.

## 6a. Antarmuka

Layout dua kolom, tema terang:

- **Kiri — hasil.** Sebelum analisis: tujuan karier + CV. Sesudahnya: dashboard bertab
  (Ringkasan, Career Mission, Lowongan, CV & ATS, Skill, Interview). Tab dipakai supaya
  tidak jadi satu gulungan panjang — pengguna memilih apa yang ingin dilihat.
- **Kanan — proses.** Daftar delapan agent dengan status hidup (menunggu → bekerja → selesai),
  ditambah log bertimestamp dari SSE. ID model Gemma ditampilkan permanen.

Panel kanan bukan hiasan: arsitektur multi-agent jadi **terlihat dan terverifikasi**, bukan
sekadar diklaim di dokumen. Angka di footer-nya — jumlah panggilan, token, dan berapa output
yang dipulihkan otomatis — datang dari trace nyata, bukan hardcode.

Palet sengaja menghindari coral/ungu/mint yang lazim pada produk AI: dasar off-white hangat,
aksi hitam pekat, aksen teal dalam, dan warna semantik versi gelap (700) agar terbaca tegas
di latar terang.

**Rencana, belum dibangun** — dicantumkan sebagai desain, bukan klaim implementasi:

| Layanan | Peran yang direncanakan |
|---|---|
| Cloud Run | Hosting Next.js + API agent (stateless, cocok untuk beban berbasis request) |
| Cloud SQL (PostgreSQL) | Menyimpan Career Twin, riwayat lamaran, hasil mock interview |
| Cloud Storage | File CV asli yang diunggah |
| Cloud Tasks | Menjalankan agent proaktif di latar belakang saat ada lowongan baru |
| Vertex AI Embeddings + pgvector | Pencocokan CV ↔ lowongan secara semantik sebelum masuk ke Gemma |

Alasan pemilihan: seluruh beban bersifat request-based dan bursty, jadi Cloud Run lebih
masuk akal daripada GKE. Vector search ditaruh di pgvector alih-alih layanan terpisah
karena volume datanya masih kecil dan menambah satu layanan lagi tidak sepadan.

## 7. Batasan yang diketahui

Disebutkan terbuka karena juri menilai kejujuran teknis:

1. **Lowongan tidak live.** Job Hunter menerima daftar lowongan dari pemanggil
   (`data/sample-jobs.json`). Integrasi job board API belum ada — antarmukanya sudah
   disiapkan supaya sumbernya tinggal diganti. Ini **dinyatakan terbuka di dalam aplikasi**
   lewat spanduk "segera realtime" pada tab Lowongan, bukan disembunyikan: penilaian
   peluangnya nyata, daftarnya yang belum.
2. **PDF hasil pindaian belum bisa dibaca.** Unggah CV sudah berfungsi — PDF/TXT/MD, ekstraksi
   teks berjalan di browser lewat pdf.js sehingga berkasnya tidak pernah dikirim ke server, dan
   dokumen aslinya bisa dipratinjau berdampingan dengan teks hasil ekstraksi. Yang belum:
   PDF berupa foto atau pindaian tidak punya lapisan teks, sehingga ditolak dengan pesan yang
   mengarahkan pengguna menempel teksnya manual. OCR belum ada.
3. **Tidak ada persistensi.** Hasil onboarding hanya hidup di state browser. Refresh
   halaman berarti mengulang analisis dari awal, dan Career Twin tidak tumbuh antar-sesi
   seperti yang dijanjikan konsepnya.
4. **Belum ada autentikasi.** Satu pengguna per sesi browser.
5. **Career Health interviewReadiness masih tetap 40** saat onboarding, karena pengguna
   belum mengerjakan mock interview apa pun.
6. **Estimasi peluang belum terkalibrasi.** `matchScore` adalah penilaian Gemma, bukan
   probabilitas hasil dari data penerimaan nyata. Angkanya berguna untuk membandingkan
   antar-lowongan, bukan sebagai janji.
7. **Latensi masih ~100 detik** untuk satu alur penuh. Sudah turun dari 174 detik, tetapi
   tetap terasa lama. Penyebab terbesarnya tiga agent dengan output panjang
   (`resume_specialist:parse`, `interview_coach:prepare`, `career_strategist:plan`).
   Perbaikan berikutnya: tampilkan dashboard secara bertahap begitu tiap agent selesai,
   alih-alih menunggu seluruh pipeline.
8. **Token akses berumur ~60 menit** pada mode kredensial manual. Kalau habis di tengah
   analisis, seluruh proses gagal dan harus diulang.

## 8. Verifikasi

```powershell
npm run typecheck   # TypeScript strict, lulus
npm test            # 23 tes, lulus, tanpa jaringan
npm run build       # next build, lulus
npm run gemma:test  # butuh kredensial — menguji koneksi Gemma sungguhan
npm run demo        # butuh kredensial — alur pengguna inti di terminal
npm run dev         # butuh kredensial — aplikasi web
```

Yang diuji tes offline:
- Parsing output Gemma: blok thinking, code fence, JSON terpotong, kutip tanpa escape,
  baris baru mentah, koma menggantung
- Toleransi bentuk: objek→string, angka→string, string→array, gaji format Indonesia,
  skor di luar batas, dan jaminan koma di tengah kalimat tidak dipakai sebagai pemisah
- Career Health: determinisme, batas 0-100, bobot berjumlah 1.0, pemilihan komponen terlemah
- Career Twin: level skill tidak pernah turun, tidak ada duplikat, fungsi murni
- Orchestrator: semua agent terpanggil, data mengalir antar-agent, jalur repair berfungsi,
  Career Health dihitung dari output agent

Diverifikasi terhadap Vertex AI sungguhan (1 Agustus 2026, project hackathon):

| Yang diuji | Hasil |
|---|---|
| `npm run gemma:test` | Lulus — chat, streaming, structured output |
| `npm run demo` | Lulus — 10 agent, 0 repair, 112 detik |
| Aplikasi web dari browser | Lulus — dashboard tampil lengkap, 101,7 detik, 1 repair pulih |
