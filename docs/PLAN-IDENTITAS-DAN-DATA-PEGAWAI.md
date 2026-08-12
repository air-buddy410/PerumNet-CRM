# Rencana — Identitas Terpusat, Data Pegawai & Mailserver

**Tanggal:** 2026-08-12
**Status:** rencana disetujui sebagian — E3 & E5 sudah diputuskan, belum ada kode
**Cakupan:** data pegawai lengkap, pengelolaan mailcow dari tab IT, dan satu
akun untuk seluruh aplikasi PerumNet

---

## 1. Pemeriksaan: mana yang sudah ada?

Diperiksa langsung ke kode dan skema, bukan dari ingatan.

### 1.1 Data pegawai

| Yang diminta | Status | Keterangan |
|---|---|---|
| Nama, nomor pegawai | ✅ ada | `Employee.fullName`, `employeeNo` |
| Jabatan | ⚠️ sebagian | `Employee.jobTitle` — teks bebas, bukan jenjang |
| Atasan | ✅ ada | `Employee.supervisorId` |
| Tanggal bergabung | ✅ ada | `Employee.joinedAt` |
| Status kontrak / staff | ✅ ada | `employeeType` = `FULL_TIME\|PART_TIME\|CONTRACT\|PROBATION` — **dipakai apa adanya** (keputusan E3) |
| **Durasi kontrak** | ❌ **belum ada** | tidak ada tanggal mulai/berakhir kontrak |
| **Alamat** | ❌ **belum ada** | `Employee` tidak punya kolom alamat |
| **Shift / non-shift** | ❌ **belum ada** | `Shift`/`ShiftSchedule` ada, tapi tak ada penanda per pegawai |
| **Jenjang jabatan** | ❌ **belum ada** | `User.level` (`STAFF\|SUPERVISOR\|OWNER`) itu hierarki APPROVAL, bukan jenjang jabatan |

### 1.2 IT / DevOps — **jauh lebih lengkap dari yang saya kira**

| Yang diminta | Status |
|---|---|
| Divisi IT & DevOps | ✅ **sudah digabung** — `["IT", "IT/DevOps"]` di `prisma/seed.ts:215` |
| Peran di dalamnya | ✅ ada 4 — `it_manager`, `developer`, `devops_engineer`, `it_support` |
| Izin modul IT | ✅ ada — `it.view`, `it_tickets.manage`, `access.manage`, `deployments.*`, `backups.manage`, `it_assets.manage`, `integrations.manage` |
| Halaman IT | ✅ ada — `/it/servers`, `/applications`, `/deployments`, `/backups`, `/access`, `/assets`, `/tickets` |
| Registry aplikasi internal | ✅ ada — `model Application` (nama, domain, owner, server, SLA) |
| Permohonan akses | ✅ ada — `model AccessRequest`, `accessType` **sudah memuat `EMAIL`** |
| Registry integrasi eksternal | ✅ ada — `model Integration`, kategori `ITOPS`, `credentialRef` menyimpan **nama env var** bukan secret |
| Aturan approval deployment & akses production | ✅ ada — `seed.ts:288–298` |

### 1.3 Mailserver & identitas terpusat

| Yang diminta | Status |
|---|---|
| Kerangka `AUTH_PROVIDER` (`LOCAL\|MAILSERVER`) | ✅ ada (Fase 34) — tapi hanya **saklar**, belum ada adapter |
| `passwordChangeAvailable` ke frontend | ✅ ada — Luna sudah menghormatinya |
| Invalidasi sesi (`User.sessionEpoch`) | ✅ ada |
| **Setting mailcow** | ❌ belum — tapi **rumahnya sudah ada** (`Integration`) |
| **Tag mailbox → divisi** | ❌ belum ada sama sekali |
| **Autentikasi ke penyedia identitas** | ❌ belum — hari ini bcrypt lokal |
| **Satu pintu lintas aplikasi** | ❌ belum |

**Ringkasnya:** fondasi IT/DevOps sudah berdiri utuh. Yang benar-benar kosong
hanya tiga: kolom pegawai tambahan, jembatan ke mailcow, dan penyedia identitas.

