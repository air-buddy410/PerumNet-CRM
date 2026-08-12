# Rencana — Kartu Pegawai: Barcode, NFC, Absensi, dan Akses Pintu

**Tanggal:** 2026-08-12
**Status:** rencana untuk direview — belum ada kode yang ditulis
**Cakupan:** kartu identitas pegawai dengan kode pindai dan NFC, dipakai untuk
verifikasi identitas, absensi, dan akses pintu

---

## 1. Pemeriksaan: mana yang sudah ada?

| Yang dibutuhkan | Status | Keterangan |
|---|---|---|
| Nomor pegawai (NIK) | ✅ ada | `Employee.employeeNo`, unik |
| Data pegawai lengkap | ✅ ada | Fase 41 — alamat, jenjang, pola kerja, masa kontrak |
| Absensi | ✅ ada | `Attendance` + `AttendanceLocation`, berbasis **geofence** (haversine) + foto selfie |
| Shift & jadwal | ✅ ada | `Shift`, `ShiftSchedule` |
| Mesin lampiran privat | ✅ ada | Fase 33 — sudah dikeraskan (MIME, ukuran, magic byte, izin per-entitas) |
| Pembekuan & arsip akun | ✅ ada | Fase 42 & 47 |
| **Foto pegawai** | ❌ belum ada | dibutuhkan untuk kartu dan verifikasi |
| **Kartu pegawai** | ❌ belum ada | tidak ada modelnya sama sekali |
| **Barcode/QR pegawai** | ❌ belum ada | `barcode` yang ada milik **item inventory** (Fase 21), bukan orang |
| **NFC** | ❌ belum ada | |
| **Akses pintu** | ❌ belum ada | |
| Pustaka QR/PDF | ❌ belum ada | tidak ada dependensi terkait di `package.json` |

Fondasinya kuat: identitas pegawai, absensi, dan penyimpanan berkas privat
sudah jadi. Yang benar-benar baru adalah kartunya sendiri dan dua pembacanya.

---

## 2. Hal yang harus diluruskan sebelum apa pun dibangun

### 2.1 "Scan untuk tahu informasi pegawai" itu sebenarnya DUA kebutuhan

Keduanya sering disatukan, dan kalau disatukan hasilnya bocor.

| | **Verifikasi publik** | **Pencarian internal** |
|---|---|---|
| Siapa yang memindai | Pelanggan di depan rumahnya | HRD, security, atasan |
| Pertanyaannya | "Benar ini teknisi PerumNet?" | "Siapa orang ini, riwayatnya apa?" |
| Perlu login | **Tidak** | **Ya** |
| Yang ditampilkan | Foto, nama panggilan, jabatan, status aktif, masa berlaku | Data kepegawaian sesuai izin |

**Bahaya kalau disatukan:** kalau kode di kartu langsung membuka halaman berisi
data pegawai, maka **siapa pun yang sempat memotret kartu itu** — tamu, orang
di angkutan umum, pelanggan yang kesal — bisa membaca alamat rumah dan nomor
teleponnya. Kartu itu dipakai di tempat umum sepanjang hari; anggap isinya
akan terlihat orang asing.

**Yang benar:**
- Kode di kartu berisi **token acak buram**, bukan NIK dan bukan nama.
- Token itu membuka halaman **verifikasi publik** yang isinya minimal.
- Pencarian internal memakai halaman terpisah yang menuntut login dan izin.

Untuk ISP, verifikasi publik ini justru bernilai nyata: pelanggan bisa
memastikan orang yang mengetuk pintunya benar-benar teknisimu. Itu perlindungan
bagi pelanggan **dan** bagi teknisimu saat dicurigai.

### 2.2 NFC murah bisa digandakan dalam hitungan detik

Ini yang paling menentukan anggaran, jadi saya sampaikan terus terang.

Kartu NFC yang paling murah dibaca hanya **UID**-nya — nomor seri chip. UID
bisa disalin dengan aplikasi ponsel gratis atau alat seharga ratusan ribu, lalu
ditulis ke kartu kosong. Kalau absensi dan pintu bergantung pada UID saja:

- Absensi bisa dititipkan — cukup pinjamkan salinan kartu
- **Pintu bisa dibuka orang luar** yang pernah menempelkan ponselnya ke kartu
  pegawai selama satu detik

Jenis chip yang aman berbeda harganya, dan ini perbandingan jujurnya:

| Chip | Aman? | Catatan |
|---|---|---|
| Kartu UID-only / MIFARE Classic | ❌ **jangan** | Crypto1 sudah lama dipecahkan; salin dalam hitungan detik |
| **NTAG424 DNA** | ✅ | Tiap tempel menghasilkan tanda tangan kriptografis berbeda di dalam URL-nya. Salinan tidak berlaku. **Paling cocok untuk kasusmu** karena ponsel bisa langsung membacanya tanpa aplikasi khusus |
| MIFARE DESFire EV2/EV3 | ✅ | Standar akses pintu kelas industri; butuh reader yang mendukung, bukan ponsel biasa |

