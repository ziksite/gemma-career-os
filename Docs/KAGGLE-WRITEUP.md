# Gemma Career OS

**Partner karier bertenaga Gemma 4.**

Build with Gemma: Gemma Hacking Jakarta! Extended Series 26
Hackathon Writeup — 1 Agustus 2026

---

## Nama Proyek

Gemma Career OS

## Anggota Tim

- Dzikri Ramadhan
- Titon Meisya Kresna

## Pernyataan Masalah

Mencari kerja di Indonesia berarti menjalankan lima alat terpisah sekaligus: job portal
(LinkedIn, Jobstreet, Glints, Kalibrr), resume builder, ATS checker, cover letter generator, dan
simulator interview. Tidak satu pun saling berbagi konteks, sehingga beban integrasinya jatuh ke
pencari kerja — merekalah yang harus mengingat apa yang sudah dicoba dan memutuskan langkah
berikutnya.

Hasilnya melamar membabi buta. Seratus lamaran, tiga balasan, tanpa pernah tahu bagian mana yang
gagal: keyword yang kurang, pengalaman tidak relevan, atau target yang memang tidak realistis sejak
awal. Alat yang ada menjawab pertanyaan. Tidak ada yang berani berkata, *"jangan lamar yang ini
dulu — perbaiki dua hal berikut lebih dahulu."*

## Solusi yang Diusulkan

- **Ide utama: Gemma Career OS** — partner karier multi-agent yang ditenagai model open-weights
  Google, Gemma 4 26B, di Vertex AI Model Garden. Pengguna menyatakan tujuan, bukan memberi perintah
  satu per satu, lalu delapan agent bekerja mundur dari tujuan itu.
- **Target pengguna:** pencari kerja Indonesia, terutama yang sedang pindah jalur karier
  (QA → Product Manager, Engineer → Data, dan sejenisnya) dan butuh penilaian jujur soal seberapa
  jauh jaraknya.
- **Pengalaman inti:** tempel CV, sebutkan tujuan karier → swarm berjalan dan terlihat langsung di
  layar → satu dashboard menghasilkan Career Health Score, misi harian lima hari, ranking lowongan
  beserta peluang lolos, analisis gap ATS, CV yang ditulis ulang, roadmap belajar, dan pertanyaan
  interview.
- **Manfaat yang diharapkan:** pengguna tahu *mengapa* mereka ditolak dan apa yang harus dikerjakan
  minggu ini. Sistem ini dirancang untuk berani berkata "belum" — lowongan dengan skor 45%
  dikembalikan sebagai `improve_first` beserta gap persisnya, bukan dorongan untuk tetap melamar.

## Integrasi Gemma

Gemma adalah mesin penilaiannya, bukan lapisan perapi teks. Setiap keputusan yang butuh
pertimbangan adalah panggilan Gemma. Dijalankan di Vertex AI Model Garden (MaaS) melalui delapan
node agent:

- `resume_specialist` — mengurai teks CV mentah menjadi profil terstruktur dengan level skill yang
  disertai bukti dari CV, lalu menulis ulang bullet untuk peran target.
- `career_strategist` — menerjemahkan kalimat bebas ("gaji 20 juta") menjadi target terstruktur,
  lalu menyusun milestone, misi harian, dan risiko yang disebut spesifik.
- `career_twin` — memelihara profil digital pengguna.
- `job_hunter` — menilai tiap lowongan berdasarkan peluang lolos screening, mengembalikan
  `apply_now` / `improve_first` / `skip` beserta proyeksi skor setelah gap ditutup.
- `ats_specialist` — kecocokan keyword, penghalang wajib, dan skor ATS yang dibatasi: bila ada
  penghalang wajib, skor tidak boleh di atas 55.
- `skill_mentor` — roadmap belajar diurutkan berdasarkan dampak per jam, dan setiap langkah wajib
  menghasilkan artefak portofolio, bukan sertifikat kursus.
- `interview_coach` — pertanyaan yang menyasar titik terlemah kandidat, beserta sinyal yang dicari
  pewawancara.
- `career_health` — menjelaskan skor dengan bahasa awam dan menyebut satu penghambat utama.

### Yang sengaja TIDAK diserahkan ke Gemma