---

## 2. Keputusan yang sudah diambil

| # | Keputusan |
|---|---|
| **E3** | ✅ **Pakai `employeeType` yang sudah ada** (`FULL_TIME\|PART_TIME\|CONTRACT\|PROBATION`), tidak diganti. "Kontrak" = `CONTRACT`, "staff" = `FULL_TIME`. Tidak ada migrasi data. |
| **E5** | ✅ **`STAFF \| LEADER` saja dulu.** Nilai lain ditambah manual belakangan. |
| **E-IT** | ✅ **IT dan DevOps digabung** — dan memang sudah begitu sejak awal. Lihat §3.1. |
| **E4** | ✅ **Kontrak habis → akun DIBEKUKAN, bukan langsung mati.** Setelah 3 bulan beku barulah diarsipkan. Lihat §4b. |
| **E1** | ✅ **Authentik** sebagai penyedia identitas. Fase 45 dibentuk untuk OIDC Authentik. |
| **E2** | ✅ **CRM sebagai editor tag.** Divisi ditetapkan di CRM lalu didorong ke mailcow; arah sebaliknya hanya dilaporkan, tidak pernah mengubah divisi. |
| **T1** | ✅ **`ArchivedRecord` disetujui** sebagai mekanisme trash tunggal. |

**Seluruh keputusan sudah diambil.** E2 ditegakkan secara struktural di
`src/lib/mailserver.ts`: tidak ada satu pun fungsi di modul itu yang menulis
`User.divisionId`, dan tes integrasi membuktikannya.

---

## 3. Jawaban atas pertanyaan barumu

### 3.1 Apa beda IT dan DevOps? Gabung saja?

**Sudah digabung, dan itu keputusan yang benar — tidak perlu diubah.**

Divisinya satu: `IT` dengan nama tampil **"IT/DevOps"**. Di dalamnya ada empat
peran yang dibedakan bukan oleh divisi melainkan oleh **kewenangan**:

| Peran | Fokus | Yang membedakan |
|---|---|---|
| `it_manager` | Lead — server, aplikasi, akses, DR | Satu-satunya pemegang `integrations.manage` dan penyetuju deployment production |
| `devops_engineer` | CI/CD, container, monitoring, backup | Boleh **mengeksekusi** deployment, tidak boleh menyetujui |
| `developer` | Pengembangan aplikasi | Hanya boleh **mengajukan** deployment |
| `it_support` | Akun internal, tiket IT, onboarding/offboarding | Pemegang `access.manage` — inilah yang akan mengelola mailbox |

Prinsipnya: **divisi menentukan rantai persetujuan, peran menentukan
kewenangan.** Memecah IT dan DevOps menjadi dua divisi justru merugikan —
artinya dua rantai approval terpisah untuk tim yang orangnya sama.

Yang perlu kamu lakukan hanyalah menempatkan orang pada peran yang tepat.
Pengelolaan email nanti jatuh ke `it_support` dan `it_manager`.

### 3.2 Tabel setting mailserver mailcow di tab IT/DevOps?

**Ya, dan rumahnya sudah tersedia** — tidak perlu tabel baru dari nol.

`model Integration` sudah punya persis bentuk yang dibutuhkan:
`category = "ITOPS"`, `provider = "MAILCOW"`, `baseUrl`, `authType`, dan yang
terpenting **`credentialRef` yang menyimpan NAMA environment variable, bukan
secretnya**. Pola yang sama sudah dipakai router MikroTik (`MIKROTIK_POP1_CRED`),
dan pola itu wajib dipertahankan: **API key mailcow tidak boleh masuk database.**

Yang perlu dibangun hanya halaman `/it/mailserver` di atasnya, berizin
`integrations.manage` (sudah dipegang `it_manager`).

### 3.3 Migrasi aplikasi tema mailcow ke CRM?

Di sini saya sarankan **tidak**, dan alasannya bukan soal usaha.

