# Rencana — Profil pegawai: foto, data diri, ganti password

**Ditulis 2026-08-13 · status: RENCANA, belum dikerjakan**

Empat permintaan pemilik proyek, dan ternyata bobotnya sangat berbeda: satu
sudah jadi, satu perlu keputusan sebelum ditulis, dua lainnya lurus.

---

## Ringkasan

| # | Permintaan | Keadaan sebenarnya | Sisa pekerjaan |
|---|---|---|---|
| 1 | Foto profil, berlaku di semua app | Foto **resmi** ada, tapi milik HRD | Field baru + jalur sajian + **keputusan** |
| 2 | Data diri: TTL, pendidikan, gol. darah | belum ada | Skema + form + template HRD |
| 3 | Ganti password dari profil | **mesin sudah jadi** (Fase 54) | satu kondisi usang di UI |
| 4 | Frontend | — | seluruhnya Luna |

---

## 1. Foto profil — DUA foto, bukan satu

Ini bagian yang paling perlu dibaca sebelum apa pun ditulis.

`Employee.photoAttachmentId` yang sudah ada adalah **foto resmi**: diunggah
HRD (keputusan K5), dicetak di kartu pegawai, dan ditampilkan di halaman
verifikasi publik yang dipindai pelanggan di depan pintunya.

**Kalau orang bisa mengganti foto itu sendiri, verifikasi kartu kehilangan
seluruh artinya.** Siapa pun bisa menukar wajah di kartunya sendiri, dan
pelanggan yang memindai QR akan melihat wajah yang salah — persis pada saat ia
sedang mencoba memastikan.

Jadi: **dua foto, dua pemilik, dua kegunaan.**

| | Foto resmi | Foto profil |
|---|---|---|
| Field | `Employee.photoAttachmentId` (sudah ada) | `User.avatarAttachmentId` (baru) |
| Diunggah | HRD | orangnya sendiri |
| Dipakai di | kartu pegawai, verifikasi publik | tampilan aplikasi |
| Boleh diganti sendiri? | **tidak** | ya |

Kalau seseorang belum mengunggah foto profil, tampilan boleh jatuh ke inisial
namanya — **bukan** ke foto resmi. Menjatuhkannya ke foto resmi membuat orang
mengira foto itu bisa mereka ganti.

### Supaya berlaku di semua app PerumNet

Aplikasi lain (Monitoring NOC, Enterprise, Captive Portal) punya basis data dan
loginnya sendiri. Ada tiga cara, dan yang ketiga sebaiknya ditunggu:

**A. CRM sebagai penyedia foto — token buram per pengguna.**
`GET /api/avatar/<token>` dengan token acak yang tidak bermakna di luar sistem,
persis pola yang sudah terbukti pada kartu pegawai. Aplikasi lain cukup
menyimpan URL-nya. Tidak perlu login, tidak bisa ditebak, dan tidak
membocorkan siapa saja yang bekerja di PerumNet — sebab tokennya tidak
mengandung nama, email, maupun id.

**B. CRM sebagai penyedia foto — API bertoken layanan.** Tiap app memegang
token sendiri. Lebih ketat, tapi tiap app harus mengambil dan menyimpan
gambarnya sendiri.

**C. Lewat Authentik** (klaim `picture` di ID token). Ini yang paling benar
secara arsitektur — satu identitas, satu foto, otomatis ikut ke mana pun orang
login. Tapi Authentik sedang **ditunda** atas keputusan pemilik.

**Saran: A sekarang, pindah ke C bila Authentik dihidupkan lagi.** A tidak
menghalangi C — tokennya tetap berguna sebagai jalur sajian, dan Authentik
tinggal menunjuk ke sana.

### Yang perlu diputuskan

- **Foto profil boleh dilihat tanpa login?** Dengan token buram, praktis tidak
  bisa ditemukan orang luar. Tapi siapa pun yang punya URL-nya bisa melihat
  wajah orang itu. Alternatifnya token bisa dicabut & diterbitkan ulang.
- **Batas ukuran & rasio.** Mesin lampiran sudah membatasi 5 MB dan memeriksa
  isi berkas (JPG/PNG/WebP). Perlu dipotong jadi persegi, atau diterima apa
  adanya?

---

## 2. Data diri tambahan

Empat field baru di `Employee` — bukan di `User`, karena ini fakta kepegawaian
dan harus tetap ada bagi pegawai yang tidak punya akun sistem.

| Field | Bentuk | Catatan |
|---|---|---|
| `birthPlace` | teks | kota kelahiran |
| `birthDate` | tanggal | |
| `education` | pilihan | SD · SMP · SMA/SMK · D1 · D2 · D3 · D4 · S1 · S2 · S3 |
| `bloodType` | pilihan | A · B · AB · O, masing-masing +/− · tidak diketahui |