Agregasi Career Health Score dihitung di kode dengan bobot tetap, dan penggabungan state Career Twin
adalah fungsi murni. Kalau LLM yang menjumlahkan skor, angka pengguna akan naik-turun sendiri antar
sesi tanpa mereka melakukan apa pun. Kalau LLM yang menggabungkan profil, data lama bisa terhapus
atau dikarang diam-diam. Aturan seperti *"level skill hanya boleh naik"* ditegakkan kode. Gemma
menjelaskan angkanya; kode yang memegang invariannya.

### Pemberian petunjuk dan penanganan output

Setiap agent mengembalikan JSON yang divalidasi Zod saat runtime — bukan sekadar `as Type`. Tiga
mode kegagalan baru terlihat setelah pipeline benar-benar dijalankan ke Vertex AI, dan ketiganya
sudah ditangani:

| Kegagalan yang terjadi | Penanganan | Hasil terukur |
|---|---|---|
| `enable_thinking` memakan ~1.900 karakter sebelum menjawab, JSON terpotong | Dimatikan untuk output terstruktur | Satu panggilan **32,5 → 10,5 detik** |
| Isi benar, bentuk salah (`id: 1`, `reasons: "satu kalimat"`, `week: "Minggu 4"`) | Schema menerima variasi bentuk, bukan menolak | Repair **5/10 → 0/10 agent**; pipeline **174 → 112 detik** |
| Kutip ganda tanpa escape di dalam string JSON, sifatnya acak | Perbaikan deterministik, baru minta Gemma menulis ulang bila masih gagal | Pulih tanpa menggagalkan analisis |

Satu detail yang sengaja dijaga: pemisahan string menjadi array hanya dilakukan pada baris baru dan
titik koma, **tidak pada koma**, karena koma lazim berada di tengah kalimat Indonesia dan
memecahnya akan merusak makna. Aturan ini dikunci oleh tes.

## Alur Kerja Pengembangan Agen

### Penggunaan Antigravity

Seluruh proyek dikerjakan di dalam Antigravity IDE. Editor, terminal, dan pemeriksaan berada di satu
lingkungan, sehingga siklus *jalankan → baca kegagalan → perbaiki* berputar cepat. Dua contoh:

- **Perubahan lintas berkas.** Menghapus ekstensi `.js` dari seluruh import menyentuh 20 file — dan
  sempat merusak encoding UTF-8 pada semuanya. Kerusakan itu terdeteksi lalu dipulihkan dalam satu
  putaran, bukan ditemukan berjam-jam kemudian.
- **Perbaikan berbasis pengukuran.** Menjalankan `npm run demo` berulang sambil membaca trace tiap
  agent adalah cara temuan kedua ditemukan: dugaan awal soal enum terbantah, penyebab sebenarnya
  baru terbaca setelah alasan repair dicatat.

### Integrasi Skills / MCP

**Playwright MCP** dipakai untuk memverifikasi antarmuka langsung dari alur kerja agent: membuka
aplikasi, menjalankan alur pengguna penuh sampai dashboard muncul, membaca error konsol, dan
memastikan tidak ada scroll horizontal pada lebar 420 px.

Jalur inilah yang menangkap temuan ketiga. Kegagalan JSON karena kutip tanpa escape tidak pernah
muncul saat pipeline dijalankan lewat CLI — hanya terlihat ketika alurnya dijalankan sungguhan
lewat browser.

### Dampak terhadap pengembangan

Pengembangan dijalankan berdasarkan bukti dari eksekusi nyata, bukan asumsi, dan itu dua kali
mengubah arah produk:

- Eksekusi pipeline penuh pertama menunjukkan 5 dari 10 agent masuk jalur repair. Dugaan awal
  (penulisan enum) ternyata **salah**. Setelah menambahkan pencatatan alasan repair pada trace,
  penyebab sebenarnya adalah bentuk tipe — temuan itu menghasilkan perbaikan schema dan penurunan
  latensi 36%.
- Sebuah kegagalan yang tidak pernah muncul di CLI justru muncul lewat browser: sintaks JSON rusak
  karena kutip tanpa escape. Karena bergantung pada kalimat yang kebetulan dihasilkan model, tidak
  ada perubahan prompt yang bisa diandalkan memperbaikinya — yang dibutuhkan adalah lapisan
  perbaikan deterministik.

Keandalannya dikunci oleh 23 tes offline yang berjalan tanpa menyentuh jaringan, mencakup parsing
output, toleransi schema, determinisme Career Health, dan wiring orchestrator penuh terhadap Gemma
tiruan.

## Arsitektur Google Cloud