Aplikasi tema itu bekerja dengan menulis ke server mailcow — CSS, logo, berkas
tampilan. Kalau kemampuan itu ditanam di CRM, maka CRM harus memegang akses
tulis ke mailserver. CRM adalah aplikasi yang paling banyak dipakai orang dan
paling luas permukaannya; memberinya kuasa mengubah mailserver berarti satu
celah di CRM menjadi celah di email perusahaan juga.

**Yang saya sarankan:** daftarkan aplikasi tema itu di `model Application` yang
sudah ada — dengan nama, domain, owner, dan server — lalu biarkan ia tetap
berdiri sendiri. CRM cukup menjadi **katalog dan pintu masuknya** (§4). Kamu
tetap dapat "satu tempat melihat semua aplikasi" tanpa menyatukan kuasanya.

Kalau nanti kamu tetap ingin sebagian ada di CRM, batasi **hanya pada yang
disediakan API resmi mailcow**, jangan menulis berkas langsung. Apakah endpoint
kustomisasi tampilan tersedia di API mailcow perlu diperiksa dulu pada versi
yang kamu pasang — saya belum memverifikasinya, jadi itu langkah pertama
sebelum apa pun diputuskan.

---

## 4. Model otorisasi lintas aplikasi — bagian yang paling perlu hati-hati

Maumu: *email Teguh bertag marketing → Teguh dapat role marketing di CRM →
Teguh juga bisa masuk captive portal.*

Arahnya benar, tapi ada satu hal yang **tidak boleh** dilakukan persis seperti
itu, dan ini penting.

### 4.1 Tag boleh menentukan DIVISI, tidak boleh menentukan KEWENANGAN

Kalau tag mailbox langsung memberi peran penuh di CRM, maka **siapa pun yang
bisa mengedit mailbox bisa menaikkan kewenangan orang di CRM.** Cukup tambahkan
tag `finance` pada sebuah mailbox, dan orang itu mendapat akses keuangan tanpa
melewati satu pun persetujuan. Mailserver berubah menjadi pintu belakang RBAC.

Ini bukan kekhawatiran teoretis — CRM ini punya Segregation of Duties yang
ditegakkan sungguhan: pembuat tidak boleh menyetujui, sales tidak boleh
mengaktifkan langganan. Semuanya runtuh kalau peran bisa diberikan dari luar.

**Pembagian yang benar:**

| Lapisan | Sumbernya | Contoh |
|---|---|---|
| **Identitas** — siapa kamu | IdP (email + password + 2FA) | `teguh@perumnet.id` |
| **Keanggotaan** — kamu bagian mana | Tag mailbox / grup, dikelola IT | divisi `MKT` |
| **Akses masuk aplikasi** — boleh masuk atau tidak | Keanggotaan | captive portal terbuka untuk `IT`, `MKT`, `ADMIN` |
| **Kewenangan di dalam CRM** — boleh apa | **Peran CRM, ditetapkan eksplisit** | `marketing` → `campaigns.manage` |

Jadi tag **memberi Teguh divisi Marketing dan membuka captive portal untuknya
secara otomatis**, tetapi peran `marketing` di CRM tetap diberikan oleh admin.
Untuk aplikasi sederhana seperti captive portal, keanggotaan saja memang sudah
cukup — dan di situlah maumu terpenuhi sepenuhnya.

### 4.2 Rantai datanya

```
     CRM  ──────────►  IdP (Authentik)  ──────────►  aplikasi lain
  (data pegawai)        (akun + grup)              (captive portal, LibreNMS)
       │                      │
       │                      └──► mailcow (ikut jadi klien IdP)
       │
       └──► tag mailbox mailcow (cermin dari divisi, ditulis dari CRM)
```

**CRM adalah induk data kepegawaian** — siapa bekerja di sini, divisinya apa,
kontraknya sampai kapan. Ketika Teguh pindah ke Marketing, itu berubah di CRM,
lalu mengalir keluar ke IdP dan mailcow. Bukan sebaliknya.

