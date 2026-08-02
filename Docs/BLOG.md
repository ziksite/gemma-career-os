---
title: "Gemma Career OS: tiga hal yang baru ketahuan setelah Gemma benar-benar dipanggil"
published: false
tags: gemma, googlecloud, ai, indonesia
---

# Gemma Career OS: tiga hal yang baru ketahuan setelah Gemma benar-benar dipanggil

Kami membangun **Gemma Career OS** di Gemma Hacking Jakarta — partner karier yang membaca CV,
menilai peluang tiap lowongan, dan menyusun langkah harian menuju target karier. Ditenagai
Gemma 4 26B lewat Vertex AI Model Garden.

Tulisan ini bukan tur fitur. Bagian paling berguna dari proyek ini justru muncul setelah pipeline
benar-benar memanggil Gemma dan gagal — tiga kali, dengan cara yang tidak terbaca dari dokumentasi
mana pun. Itu yang akan saya ceritakan, lengkap dengan angkanya.

- **Demo:** https://youtu.be/I6LVW2rzzZw
- **Repo:** https://github.com/ziksite/gemma-career-os

---

## Masalahnya bukan kurang alat, tapi kebanyakan

Mencari kerja di Indonesia berarti menjalankan lima alat terpisah sekaligus: job portal
(LinkedIn, Jobstreet, Glints, Kalibrr), resume builder, ATS checker, cover letter generator, dan
simulator interview. Tidak ada satu pun yang saling berbagi konteks.

Artinya beban integrasi jatuh ke pencari kerja. Merekalah yang harus mengingat apa yang sudah
dicoba, menyalin data antar-tab, dan memutuskan langkah berikutnya. Hasilnya melamar membabi buta:
seratus lamaran, tiga balasan, tanpa pernah tahu bagian mana yang gagal — keyword yang kurang,
pengalaman yang tidak relevan, atau target yang memang tidak realistis sejak awal.

Alat yang ada hari ini menjawab pertanyaan. Tidak ada yang berani bilang, *"jangan lamar yang ini
dulu — perbaiki dua hal berikut lebih dahulu."*

## Solusinya: satu partner, delapan agent

Pengguna menempel CV dan menyebut tujuan karier dalam kalimat bebas — misalnya *"saya ingin pindah
dari QA menjadi Product Manager"*. Setelah itu delapan agent Gemma bekerja mundur dari tujuan itu:

**Resume Specialist** mengurai CV jadi profil terstruktur, dengan level tiap skill yang harus
disertai bukti dari CV. **Career Strategist** menerjemahkan kalimat bebas jadi target terstruktur,
lalu menyusun milestone dan misi harian. **Career Twin** memelihara profil digital penggunanya.
**Job Hunter** menilai tiap lowongan berdasarkan peluang lolos screening. **ATS Specialist**
mencari keyword yang hilang dan penghalang wajib. **Skill Mentor** menyusun roadmap belajar urut
dampak per jam. **Interview Coach** menyiapkan pertanyaan yang menyasar titik terlemah kandidat.
**Career Health** menjelaskan skor akhirnya.

Yang membedakan dari chatbot: sistem ini dirancang berani berkata "belum". Lowongan dengan skor 45%
dikembalikan sebagai `improve_first` beserta gap persisnya, bukan dorongan untuk tetap melamar.

## Yang sengaja tidak kami serahkan ke Gemma

Ini keputusan desain yang paling sering saya jelaskan ulang, jadi saya taruh di depan.

**Career Health Score dihitung di kode**, dengan bobot tetap yang jumlahnya tepat 1,0. Kalau LLM
yang menjumlahkan, skor pengguna akan naik-turun sendiri antar sesi tanpa mereka melakukan apa pun.
Bayangkan membuka aplikasi besok dan skor Anda turun 6 poin padahal tidak ada yang berubah — itu
merusak kepercayaan, dan tidak ada penjelasan yang bisa diberikan.

**Penggabungan state Career Twin juga di kode**, sebagai fungsi murni. Menyuruh model "perbarui
profil ini" berisiko menghapus atau mengarang riwayat lama. Aturan seperti *"level skill hanya boleh
naik"* ditegakkan kode, bukan prompt — karena prompt bisa diabaikan, kode tidak.

Pembagiannya sederhana: **Gemma untuk penilaian, kode untuk invarian.** Gemma menjelaskan angkanya;
kode yang memegang aturannya.

---

## Tiga temuan dari menjalankan, bukan membaca

Sampai titik ini semuanya masih rapi di atas kertas. Lalu kami memanggil Vertex AI sungguhan.

### 1. `enable_thinking` justru merusak output terstruktur

Snippet resmi hackathon mengaktifkan `chat_template_kwargs: {"enable_thinking": true}`. Kami ikut
saja.