- **Klien:** Next.js 16 (App Router) + React 19 + TypeScript strict + Tailwind CSS v4. Layout dua
  kolom — hasil di kiri, panel agent swarm dan log penalaran yang hidup di kanan.
- **Backend AI:** Vertex AI Model Garden menjalankan
  `publishers/google/models/gemma-4-26b-a4b-it-maas` di region `global`, dipanggil lewat endpoint
  Chat Completions yang kompatibel OpenAI.
- **Autentikasi:** Google Cloud IAM dengan penyedia token berlapis — access token eksplisit,
  service account / Application Default Credentials, atau gcloud CLI — dengan cache dan pembaruan
  otomatis.
- **Alur data:** CV + tujuan → route handler Next.js → orchestrator → 10 panggilan Gemma (dua tahap
  berjalan paralel) → JSON tervalidasi Zod → perhitungan Career Health deterministik →
  Server-Sent Events → dashboard hidup. Trace tiap agent diisolasi per-request lewat
  `AsyncLocalStorage`, sehingga dua pengguna bersamaan tidak saling menimpa log.

**Dirancang tetapi belum dibangun** — desain, bukan klaim implementasi: Cloud Run (hosting),
Cloud SQL (persistensi Career Twin), Cloud Storage (berkas CV), Cloud Tasks (penilaian lowongan
baru di latar belakang), dan Vertex AI Embeddings + pgvector (pencocokan awal CV↔lowongan).

## Fungsionalitas dan Keterbatasan yang Diketahui

**Fitur yang berjalan:** visualisasi delapan agent dengan log bertimestamp, parsing CV menjadi
profil terstruktur, Career Health Score deterministik per komponen, misi harian lima hari yang bisa
dicentang, ranking lowongan dengan peluang lolos dan verdict, analisis keyword dan penghalang wajib
ATS, penulisan ulang CV sebelum/sesudah, roadmap belajar terurut dampak, dan pertanyaan interview
yang menyasar celah kandidat.

**Alur pengguna utama:** sebutkan tujuan → tempel CV → jalankan analisis → delapan agent selesai
dalam ±100 detik → baca dashboard bertab.

**Keterbatasan yang diketahui:**

1. **Lowongan belum realtime.** Daftarnya dari kumpulan contoh — penilaian peluangnya nyata,
   daftarnya belum. Dinyatakan terbuka di dalam aplikasi lewat spanduk "segera realtime".
   Berikutnya: tarikan langsung dari LinkedIn, Jobstreet, Glints, dan Kalibrr.
2. **Unggah PDF baru berupa antarmuka**, bertanda "segera"; pengguna menempel teks CV.
3. **Belum ada persistensi**, sehingga Career Twin belum tumbuh antar sesi.
4. **Belum ada autentikasi.** Satu pengguna per sesi browser.
5. **`matchScore` belum terkalibrasi** — penilaian Gemma untuk membandingkan antar-lowongan, bukan
   probabilitas dari data penerimaan nyata.
6. **±100 detik per analisis.** Turun dari 174 detik, tetap terasa lama. Berikutnya: dashboard
   tampil bertahap begitu tiap agent selesai.

## Tautan Proyek

- **Repositori publik:** https://github.com/ziksite/gemma-career-os
- **Demo publik YouTube:** https://youtu.be/I6LVW2rzzZw
- **Slide presentasi:** https://docs.google.com/presentation/d/1SKbzJjWKBkL9XNDkDTUSqk8rkhjX1Ki_yYRsHnlS7Xc/edit?usp=sharing
- **Aplikasi yang di-deploy (opsional):** belum di-deploy

## Instruksi Menjalankan

```bash
npm install

cp .env.example .env
# Isi GOOGLE_CLOUD_PROJECT + salah satu: GOOGLE_ACCESS_TOKEN
# atau GOOGLE_APPLICATION_CREDENTIALS

npm run gemma:test   # uji koneksi, streaming, structured output
npm run dev          # http://localhost:3000
npm test             # 23 tes offline, tanpa jaringan
npm run demo         # pipeline sama di terminal, untuk debugging
```

## Pengungkapan

- **Model:** Gemma 4 26B (`gemma-4-26b-a4b-it-maas`) via Vertex AI Model Garden.
- **API eksternal:** tidak ada selain Vertex AI.
- **Dataset:** tidak ada. `data/sample-cv.txt` dan `data/sample-jobs.json` contoh sintetis.