Konsekuensinya untuk E2: **tag ditulis DARI CRM**, dengan dropdown divisi yang
sah — bukan diketik bebas di mailcow. Salah ketik jadi mustahil, dan setiap
perubahan tercatat di audit log CRM. Sinkronisasi dari arah mailcow tetap ada,
tapi hanya untuk **melaporkan selisih** (mailbox tanpa pegawai, pegawai tanpa
mailbox), bukan mengubah divisi diam-diam.

### 4.3 Kenapa tetap butuh IdP, bukan mailcow saja

mailcow bisa memverifikasi password untuk IMAP/SMTP, tapi **tidak menerbitkan
sesi yang bisa dipakai aplikasi lain** — tidak ada token, tidak ada single
logout. Kalau captive portal "login ke mailcow" langsung, yang kamu dapat bukan
satu pintu melainkan **banyak pintu dengan kunci yang sama**: tiap aplikasi
tetap meminta password dan sempat memegangnya.

IdP tersendiri (**Authentik** — saranku, lebih ringan dari Keycloak dan cukup
untuk skala PerumNet) di VPS lokalmu memberi apa yang tidak bisa didapat tanpa
itu: nonaktifkan satu akun → semua aplikasi tertutup seketika; 2FA diatur
sekali; dan CRM **tidak pernah menyentuh password sama sekali**.

---

## 4b. Pembekuan, penghapusan, dan arsip

### 4b.1 Siklus akun saat kontrak berakhir (keputusan E4)

```
AKTIF ──kontrak habis──► BEKU ──3 bulan──► DIARSIPKAN
  ▲                       │
  └───diperpanjang────────┘
```

| Keadaan | Bisa login? | Datanya? |
|---|---|---|
| **AKTIF** | ya | utuh |
| **BEKU** | **tidak** | **utuh dan tetap terlihat** — riwayat approval, absensi, tiket, semua tetap ada |
| **DIARSIPKAN** | tidak | keluar dari daftar aktif, masuk arsip, **tetap bisa dibuka dan dipulihkan** |

Yang harus dibedakan tegas: **yang dibekukan adalah AKUN, bukan DATA PEGAWAI.**
Catatan kepegawaian — absensi, cuti, lembur, siapa menyetujui apa — wajib
bertahan bertahun-tahun untuk keperluan penggajian dan hukum. Orangnya berhenti
bisa masuk sistem; jejaknya tidak boleh ikut hilang. Kalau `Employee` ikut
"masuk trash", setiap dokumen lama yang menyebut namanya jadi menggantung.

Pembekuan dijalankan worker Fase 27, dan **memberi tahu HRD H-30 dan H-7
sebelum terjadi** supaya perpanjangan kontrak sempat diurus. Pembekuan otomatis
tetap boleh dibatalkan manusia — tanggal kontrak bisa saja salah ketik.

### 4b.2 Apakah "trash" sudah ada? — sebagian, dan tanpa nama itu

Diperiksa langsung ke skema dan seluruh `src/`.

**Yang sudah ada dan sudah berjalan:**

| Mekanisme | Bukti |
|---|---|
| **`AuditLog` append-only** — tidak ada jalur update/delete di aplikasi | 200+ titik panggil `logAudit()` di 20 modul |
| **Status hidup-mati, bukan hapus** — dokumen tidak dihapus, statusnya berubah | 21 tempat memakai `VOID`/`CANCELLED`/`REVERSAL` |
| **Alasan tercatat** pada pembatalan yang penting | `Invoice.voidReason`, `AccessRequest.revokeReason`, `DeviceRecoveryIssue.cancelReason`, `Device.lostReason` |
| **`isActive`** sebagai penanda nonaktif | 32 tempat di skema |
| **Transaksi terposting tak bisa diubah** — koreksi lewat pembalikan | inti modul inventory |

**Yang belum ada:**

| Kekurangan | Akibatnya |
|---|---|
| **Tidak ada `deletedAt`/`isDeleted`/`archivedAt` sama sekali** (0 di skema) | tidak ada konsep "diarsipkan" yang seragam |
| **Tidak ada halaman Trash** | yang sudah dinonaktifkan tersebar di masing-masing modul, tak ada satu tempat melihat |
| **Alasan baru wajib di 4 tempat**, bukan aturan sistem | modul baru bisa lupa menyertakannya |
| Belum ada jalur **pulihkan** | `isActive: false` bisa dibalik, tapi tidak ada catatan siapa/kenapa |