**Siapa yang mengisi.** Usulan: **HRD**, sama seperti seluruh data kepegawaian
yang sudah ada. Tempat & tanggal lahir dan pendidikan adalah fakta yang HRD
cocokkan dengan dokumen; membiarkan orang mengubahnya sendiri berarti data
kepegawaian bisa berbeda dari ijazah dan KTP tanpa ada yang tahu.

Di halaman profil, keempatnya **hanya bisa dibaca** — sejalan dengan aturan
yang sudah berlaku untuk NIK, jabatan, divisi, dan email.

> **Perlu diputuskan:** apakah golongan darah dikecualikan dan boleh diisi
> sendiri? Ia dipakai saat darurat, dan orangnya yang paling tahu — tapi juga
> yang paling berbahaya bila salah.

**Golongan darah adalah data kesehatan.** Ia tidak boleh ikut ke mana pun yang
tidak membutuhkannya: **tidak** di halaman verifikasi kartu publik, **tidak**
di daftar pegawai, **tidak** di ekspor umum. Tempatnya hanya di detail pegawai
(izin `hrd.view`) dan di profil orangnya sendiri.

**Tanggal lahir jangan dijadikan penyaring** di daftar pegawai. Menyaring
berdasarkan umur adalah hal yang mudah ditambahkan dan sulit dijelaskan.

### Template HRD ikut bertambah

Empat kolom baru di `Template-Data-Pegawai.xlsx`, semuanya **opsional** —
supaya berkas yang sudah terlanjur diisi tetap bisa diimpor. Importer
mencocokkan kolom lewat judulnya, jadi penambahan ini aman.

---

## 3. Ganti password dari profil — SUDAH ADA

Mesinnya selesai sejak **Fase 54**: di mode `MAILSERVER`, mengganti password
dari halaman profil benar-benar mengubah password surel di mailcow, setelah
password lama diverifikasi lebih dulu ke mailserver.

Yang menahannya cuma satu baris di halaman profil:

```ts
const isCentralIdentity = auth.provider === "MAILSERVER" || auth.provider === "OIDC";
```

Lalu blok `isCentralIdentity` menampilkan *"Password dikelola oleh identity
mailserver terpusat. CRM tidak menyimpan, menampilkan, atau mengirim
password"* — dan menyembunyikan formulirnya.

Kalimat itu **benar untuk OIDC, tidak lagi benar untuk MAILSERVER.**

Perbaikannya: percayai `auth.passwordChangeAvailable` yang sudah dikirim
backend, jangan menghitung ulang sendiri dari `provider`. Nilainya sudah
mengikuti aturan yang benar — menyala bila CRM memang bisa mengubah kredensial
yang dipakai, mati untuk OIDC.

---

## 4. Pembagian kerja

**Backend (Opus)**

1. `User.avatarAttachmentId` + `User.avatarToken`, jalur `GET /api/avatar/<token>`
2. Aksi unggah/hapus foto profil milik sendiri
3. Empat field data diri di `Employee` + konstanta pilihannya
4. Kolom baru di template HRD + importer
5. `profileView` membawa semuanya

**Frontend (Luna)** — kontraknya ditulis di handoff begitu backend jadi

1. **§25 — perbaiki blok password.** Satu kondisi, tapi paling cepat terasa:
   23 orang sekarang tidak bisa mengganti password sendiri padahal bisa.
2. **§26 — unggah foto profil** di halaman profil. Wajib jelas bahwa ini
   **bukan** foto kartu pegawai; kalau tidak, orang akan mengira foto kartunya
   ikut berganti.
3. **§27 — tampilkan data diri** di profil (hanya baca) dan di detail pegawai
   (HRD yang mengisi).
4. **Avatar di seluruh aplikasi** — nav, daftar, komentar. Jatuh ke inisial
   bila belum ada, **jangan** ke foto resmi.

---

## Urutan yang disarankan

1. **§25 dulu** — satu baris, dan langsung dipakai 23 orang.
2. Data diri (#2) — lurus, tanpa keputusan yang menghalangi.
3. Foto profil (#1) — **tunggu keputusan** soal jalur sajian dan sifat publik
   tokennya.

## Yang menunggu keputusan pemilik

1. Foto profil disajikan lewat token buram tanpa login (A), atau API bertoken
   layanan per aplikasi (B)?
2. Golongan darah: diisi HRD, atau boleh diisi sendiri?
3. Foto profil dipotong persegi otomatis, atau diterima apa adanya?
