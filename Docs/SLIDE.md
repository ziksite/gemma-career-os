# Isi Slide Showcase — tinggal salin per kotak

Templat resmi punya 6 kotak. Teks di bawah sudah dipadatkan agar muat tanpa mengecilkan font.

---

## 1. Nama produk *(kotak kiri atas)*

```
Gemma Career OS
```

## 2. Penjelas satu kalimat *(kotak kanan atas)*

```
Partner karier AI yang berani bilang "jangan lamar dulu" — lalu menunjukkan apa yang harus kamu perbaiki.
```

**Alternatif kalau ingin lebih pendek:**

```
Delapan agent Gemma yang bekerja sampai kamu dapat kerja.
```

## 3. The Idea *(kotak kiri, tinggi)*

```
Pencari kerja punya lima alat yang tidak saling bicara:
job portal, resume builder, ATS checker, cover letter,
simulator interview.

Akibatnya melamar membabi buta — 100 lamaran, 3 balasan,
tanpa pernah tahu bagian mana yang gagal.

Gemma Career OS menggantinya dengan satu partner.
Sebut tujuanmu, tempel CV, lalu delapan agent Gemma
bekerja mundur dari target itu.
```

## 4. App screenshot *(kotak tengah)*

Pakai tampilan **dashboard tab Ringkasan** pada layar lebar. Satu gambar itu sekaligus menunjukkan
dua hal yang dinilai juri:

- **Kiri:** cincin Career Health, rincian per komponen, dan tindakan hari ini → produknya nyata
- **Kanan:** delapan agent Gemma dengan status SELESAI dan log bertimestamp → arsitektur multi-agent
  terlihat, bukan sekadar diklaim

## 5. Fitur *(kotak kanan, bullet)*

```
• Career Health Score — satu angka, dihitung deterministik
• Peluang lolos tiap lowongan + verdict lamar / perbaiki / lewati
• Analisis ATS: keyword hilang & penghalang wajib
• CV ditulis ulang, sebelum → sesudah
• Misi harian 5 hari + roadmap belajar
• Delapan agent Gemma terlihat bekerja langsung
```

## 6. Mission statement *(kotak kiri bawah)*

```
Mengubah cara orang mencari kerja: dari menebak-nebak
menjadi langkah terukur.

Setiap orang berhak tahu persis mengapa lamarannya ditolak,
dan apa yang harus dikerjakan minggu ini.
```

## 7. Call to Action *(kotak kanan bawah)*

```
Coba sendiri

github.com/ziksite/gemma-career-os
Demo 3 menit: youtu.be/I6LVW2rzzZw

Dibangun di Antigravity, ditenagai Gemma 4 di Vertex AI
```

---

## Catatan penyampaian (2 menit)

Urutan bicara yang paling kuat, karena menaruh pembeda di depan:

1. **20 detik — masalah.** "100 lamaran, 3 balasan, tidak pernah tahu kenapa."
2. **20 detik — ide.** Satu partner, bukan lima alat. Pengguna menyebut tujuan, bukan perintah.
3. **50 detik — demo.** Tunjukkan panel kanan saat agent berjalan, lalu Career Health dan verdict
   lowongan. Titik paling berkesan: satu lowongan diberi verdict **"perbaiki dulu"** — AI yang
   menahan pengguna, bukan mendorong melamar.
4. **20 detik — Gemma.** Delapan agent, output tervalidasi, dan yang sengaja **tidak** diserahkan ke
   model: skor dihitung kode supaya tidak berubah-ubah sendiri.
5. **10 detik — penutup.** Tautan repo dan demo.

Kalau harus memotong, buang bagian fitur. Jangan buang bagian "yang tidak diserahkan ke Gemma" —
itu yang membedakan dari tim yang sekadar memanggil endpoint.