**Jadi:** prinsip yang kamu mau — *tidak dihapus, dicatat, ada alasannya* —
**sudah dipatuhi dalam praktik**, tapi belum menjadi mekanisme tunggal yang
dijamin sistem.

Catatan penting supaya tidak salah paham: `.delete()` memang masih ada di
beberapa berkas, tapi setelah diperiksa satu per satu semuanya **jalur
pembatalan otomatis**, bukan penghapusan oleh pengguna:
- `billing.ts:509`, `payments.ts:559` — baris yang baru dibuat sedetik
  sebelumnya, lalu jurnalnya gagal, jadi dibuang sebelum sempat terlihat siapa
  pun.
- `hrd.ts:433` — pengajuan cuti yang gagal masuk mesin approval.
- `ftth.ts:156` — port ODP, dan itu pun **ditolak bila port masih terpakai**.
- `userRole`, `rolePermission`, `ticketMember` — tabel penghubung yang memang
  ditulis ulang, bukan data.

Tidak ada satu pun yang menghapus data yang sudah dipakai orang.

### 4b.3 Usulan: satu tabel arsip, bukan `deletedAt` di mana-mana

Godaan yang wajar adalah menambahkan `deletedAt` ke semua tabel. Saya sarankan
**jangan**, karena tiga hal yang mahal:

1. **Setiap query harus ingat menyaringnya.** Satu saja lupa, dan data yang
   "sudah dihapus" bocor kembali ke laporan atau daftar.
2. **Batasan unik jadi rusak.** `employeeNo` yang sudah dihapus masih menempati
   indeks uniknya, sehingga nomor itu tak bisa dipakai lagi selamanya.
3. **Menduplikasi apa yang sudah dilakukan status.** `Invoice.VOID` sudah lebih
   baik daripada `deletedAt` — ia menyimpan makna, bukan sekadar "hilang".

**Yang saya sarankan** — satu tabel arsip append-only:

```prisma
model ArchivedRecord {
  id          String   @id @default(cuid())
  entityType  String   // "Employee", "Customer", "Lead", ...
  entityId    String
  label       String   // teks yang dikenali manusia, mis. "Teguh — EMP-0012"
  snapshot    String   // JSON isi lengkap saat diarsipkan
  reason      String   // WAJIB — tidak boleh kosong
  archivedById String
  archivedAt  DateTime @default(now())
  restoredById String?
  restoredAt  DateTime?

  @@index([entityType, archivedAt])
}
```

Keuntungannya: **satu halaman `/settings/trash`** untuk semua modul, alasan
dijamin ada karena kolomnya tidak boleh kosong, isi lengkapnya tersimpan
sehingga pemulihan benar-benar mungkin, dan **tidak satu query pun di seluruh
sistem perlu diubah**.

Aturannya: modul memakai status lifecycle seperti sekarang (`VOID`, `CANCELLED`,
`isActive:false`) untuk hal yang punya makna bisnis; `ArchivedRecord` dipakai
saat sebuah baris benar-benar harus keluar dari peredaran.

Ini layak jadi fasenya sendiri — saya usulkan **Fase 47**, dan sebaiknya
dikerjakan **setelah** 41–42 supaya pembekuan akun bisa langsung memakainya.

---

## 5. Pemecahan fase