Panggilan pertama: `finish_reason` kembali sebagai `length`, dan teks jawabannya **kosong**.

Penyebabnya, Gemma memakai ~1.900 karakter untuk bernalar sebelum mulai menulis jawaban. Pada
permintaan JSON dengan `max_tokens` terbatas, jatah tokennya habis di tengah penalaran — JSON-nya
tidak pernah selesai ditulis. Untuk teks bebas ini tidak terlihat sebagai masalah besar; untuk
output terstruktur, fatal.

Kami matikan untuk semua agent. Satu panggilan turun dari **32,5 detik menjadi 10,5 detik**.

Pelajarannya: reasoning trace itu berguna untuk debugging, tapi ia berbagi anggaran token dengan
jawaban yang sebenarnya Anda butuhkan.

### 2. Model salah di bentuk, bukan di isi

Menjalankan pipeline penuh mencatat **5 dari 10 agent** masuk jalur perbaikan. Dugaan pertama saya:
penulisan enum — model menulis `"Mid-Level"` padahal schema minta `"mid"`.

Dugaan itu **salah**.

Saya menambahkan satu field kecil ke trace: alasan kenapa sebuah agent perlu diulang. Sekali jalan
lagi, polanya langsung terbaca, dan seragam:

- `languages: [{name, level}]` — padahal schema minta array of string
- `id: 1` — padahal minta string
- `reasons: "satu kalimat"` — padahal minta array
- `week: "Minggu 4"` — padahal minta angka
- `gapAssessment: {ringkasan, catatan}` — padahal minta string

Perhatikan: **isinya selalu benar.** Yang berbeda cuma pembungkusnya. Model paham tugasnya; ia hanya
punya pendapat sendiri soal cara membungkus.

Jadi solusinya bukan memaksa model lebih patuh lewat prompt yang makin panjang, melainkan membuat
schema yang menerima variasi. Kami menulis tiga helper Zod: satu meratakan objek jadi teks, satu
menarik angka dari kalimat (`"Minggu 4"` → `4`, `"20.000.000"` → `20000000`) dan menjepit nilai di
luar batas alih-alih menolaknya, satu lagi membungkus nilai tunggal jadi array.

Hasilnya: perbaikan turun dari **5/10 menjadi 0/10**, dan total waktu pipeline dari **174 detik
menjadi 112 detik**.

Satu detail yang sengaja dijaga: pemisahan string jadi array hanya dilakukan pada baris baru dan
titik koma — **tidak pada koma**. Koma lazim berada di tengah kalimat Indonesia. Kalau dipecah,
*"Latar QA relevan, tapi belum pernah menulis PRD"* berubah jadi dua alasan yang keliru. Aturan ini
kami kunci dengan tes supaya tidak ada yang "menyederhanakannya" nanti.

### 3. Kegagalan yang tidak muncul di CLI, tapi muncul di browser

Setelah dua perbaikan itu, pipeline lewat terminal berjalan bersih. Kami buka lewat UI, dan agent
terakhir gagal setelah menunggu dua menit:

```
JSON tidak valid: Expected ',' or '}' after property value
```

Gemma menulis kalimat seperti ini di dalam nilai string:

```
"gapAssessment": "Transisi dari "mencari bug" ke "menentukan nilai bisnis"."
```

Kutip ganda tanpa escape. String berakhir lebih awal, sisa kalimat jadi token liar, seluruh JSON
gagal di-parse.

Yang membuat ini berbahaya: sifatnya **acak**. Bergantung pada kalimat yang kebetulan dihasilkan
model saat itu. Tidak ada perubahan prompt yang bisa diandalkan menghilangkannya — dan Anda baru
tahu setelah kehilangan dua menit di depan juri.

Penanganannya berlapis, dari yang paling murah:

1. **Perbaikan deterministik.** Pada JSON yang sah, kutip penutup selalu diikuti — setelah spasi —
   oleh `,` `}` `]` `:` atau akhir teks. Selain itu berarti kutip literal di tengah kalimat, dan
   bisa di-escape otomatis. Sekalian: baris baru mentah dan koma menggantung. Tanpa panggilan
   tambahan, tanpa biaya.
2. Kalau pelacakan kurung ikut kacau, ekstraksi diulang sampai kurung penutup terakhir.
3. Baru sebagai upaya terakhir, teks rusak itu dikirim balik ke Gemma untuk ditulis ulang.

Pada eksekusi berikutnya, agent yang sama kena masalah serupa — dan **pulih sendiri**. Yang tadinya
menggagalkan seluruh analisis kini hanya menambah beberapa detik.

---

## Arsitektur Google Cloud

**Vertex AI Model Garden** menjalankan `publishers/google/models/gemma-4-26b-a4b-it-maas` di region
`global`, dipanggil lewat endpoint Chat Completions yang kompatibel OpenAI. Tidak perlu meng-host
model sendiri.