Saranku **NTAG424 DNA**: ponsel pelanggan bisa membacanya untuk verifikasi,
reader absensi bisa membacanya, dan salinannya tidak berlaku. Satu kartu, tiga
kegunaan.

### 2.3 CRM tidak boleh menjadi pengendali pintu

Pintu harus tetap bisa dibuka saat **jaringan mati, CRM mati, atau listrik
kantor sedang bermasalah**. Kalau CRM yang memutuskan setiap kali orang
menempelkan kartu, maka satu gangguan jaringan mengunci semua orang di luar
— atau, kalau dibuat fail-open, membuka pintu untuk siapa saja.

Susunan yang benar, dan ini pola yang sama seperti mailcow dan Authentik:

```
CRM  ──daftar siapa berhak──►  Pengendali pintu  ──keputusan lokal──►  Pintu
     (sumber kebenaran)         (menyimpan & menegakkan sendiri)
```

CRM mendorong daftar kartu yang berlaku ke pengendali pintu. Pengendali itu
menyimpannya sendiri dan memutuskan **tanpa** bertanya ke CRM. Kalau CRM mati,
pintu tetap bekerja dengan daftar terakhir.

### 2.4 Kartu hilang harus mati seketika — dan otomatis ikut pembekuan

Dua hal yang menyatu dengan pekerjaan yang sudah ada:

- **Kartu hilang** dicabut dari satu tempat, dan efeknya langsung: kode
  pindainya tidak lagi mengembalikan apa pun, dan kartunya dicoret dari daftar
  yang didorong ke pengendali pintu.
- **Akun yang dibekukan (Fase 42) atau diarsipkan (Fase 47) otomatis
  mematikan kartunya.** Kontrak seseorang habis → akunnya beku → kartunya
  berhenti membuka pintu, tanpa ada yang perlu ingat mencabutnya. Inilah yang
  paling sering terlewat pada sistem akses: orangnya sudah tidak bekerja,
  tetapi kartunya masih membuka pintu berbulan-bulan.

### 2.5 Tempel kartu membuktikan KARTUNYA hadir, bukan ORANGNYA

Absensi lewat NFC memang membuktikan lokasi lebih baik daripada GPS — reader
itu menempel di tembok kantor, tidak bisa dipalsukan seperti koordinat ponsel.
Tetapi ia lebih lemah dalam membuktikan **siapa**: rekan kerja bisa menempelkan
kartumu.

Kabar baiknya, sistem absensi yang ada **sudah menyimpan foto selfie**. Jadi
gabungannya kuat: NFC membuktikan tempat, foto membuktikan orang. Tidak ada
yang perlu dibangun dari nol untuk itu.

---

## 3. Keputusan yang perlu diambil

| # | Pertanyaan | Kenapa menentukan |
|---|---|---|
| **K1** | Jenis chip: **NTAG424 DNA** (saranku), DESFire, atau kartu murah UID-only? | Menentukan apakah kartu bisa digandakan. Kalau anggaran memaksa kartu murah, **pintu jangan memakai NFC sama sekali** — cukup absensi, dengan risiko titip-absen yang disadari |
| **K2** | Absensi NFC **menggantikan** geofence untuk pegawai kantor, atau **menambah**? | Teknisi lapangan tetap butuh GPS; pegawai kantor mungkin lebih baik tap. Saranku: tap untuk yang ber-`workPattern` kantor, GPS tetap untuk lapangan |
| **K3** | Verifikasi publik teknisi oleh pelanggan — dipakai? | Saranku **ya**; ini nilai nyata untuk ISP dan murah dibangun |
| **K4** | Pengendali pintu: merek/model apa, dan apakah punya API? | Menentukan bentuk Fase 52. Kalau belum dibeli, tunda fase itu |
| **K5** | Foto pegawai — siapa yang mengunggah, dan boleh dilihat siapa? | Foto orang adalah data pribadi; izin bacanya harus ditetapkan sadar |
| **K6** | Pustaka QR — boleh menambah dependensi? | Encoder QR (Reed-Solomon) terlalu berisiko ditulis sendiri. Ini kasus di mana dependensi memang layak, berbeda dari keputusan D4 pada KMZ dulu |

---

## 4. Usulan pemecahan fase