| Fase | Isi | Status |
|---|---|---|
| **41** | **Data pegawai lengkap** — alamat, shift/non-shift, `jobLevel` (`STAFF\|LEADER`), `contractStartAt`/`contractEndAt`. Aditif murni, tanpa integrasi. | ✅ **SELESAI** |
| **42** | **Kontrak berakhir → pembekuan akun** — worker Fase 27 memberi tahu H-30 & H-7, lalu membekukan akun saat jatuh tempo (§4b.1). Data pegawai tetap utuh. | ✅ **SELESAI** |
| **43** | **Setting mailserver** — `Integration` provider `MAILCOW`, halaman `/it/mailserver`, uji koneksi. Belum menyentuh mailbox. | ✅ **SELESAI** |
| **44** | **Pengelolaan mailbox & label divisi** — bandingkan CRM ↔ mailcow, dorong divisi CRM jadi tag, laporkan selisih. | ✅ **SELESAI** |
| **45** | **Adapter identitas (OIDC/Authentik)** — login lewat IdP, akun terikat `oidcSubject`, jalur darurat lokal dengan audit tersendiri. | ✅ **SELESAI** — diuji sungguhan terhadap Authentik di `auth.perumnet.id` |
| **46** | **Katalog & akses aplikasi lain** — captive portal dkk. terdaftar di `Application`, dengan daftar divisi yang boleh masuk; IdP menerbitkan grupnya. | 45 |
| **47** | **Arsip & pemulihan terpadu** — `ArchivedRecord` + halaman `/settings/trash`, alasan wajib (§4b.3). Pengarsipan akun beku 3 bulan memakainya. | ✅ **SELESAI** |

**Fase 41, 42, 43, 44, dan 47 sudah selesai.** Dijaga 279 tes unit + 120 tes
integrasi. Sisanya: **45** menunggu Authentik berdiri (lihat §8b), **46**
mengikuti setelahnya.

**Fase 41 tidak menunggu apa pun** — E3 dan E5 sudah kamu putuskan, jadi bisa
mulai sekarang.

---

## 6. Spesifikasi frontend untuk Luna

> **Status: BELUM ADA DI BACKEND.** Jangan mulai sebelum fase yang bersangkutan
> selesai dan tercatat di `HANDOFF-BACKEND-KE-FRONTEND.md`. Bagian ini supaya
> Luna bisa merancang lebih dulu, bukan izin untuk mengimplementasi.

### 6.1 Fase 41 — Data pegawai (paling dekat, rancang duluan)

**Halaman:** `/hr/employees/[id]` (detail) dan formnya. Juga tampil ringkas di
`/profile` milik pegawai sendiri.

Kolom baru pada `Employee`:

| Field | Tipe | Catatan UI |
|---|---|---|
| `address` | teks panjang, opsional | textarea; alamat domisili |
| `workPattern` | `SHIFT \| NON_SHIFT` | radio/segmented; default `NON_SHIFT` |
| `jobLevel` | `STAFF \| LEADER` | segmented; default `STAFF` |
| `contractStartAt` | tanggal, opsional | **hanya tampil** bila `employeeType = CONTRACT` |
| `contractEndAt` | tanggal, opsional | idem; tampilkan sisa durasi ("berakhir 4 bulan lagi") |

Aturan tampilan yang harus dihormati:
- `employeeType` **bukan** field baru — pakai yang sudah ada, label Indonesia:
  `FULL_TIME` → "Karyawan Tetap", `CONTRACT` → "Kontrak",
  `PART_TIME` → "Paruh Waktu", `PROBATION` → "Masa Percobaan".
- Blok kontrak **muncul dan menghilang** mengikuti `employeeType`. Kalau bukan
  `CONTRACT`, tanggalnya tidak ditampilkan sama sekali (bukan sekadar disabled).
- **`jobLevel` ≠ `User.level`.** Jangan pernah menampilkan keduanya dengan
  label yang sama. `jobLevel` = jenjang jabatan (fakta kepegawaian);
  `User.level` = hierarki persetujuan. Sebut yang kedua "Level Approval".
- Sisa kontrak yang tinggal < 30 hari diberi penanda peringatan, tapi **jangan**
  ditampilkan sebagai error — orangnya masih bekerja normal.

**Izin:** melihat = `master_data.view`; mengubah = `master_data.manage`.
Pegawai melihat datanya sendiri di `/profile` tanpa izin khusus, **tanpa tombol
ubah**.

### 6.2 Fase 43 — Setting mailserver

**Halaman:** `/it/mailserver`, izin `integrations.manage`.

Isi form: `baseUrl`, `authType`, `credentialRef`, `isEnabled`, `notes`.