**Google Cloud IAM** menangani autentikasi lewat penyedia token berlapis: access token eksplisit,
service account / Application Default Credentials, atau gcloud CLI — dengan cache dan pembaruan
otomatis. Ini terdengar berlebihan sampai token Anda mati di menit ke-58 saat sedang merekam demo.

Sisi klien memakai **Next.js 16** App Router dengan React 19 dan TypeScript strict. Satu route
handler menjalankan pipeline dan mengalirkan progres tiap agent sebagai **Server-Sent Events**,
sehingga pengguna melihat agent bekerja satu per satu alih-alih spinner kosong selama seratus detik.
Trace tiap agent diisolasi per-request lewat `AsyncLocalStorage` — kalau pakai variabel global, dua
pengguna bersamaan akan saling menimpa log.

Yang **dirancang tapi belum dibangun**, dan saya sebut sebagai desain bukan klaim: Cloud Run untuk
hosting, Cloud SQL untuk persistensi Career Twin, Cloud Storage untuk berkas CV, Cloud Tasks untuk
menilai lowongan baru di latar belakang, dan Vertex AI Embeddings + pgvector untuk pencocokan awal
CV↔lowongan.

## Antigravity dan Playwright MCP

Seluruh proyek dikerjakan di dalam **Antigravity IDE**. Yang paling terasa bukan fitur tunggalnya,
melainkan siklusnya: editor, terminal, dan pemeriksaan berada di satu tempat, sehingga
*jalankan → baca kegagalan → perbaiki* berputar tanpa berpindah konteks.

Dua momen yang menunjukkan bedanya. Pertama, saat menghapus ekstensi `.js` dari seluruh import —
menyentuh 20 file sekaligus, dan tanpa sengaja merusak encoding UTF-8 di semuanya (`→` berubah jadi
`â†'`). Karena semuanya berdampingan, kerusakan itu terdeteksi dan dipulihkan dalam satu putaran,
bukan ditemukan tiga jam kemudian. Kedua, menjalankan `npm run demo` berulang sambil membaca trace
tiap agent — itulah cara temuan kedua muncul.

**Playwright MCP** dipakai untuk memverifikasi antarmuka langsung dari alur kerja agent: membuka
aplikasi, menjalankan alur pengguna penuh sampai dashboard, membaca error konsol, memastikan tidak
ada scroll horizontal di lebar 420 px.

Dan justru jalur inilah yang menangkap temuan ketiga. Bug kutip tanpa escape **tidak pernah muncul**
saat pipeline dijalankan lewat terminal. Ia hanya menampakkan diri ketika alurnya benar-benar
dijalankan lewat browser — persis seperti yang akan dialami pengguna.

## Yang belum selesai

Saya cantumkan terbuka, karena menyembunyikannya hanya menunda ketahuan:

Daftar lowongan masih dari kumpulan contoh — penilaian peluangnya nyata, daftarnya belum. Ini
dinyatakan langsung di dalam aplikasi lewat spanduk "segera realtime", bukan disembunyikan di
footer. Unggah CV PDF sudah berfungsi — ekstraksi teks berjalan di browser, jadi berkasnya tidak
pernah dikirim ke server — tetapi PDF hasil pindaian belum bisa dibaca karena tidak punya lapisan
teks. Belum ada persistensi, jadi Career Twin
belum tumbuh antar sesi. `matchScore` adalah penilaian Gemma, berguna untuk membandingkan
antar-lowongan, bukan probabilitas dari data penerimaan nyata. Dan satu analisis penuh masih makan
±100 detik — sudah turun dari 174, tetap terasa lama.

## Penutup

Bagian tersulit membangun produk multi-agent ternyata bukan merancang agent-nya. Itu selesai dalam
beberapa jam. Yang memakan waktu adalah membuat output model bisa dipercaya cukup untuk masuk
database tanpa pemeriksaan defensif di mana-mana.

Tiga temuan di atas punya benang merah yang sama: **tidak satu pun terbaca dari dokumentasi.**
Ketiganya butuh menjalankan sistemnya, gagal, lalu mencatat alasan kegagalannya dengan cukup rapi
untuk bisa dibaca polanya.

Kalau Anda sedang membangun sesuatu di atas LLM dan hanya mengambil satu hal dari tulisan ini:
catat *mengapa* output ditolak, bukan sekadar bahwa ia ditolak. Field kecil itu yang mengubah
tebakan menjadi perbaikan.

---

**Repo:** https://github.com/ziksite/gemma-career-os
**Demo:** https://youtu.be/I6LVW2rzzZw

Dibangun di Gemma Hacking Jakarta — Extended Series 26.
#BuildWithAICloudJakarta #GDGCloudJakarta #GemmaHackathon #Kaggle