| Fase | Isi | Bergantung |
|---|---|---|
| **49** | **Foto & kartu pegawai** — unggah foto (mesin lampiran Fase 33), model `EmployeeCard` dengan token buram, penerbitan/penggantian/pencabutan, halaman cetak kartu ber-QR. Belum ada NFC. | K5, K6 |
| **50** | **Verifikasi publik** — halaman tanpa login yang hanya menampilkan foto, nama, jabatan, status, masa berlaku. Dibatasi laju, tanpa pencarian, tanpa daftar. | 49, K3 |
| **51** | **Absensi lewat kartu** — endpoint tap, verifikasi tanda tangan NTAG424, menyatu dengan `Attendance` yang ada beserta foto selfienya. | 49, K1, K2 |
| **52** | **Akses pintu** — CRM mendorong daftar kartu berlaku ke pengendali pintu; pencabutan dan pembekuan ikut terdorong. | 51, K4 |

**Fase 49 tidak menunggu perangkat apa pun** — kartu ber-QR sudah berguna
sendiri untuk verifikasi dan identitas visual, bahkan sebelum kartu NFC dibeli.

---

## 5. Bentuk data yang saya usulkan

```prisma
model EmployeeCard {
  id           String    @id @default(cuid())
  employeeId   String
  cardNumber   String    @unique  // nomor tercetak, boleh dibaca manusia
  /// Token acak buram untuk QR dan verifikasi publik. BUKAN NIK, bukan nama —
  /// kartu terlihat orang asing sepanjang hari, jadi isinya tidak boleh
  /// bermakna apa pun di luar sistem ini.
  publicToken  String    @unique
  /// UID chip NFC. Disimpan untuk pencocokan, TETAPI tidak pernah menjadi
  /// satu-satunya bukti — lihat §2.2.
  nfcUid       String?   @unique
  status       String    @default("ACTIVE") // ACTIVE|LOST|REVOKED|REPLACED
  issuedAt     DateTime  @default(now())
  issuedById   String
  expiresAt    DateTime?
  revokedAt    DateTime?
  revokedById  String?
  revokeReason String?
  /// Kartu pengganti menunjuk yang digantikannya, sehingga riwayat kartu
  /// seseorang bisa ditelusuri tanpa menghapus baris lama.
  replacesId   String?   @unique

  employee Employee @relation(fields: [employeeId], references: [id])

  @@index([employeeId, status])
}
```

Dan satu tabel jejak tempel, terpisah dari `Attendance` karena tidak setiap
tempel adalah absensi (ada tempel di pintu, dan ada tempel yang ditolak):

```prisma
model CardTapLog {
  id         String   @id @default(cuid())
  cardId     String?  // null bila kartunya tidak dikenali
  rawToken   String?  // apa yang dibaca, untuk menyelidiki kartu palsu
  purpose    String   // ATTENDANCE | DOOR | VERIFY
  readerId   String?
  accepted   Boolean
  reason     String?  // alasan penolakan
  createdAt  DateTime @default(now())

  @@index([cardId, createdAt])
  @@index([accepted, createdAt])
}
```

**Tempel yang DITOLAK ikut dicatat, dan itu disengaja.** Percobaan memakai
kartu yang sudah dicabut, atau kartu yang tidak dikenal sama sekali, adalah
justru kejadian yang paling perlu terlihat.

---

## 6. Prinsip yang dipegang

1. **Kode di kartu tidak bermakna di luar sistem.** Token acak, bukan NIK.
   Kartu itu benda publik.
2. **Verifikasi publik menampilkan seminimal mungkin.** Cukup untuk menjawab
   "benar dia pegawai PerumNet?", tidak lebih. Tanpa pencarian, tanpa daftar,
   dibatasi laju.
3. **UID chip tidak pernah menjadi satu-satunya bukti** untuk hal yang
   berkonsekuensi fisik.
4. **CRM sumber kebenaran, pengendali pintu yang menegakkan.** Pintu tetap
   bekerja saat CRM mati.
5. **Pencabutan berlaku seketika, dan pembekuan akun ikut mematikan kartu.**
6. **Tempel yang ditolak dicatat**, bukan dibuang diam-diam.
7. **Kartu lama tidak dihapus.** Diganti statusnya dan ditunjuk penggantinya —
   riwayat siapa memegang kartu apa harus bisa ditelusuri, sesuai prinsip
   arsip Fase 47.

---

## 7. Yang saya butuhkan untuk mulai

**K5 dan K6** sudah cukup untuk memulai Fase 49 — keduanya soal kebijakan foto
dan izin menambah satu dependensi QR.

**K1** dibutuhkan sebelum membeli kartu, dan ini yang paling saya sarankan
diputuskan hati-hati: memilih kartu murah sekarang berarti mengulang seluruh
pengadaan saat pintu mau dipasang.

**K2, K3, K4** menyusul di fase masing-masing.