Yang **wajib** dihormati di UI:
- Field `credentialRef` diberi label **"Nama Environment Variable"**, dengan
  contoh `MAILCOW_API_KEY` dan keterangan tegas: *"Isi nama variabelnya saja.
  API key tidak pernah disimpan di database."*
- **Tidak boleh ada field untuk API key itu sendiri.** Kalau nanti ada
  permintaan menambahkannya, tolak dan rujuk ke bagian ini.
- Tombol "Uji Koneksi" menampilkan hasil (OK / gagal beserta pesannya) tanpa
  pernah menampilkan kredensial.

### 6.3 Fase 44 — Pengelolaan mailbox

**Halaman:** `/it/mailboxes`, izin `access.manage` (dipegang `it_support` dan
`it_manager`).

Tabel: alamat email · pegawai tertaut · divisi · status tag · aksi.

Tiga keadaan yang harus punya tampilan berbeda dan jelas:
1. **Cocok** — mailbox tertaut pegawai, tag sesuai divisinya.
2. **Belum tertaut** — mailbox ada, pegawainya belum dipilih. Aksi: "Tautkan".
3. **Selisih** — tag di mailcow berbeda dari divisi di CRM. Tampilkan
   **keduanya berdampingan** dan minta pilihan; jangan pernah menerapkan
   otomatis.

Divisi diubah lewat **dropdown daftar divisi yang sah**, tidak pernah teks
bebas. Ini yang membuat salah ketik mustahil.

### 6.4 Halaman profil saat identitas terpusat aktif (Fase 45)

Kontrak `authProvider()` / `passwordChangeAvailable()` **sudah ada** dan sudah
kamu pakai — tidak berubah. Yang bertambah nanti hanya nilai baru `"OIDC"` yang
diperlakukan sama seperti `MAILSERVER`: form ganti password disembunyikan,
diganti tautan ke IdP.

---

### 6.5 Fase 42 & 47 — Akun beku dan halaman arsip

**Akun beku** (Fase 42) muncul di banyak tempat, jadi tampilannya harus satu
kosakata:
- Label tetap **"Beku"**, bukan "Nonaktif" — beku itu sementara dan bisa
  dibalik; nonaktif terdengar final.
- Di daftar pegawai: baris beku **tetap terlihat**, diberi penanda, tidak
  disembunyikan. Menyembunyikannya membuat HRD mengira orangnya sudah hilang.
- Di halaman detail: banner yang menyebut **sejak kapan beku** dan
  **kapan akan diarsipkan** ("beku sejak 1 Sep 2026 — diarsipkan 1 Des 2026").
- Kalau yang membuka adalah orangnya sendiri di `/profile`, jangan tampilkan
  banner administratif — cukup keterangan bahwa akunnya sedang tidak aktif dan
  siapa yang harus dihubungi.

**Halaman arsip** (Fase 47): `/settings/trash`, izin `master_data.manage`.

Tabel: jenis · label · alasan · diarsipkan oleh · tanggal · aksi Pulihkan.

- **Alasan selalu ada** — kolomnya tidak boleh kosong di backend, jadi UI tidak
  perlu menangani keadaan kosong.
- Saring berdasarkan jenis entitas dan rentang tanggal.
- Tombol **Pulihkan** meminta konfirmasi dan menampilkan apa yang akan kembali.
- Baris yang sudah dipulihkan tetap tampil dengan penanda "sudah dipulihkan" —
  **jangan hilang dari daftar**, karena tabelnya append-only dan itu bagian dari
  jejaknya.
- **Tidak ada tombol "Hapus Permanen".** Kalau nanti diminta, tolak dan rujuk ke
  sini.

---

## 7. Prinsip yang dipegang

1. **Secret tidak pernah masuk database.** Yang disimpan hanya nama environment
   variable — sama seperti kredensial MikroTik.
2. **Tag/grup dari luar tidak boleh memberi kewenangan di CRM.** Ia boleh
   memberi divisi dan membuka akses masuk aplikasi lain; peran CRM tetap
   ditetapkan eksplisit. Tanpa batas ini, mailserver menjadi pintu belakang RBAC.
