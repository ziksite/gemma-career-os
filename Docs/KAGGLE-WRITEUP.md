# Gemma Career OS

**Partner karier bertenaga Gemma 4.**

Build with Gemma: Gemma Hacking Jakarta! Extended Series 26
Hackathon Writeup — 1 Agustus 2026

---

## Nama Proyek

Gemma Career OS

## Anggota Tim

- **[ISI: Nama] — [ISI: username Kaggle]**
- **[ISI: Nama] — [ISI: username Kaggle]**

## Pernyataan Masalah

Mencari kerja di Indonesia berarti menjalankan lima alat terpisah sekaligus: job portal
(LinkedIn, Jobstreet, Glints, Kalibrr), resume builder, ATS checker, cover letter generator, dan
simulator interview. Tidak satu pun saling berbagi konteks, sehingga beban integrasinya jatuh ke
pencari kerja — merekalah yang harus mengingat apa yang sudah dicoba, memindahkan data antar-tab,
dan memutuskan langkah berikutnya.

Hasilnya melamar secara membabi buta. Seratus lamaran, tiga balasan, tanpa pernah tahu bagian mana
yang gagal: keyword yang kurang, pengalaman yang tidak relevan, atau target yang memang tidak
realistis sejak awal. Alat yang ada hari ini menjawab pertanyaan. Tidak ada yang berani berkata,
*"jangan lamar yang ini dulu — perbaiki dua hal berikut lebih dahulu."*

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

**[ISI SENDIRI]** Tulis apa yang benar-benar dikerjakan di Antigravity: file atau komponen apa yang
dibuat/di-refactor, prompt atau workflow apa yang dipakai, dan apa yang berubah karenanya.

### Integrasi Skills / MCP

**[ISI SENDIRI]** Sebutkan skill atau MCP server yang dipakai selama pengembangan dan untuk apa.

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

**Dirancang tetapi belum dibangun** — dicantumkan sebagai desain, bukan klaim implementasi:
Cloud Run untuk hosting, Cloud SQL (PostgreSQL) untuk persistensi Career Twin, Cloud Storage untuk
berkas CV yang diunggah, Cloud Tasks untuk penilaian lowongan baru di latar belakang, dan
Vertex AI Embeddings + pgvector untuk pencocokan awal CV↔lowongan secara semantik.

## Fungsionalitas dan Keterbatasan yang Diketahui

**Fitur yang berjalan:** visualisasi delapan agent secara langsung dengan log bertimestamp, parsing
CV menjadi profil terstruktur, Career Health Score deterministik beserta rincian per komponen, misi
harian lima hari dengan tugas yang bisa dicentang, ranking lowongan dengan peluang lolos dan
verdict, analisis keyword dan penghalang wajib ATS, penulisan ulang CV dengan tampilan
sebelum/sesudah, roadmap belajar terurut dampak, dan pertanyaan interview yang menyasar celah
kandidat.

**Alur pengguna utama:** sebutkan tujuan karier → tempel CV → jalankan analisis → delapan agent
selesai dalam ±100 detik → baca dashboard bertab (Ringkasan, Career Mission, Lowongan, CV & ATS,
Skill, Interview).

**Keterbatasan yang diketahui:**

1. **Lowongan belum realtime.** Daftarnya berasal dari kumpulan contoh. Penilaian peluangnya nyata,
   daftarnya yang belum. Hal ini dinyatakan terbuka di dalam aplikasi lewat spanduk "segera
   realtime", bukan disembunyikan. Berikutnya: tarikan langsung dari LinkedIn, Jobstreet, Glints,
   dan Kalibrr.
2. **Unggah PDF baru berupa antarmuka.** Ditampilkan sebagai area unggah bertanda "segera";
   untuk sekarang pengguna menempel teks CV.
3. **Belum ada persistensi.** Hasil hanya hidup di state browser, sehingga Career Twin belum tumbuh
   antar sesi.
4. **Belum ada autentikasi.** Satu pengguna per sesi browser.
5. **`matchScore` belum terkalibrasi.** Angka itu penilaian Gemma, berguna untuk membandingkan
   antar-lowongan, bukan probabilitas yang diturunkan dari data penerimaan nyata.
6. **±100 detik per analisis penuh.** Sudah turun dari 174 detik, tetapi masih terasa lama. Langkah
   berikutnya: menampilkan dashboard secara bertahap begitu tiap agent selesai.

## Tautan Proyek

- **Repositori publik:** https://github.com/ziksite/gemma-career-os
- **Aplikasi yang di-deploy (opsional):** belum di-deploy
- **Demo publik YouTube:** **[ISI: URL]**

## Instruksi Menjalankan

```bash
npm install

cp .env.example .env
# Isi GOOGLE_CLOUD_PROJECT, lalu salah satu kredensial:
#   GOOGLE_ACCESS_TOKEN=...            (hasil `gcloud auth print-access-token`)
#   GOOGLE_APPLICATION_CREDENTIALS=... (path service account JSON)

npm run gemma:test   # menguji koneksi, streaming, dan structured output
npm run dev          # buka http://localhost:3000

npm test             # 23 tes offline, tanpa jaringan
npm run demo         # pipeline yang sama di terminal, berguna untuk debugging
```

## Pengungkapan

- **Model:** Gemma 4 26B (`gemma-4-26b-a4b-it-maas`) via Vertex AI Model Garden.
- **API eksternal:** tidak ada selain Vertex AI.
- **Dataset:** tidak ada. `data/sample-cv.txt` dan `data/sample-jobs.json` adalah contoh sintetis
  yang ditulis khusus untuk proyek ini.
- **Alat AI yang dipakai saat pengembangan:** **[ISI SENDIRI — sebutkan semuanya]**