3. **Cadangan bila IdP mati wajib ada.** Minimal satu akun darurat lokal tetap
   bisa masuk, dan pemakaiannya tercatat di audit log.
4. **CRM adalah induk data kepegawaian**, IdP induk autentikasi. Perubahan
   mengalir dari CRM keluar, bukan sebaliknya.
5. **Email bisa berubah.** Yang disimpan sebagai penaut adalah id akun dari IdP,
   bukan alamat emailnya saja — supaya ganti alamat tidak memutus riwayat.
6. **Jenjang jabatan ≠ hierarki approval.** Menyatukannya berarti promosi
   jabatan diam-diam mengubah kewenangan persetujuan.
7. **CRM tidak diberi kuasa menulis ke mailserver** di luar yang benar-benar
   perlu (tag mailbox).

---

## 8. Yang masih saya butuhkan

Seluruh keputusan sudah diambil. Yang tersisa bukan pertanyaan, melainkan
perangkat yang harus berdiri lebih dulu.

## 8b. Fase 45 — apa yang saya butuhkan dari Authentik

Fase 45 **tidak saya kerjakan sekarang**, dan alasannya bukan waktu.

Menambah jalur autentikasi baru adalah perubahan paling berkonsekuensi yang
bisa dilakukan pada sistem ini: kalau salah, seluruh perusahaan terkunci di
luar CRM. Menulisnya tanpa satu pun IdP untuk diuji berarti menyerahkan
pembuktiannya ke hari pertama pemakaian — dan hari itu adalah hari yang paling
buruk untuk menemukan kesalahan.

**Yang perlu kamu siapkan di Authentik lebih dulu:**

1. Buat **Application** + **Provider (OAuth2/OIDC)** untuk CRM.
2. Redirect URI: `https://<alamat-crm>/api/auth/callback/oidc`
3. Catat tiga hal ini dan kirim ke saya — **kecuali yang ketiga**:
   - **Issuer URL** (mis. `https://auth.perumnet.id/application/o/perumnet-crm/`)
   - **Client ID**
   - **Client Secret** → jangan dikirim ke saya. Kamu sendiri yang menaruhnya
     di `.env` server sebagai `OIDC_CLIENT_SECRET`. Yang masuk database tetap
     hanya nama variabelnya, sama seperti API key mailcow dan kredensial
     MikroTik.
4. Di Authentik, pastikan scope `openid profile email` tersedia.

Begitu Issuer URL dan Client ID ada, Fase 45 bisa saya kerjakan dan diuji
sungguhan — bukan ditebak.

**Yang sudah siap menyambutnya:** kerangka `AUTH_PROVIDER` (Fase 34),
`passwordChangeAvailable()` yang sudah dihormati frontend, dan `sessionEpoch`
untuk mencabut sesi. Nilai baru `"OIDC"` tinggal diperlakukan seperti
`"MAILSERVER"`.

**Cadangan darurat tetap wajib** (prinsip §7 no. 3): minimal satu akun lokal
harus tetap bisa masuk saat Authentik mati, dan pemakaiannya tercatat di audit
log. Tanpa itu, IdP yang tumbang berarti tidak ada seorang pun bisa masuk —
termasuk untuk memperbaiki IdP-nya.

---

## Lampiran — permintaan Luna yang masih terbuka

Dari `PRD-PerumNet-CRM-FRONTEND-UX.md` §20:

1. ~~Scope teknisi ditegakkan di server~~ — **sudah**, Fase 40.
2. **Action unggah gambar tanda tangan** yang mengembalikan `attachmentId` —
   belum ada. Saat ini hanya nama penanda tangan yang disimpan. Perlu keputusan:
   apakah gambar tanda tangan wajib secara hukum/operasional?
3. **Redirect setelah aksi dari portal teknisi** — semua action recovery kembali
   ke `/inventory/device-recoveries/...`, sehingga teknisi terlempar keluar dari
   portalnya. Perlu kembali ke `/portal/recoveries/...` bila aksinya dari sana.
