# Handoff Backend → Frontend (Luna)

**Tanggal:** 2026-08-13 (diperbarui setelah Fase 49 — kartu pegawai)
**Untuk:** pengerjaan frontend PerumNet CRM
**Dari:** sisi backend (Opus)
**Sumber kontrak:** §13 `PRD-PerumNet-CRM-FRONTEND-UX.md`

Semua yang diminta pada handoff §13 **sudah tersedia di `main`**, ditambah
beberapa hal yang muncul dari audit dan dari perbandingan dengan sistem lama.
Dokumen ini menyebut nama fungsi, nama field form, dan batas perilakunya —
supaya tidak perlu menebak dari kode.

Semua nama di bawah sudah diverifikasi langsung dari sumbernya, bukan dari
ingatan.

---

## 0. Ringkasan: apa yang sekarang bisa dikerjakan

| # | Pekerjaan | Blocker sebelumnya | Sekarang |
|---|---|---|---|
| 1 | Dropdown notifikasi | loader belum ada | ✅ siap |
| 2 | **Entity search** (pelanggan, tiket, invoice, perangkat…) | endpoint belum ada | ✅ siap |
| 3 | Simpan kontak di halaman profil | action belum ada | ✅ siap |
| 4 | Tombol ganti password | kontrak `auth` belum ada | ✅ siap — **tapi lihat §4, ada yang perlu disepakati** |
| 5 | **Peta status PPPoE** (offline diwarnai, hitungan, pemilih router) | data belum menyatu | ✅ siap |
| 5b | **Lapisan POP, MS/ODC, dan rute kabel di peta** | data belum dirakit | ✅ siap — lihat §5b |
| 6 | Unggah foto bukti + tanda tangan + koordinat penarikan | action belum ada | ✅ siap |
| 7 | Checklist inspeksi ya/tidak | — | ⚠️ perlu dibuat, lihat §6 |
| 8 | Penyaringan teknisi & pencarian serial di daftar penarikan | — | ⚠️ perlu dibuat |
| 9 | Tombol "Ajukan Terminasi" di Customer 360 | — | ⚠️ perlu dibuat |
| 10 | Portal teknisi `/portal/recoveries` | — | ⚠️ perlu dibuat |
| 11 | **Data pegawai lengkap** (alamat, shift, jenjang, masa kontrak) | field belum ada | ✅ siap — lihat §9 |
| 12 | **Akun beku & pencairan** | konsep belum ada | ✅ siap — lihat §10 |
| 13 | **Halaman arsip `/settings/trash`** | mekanisme belum ada | ✅ siap — lihat §11 |
| 14 | **Setting mailserver + label divisi mailbox** | integrasi belum ada | ✅ siap — lihat §13 |
| 15 | **Unggah gambar tanda tangan + redirect kembali ke portal** (§20 PRD-mu) | action belum ada | ✅ siap — lihat §14 |
| 16 | **Identitas terpusat aktif** — `provider` bisa bernilai `OIDC` | menunggu IdP | ✅ **sudah jalan** — lihat §15 |
| 17 | **Tiga dependency dari PRD §24–25** — field HR di `profileView`, filter tanggal arsip, gambar tanda tangan IRF | kontrak belum ada | ✅ siap — lihat §16 |
| 18 | **Sinkronisasi divisi → grup Authentik** | mesin belum ada | ✅ siap, halamanmu sudah ada — lihat §17 |
| 19 | **Kartu pegawai + foto resmi + QR** | mesin belum ada | ⚠️ mesin siap, **halaman perlu dibuat** — lihat §18 |
| 20 | **Impor pegawai dari Excel** (pratinjau + terapkan) | mesin belum ada | ⚠️ mesin siap, **halaman perlu dibuat** — lihat §19 |
| 21 | **Akun CRM massal dari kotak surat** (centang → buat) | mesin belum ada | ⚠️ mesin siap, **halaman perlu dibuat** — lihat §20 |

> **Catatan: tiga baris di tabel ini sudah kamu selesaikan** — checklist inspeksi
> (#7), filter teknisi & cari serial (#8), dan tombol "Ajukan Terminasi" (#9).
> Diperiksa langsung ke kode, bukan ke dokumen ini. Yang benar-benar tersisa:
> #10, §18, §19, §20.

---

## 1. Dropdown notifikasi — SIAP

```ts
import { notificationMenuData, NOTIFICATION_MENU_LIMIT } from "@/lib/notification-menu";

const data = await notificationMenuData(user.id);          // limit bawaan 5
const data = await notificationMenuData(user.id, 10);      // maksimal 20
```

Mengembalikan `NotificationMenuData` persis seperti kontrak §13:
`{ unreadCount, items[], hasMore }`.

Yang perlu diketahui:

- **`href` bisa bernilai `null`.** Tautan yang tersimpan di database divalidasi
  sebagai path internal; URL absolut, `//host`, dan skema `javascript:` ditolak
  menjadi `null`. Tampilkan item itu **tanpa** tautan, jangan dipaksa jadi `#`.
- `hasMore` sudah jujur — dihitung dengan mengambil satu baris lebih banyak.
- Notifikasi yang sudah dibaca **tetap tampil** di daftar; `unreadCount` hanya
  menghitung yang belum dibaca.
- Action `openNotificationAction` dan `markAllReadAction` di
  `app/(app)/notifications/actions.ts` tidak berubah, tetap dipakai.

## 2. Entity search — SIAP (ini yang menghalangi fase berikutnya)

**Endpoint:** `GET /api/search?q=<kata kunci>`

```jsonc
{ "results": [ { "id", "type", "module", "title", "subtitle", "href" } ] }
```

Atau langsung dari server component:

```ts
import { searchEntities, isSearchable } from "@/lib/search";
const results = await searchEntities(user, q);
```

Cakupan: pelanggan, langganan, perangkat serial, tiket, invoice, work order,
terminasi.

Yang perlu diketahui:

- **Minimal 2 karakter.** Di bawah itu mengembalikan `[]` tanpa menyentuh
  database. Pakai `isSearchable(q)` untuk memutuskan empty state.
- **Hasilnya sudah dipagari izin.** Jenis yang izinnya tidak dipegang user
  tidak ikut dicari sama sekali. Tidak perlu menyaring lagi di UI.
- Maksimal 5 per jenis, 20 total.
- `href` selalu path internal yang sudah divalidasi — aman dipakai langsung.
- Balasan memakai `Cache-Control: private, no-store`; jangan di-cache di sisi
  klien, isinya bergantung pada izin pemanggil.

## 3. Profil — SIAP

```ts
import { profileView } from "@/lib/profile";
const view = await profileView(user.id);   // ProfileView | null
```

Bentuknya persis kontrak §13: `{ user, employee, auth }`. `employee` bernilai
`null` bila akun belum ditautkan ke data kepegawaian — itu keadaan wajar, bukan
error.

**Action simpan kontak:**

```
action: updateContactAction   (app/(app)/profile/actions.ts)
field : name, phone
```

Hanya nama tampilan dan telepon yang bisa diubah. Email, username, role,
divisi, NIK, dan jabatan sengaja **tidak** bisa disentuh dari sini — semuanya
berkonsekuensi RBAC atau kepegawaian.

Validasi yang sudah ditegakkan server (UI tidak perlu mengulang, tapi boleh
memberi umpan balik lebih awal):
nama wajib & maksimal 100 karakter · telepon `^[0-9+()\s-]{6,25}$` ·
menyimpan tanpa perubahan ditolak.

## 4. Ganti password & identitas — SUDAH DIPUTUSKAN, lihat juga §15

> **Diperbarui Fase 45.** Pertanyaan terbuka di bawah **sudah terjawab**:
> `AUTH_PROVIDER` kini bernilai `OIDC` dan login lewat Authentik sudah berjalan.
> `provider` melaporkan `"OIDC"`, `passwordChangeAvailable` bernilai `false`,
> dan teks "identitas terpusat" di halaman profil kini benar apa adanya.
> Catatan asli dibiarkan di bawah sebagai rekaman alasannya.

```ts
view.auth.provider                 // "LOCAL" | "MAILSERVER" | "OIDC"
view.auth.passwordChangeAvailable  // boolean
```

Aktifkan tombol ganti password **hanya** bila `passwordChangeAvailable === true`,
persis seperti yang kamu tulis di §11.

⚠️ **Perbedaan yang perlu diputuskan PO.** Halaman profil menampilkan status
"akun email terpusat / menunggu integrasi", sedangkan kontrak hari ini
melaporkan `provider: "LOCAL"` dan `passwordChangeAvailable: true`.

Itu **bukan kelalaian** — itu keadaan sebenarnya: password CRM hari ini memang
disimpan lokal sebagai hash bcrypt, dan `changePasswordAction` benar-benar
bekerja. Melaporkan `MAILSERVER` sekarang berarti berbohong kepada UI.

Begitu penyedia identitas resmi dipasang, cukup set `AUTH_PROVIDER=MAILSERVER`
di environment: tombol otomatis nonaktif, dan server pun **menolak** mengganti
password. Jadi tidak ada yang bisa mengubah hash lokal lalu merasa aman padahal
kredensial sebenarnya tidak berubah.

**Yang perlu diputuskan:** apakah sekarang mau langsung `MAILSERVER` (tombol
mati, teks "menunggu integrasi" jadi benar) atau tetap `LOCAL` (teksnya yang
perlu disesuaikan).

Catatan tambahan: mengganti password sekarang **mematikan seluruh sesi lain**
di perangkat lain. Sesi di perangkat yang sedang dipakai diterbitkan ulang
otomatis, jadi pengguna tidak terlempar keluar setelah mengganti passwordnya
sendiri. Tidak ada yang perlu diubah di UI untuk ini.

## 5. Peta status PPPoE — SIAP

`loadNetworkMap()` sekarang mengembalikan keadaan sambungan langsung dari
router. Seluruh tambahan bersifat **aditif** — komponen peta yang ada tetap
jalan tanpa diubah.

**Per pelanggan** (`MapCustomer`):

```ts
pppoeUsername : string | null
linkStatus    : "ONLINE" | "OFFLINE" | "DISABLED" | "UNKNOWN"
lastSeenAt    : string | null   // ISO — dasar "offline sejak"
routerId      : string | null
routerName    : string | null
```

**Tingkat peta** (`NetworkMapData`):

```ts
linkCounts   : { ONLINE, OFFLINE, DISABLED, UNKNOWN }
routers      : { id, name, lastPolledAt }[]
lastSyncedAt : string | null
```

**Filter** (`MapFilter`): `routerId`, `linkStatus` — selain `siteId`, `oltId`,
`minOccupancy`, `subscriptionStatus` yang sudah ada.

Yang perlu diketahui, dan ini penting untuk penyajiannya:

- **`UNKNOWN` bukan `OFFLINE`.** Langganan tanpa sesi router — misalnya
  routernya belum didaftarkan — bukan pelanggan yang jaringannya mati. Beri
  warna/label berbeda; jangan digabung ke hitungan offline.
- **`linkStatus` berbeda dari `status`.** `status` adalah status langganan
  (ACTIVE/ISOLATED/…); `linkStatus` adalah keadaan sambungan menurut router.
  Pelanggan ACTIVE bisa saja OFFLINE — justru itu yang perlu terlihat.
- **`linkCounts` dihitung dari titik yang tampil**, bukan seluruh tabel. Jadi
  angkanya selalu cocok dengan yang bisa diklik, termasuk saat filter aktif.
- **Tampilkan `lastSyncedAt`.** Peta status tanpa keterangan waktu justru
  paling menyesatkan ketika poller-nya mati — layar terlihat normal padahal
  datanya basi.
- **Saringan router menyaring pelanggan saja**, ODP tetap tampil. Itu memang
  disengaja: topologi bukan milik satu router.

Yang **belum ada dan tidak bisa ditampilkan**: `los` (loss of signal). Itu
status optik ONU yang hanya bisa dibaca dari OLT lewat SNMP/telnet, sedangkan
kita baru menarik data dari MikroTik.

## 5b. Lapisan peta FTTH lengkap — SIAP (Fase 38–39)

`loadNetworkMap()` sekarang merakit SELURUH jenis simpul jaringan, bukan hanya
ODP dan pelanggan. Semuanya aditif — komponen peta yang ada tetap jalan.

```ts
sites  : MapSite[]    // POP dan mini-POP
routes : MapRoute[]   // rute kabel: feeder, distribusi, drop core
odps[].role           // "MS" | "ODP" — pembeda ikon
```

```ts
interface MapSite  { id, code, name, type, latitude, longitude, status }
interface MapRoute { id, name, routeType, coordinates: [lng,lat][], lengthMeters }
```

Yang perlu diketahui saat menyajikannya:

- **POP bukan simpul distribusi.** Dia tidak punya port maupun okupansi, jadi
  sengaja dipisah dari `odps` alih-alih dipaksa masuk bentuk yang sama. Beri
  ikon tersendiri; jangan tampilkan indikator okupansi untuknya.
- **`role` membedakan MS dari ODP.** Keduanya berbagi tabel karena sama-sama
  punya port dan induk PON — yang membedakan hanya posisinya di rantai. Sistem
  pembanding memakai warna berbeda untuk "Parent ODP" dan "ODP/Dispoint";
  polanya sama.
- **Kaskade tetap dari `cascades`**, bukan diturunkan dari `role`.
- **`routes` adalah lapisan visual, bukan sumber kebenaran.** Geometrinya
  digambar tangan surveyor. `lengthMeters` adalah jumlah jarak lurus antar
  simpul — **bukan panjang kabel sebenarnya**. Kalau ditampilkan, sebut sebagai
  perkiraan; jangan disandingkan dengan angka yang terkesan resmi.
- `routeType` bernilai `FEEDER` | `DISTRIBUTION` | `DROP` | `OTHER`. Bedakan
  ketebalan atau gaya garisnya; `OTHER` berarti jenisnya memang belum
  ditentukan, bukan jenis keempat.

### Impor KMZ — halaman sudah ada, tidak perlu dibuat

`/noc/ftth/kml` sudah menerima `.kml` maupun `.kmz`, menebak jenis titik dari
folder, menampilkan pratinjau, dan mengimpor POP/MS/ODP beserta rute kabel.
Halaman itu bukan bagian dari pekerjaan frontend ini — cukup pastikan tabelnya
lolos kontrak responsive.

Satu hal yang penting dipahami bila kelak menyentuh alurnya: impor **hanya
mengisi koordinat yang kosong dan tidak pernah menimpa**. Baris berlabel
"Dipertahankan" menampilkan jarak antara titik di berkas dan koordinat
tersimpan — itu disengaja, supaya perbedaan tetap terlihat tanpa ada yang
diubah diam-diam.

## 6. Bukti lapangan penarikan — SIAP

Seluruh action ada di `app/(app)/inventory/device-recoveries/actions.ts`.
Form unggahan wajib `encType="multipart/form-data"`.

| Action | Field yang dibaca |
|---|---|
| `attachEvidenceAction` | `recoveryId`, `kind` (`ATTEMPT`\|`PICKUP`\|`INSPECTION`), `entityId`, `file` |
| `signPickupAction` | `recoveryId`, `role` (`CUSTOMER`\|`TECHNICIAN`), `signerName`, `attachmentId?` |
| `recordAttemptAction` | + `latitude`, `longitude` (opsional) |

Untuk menampilkan: `recoveryEvidence(kind, entityId)` dan
`recoverySignatures(recoveryId)` di `@/lib/device-recovery`. Gambar dibuka lewat
`/api/files/<id>`.

Yang perlu diketahui:

- **`entityId` berbeda per `kind`.** `ATTEMPT` → id kunjungan; `PICKUP` dan
  `INSPECTION` → id **baris perangkat** (`DeviceRecoveryItem`), bukan id
  inspeksi. Bukti inspeksi sengaja dijangkarkan ke perangkat karena foto harus
  sudah ada **sebelum** keputusan dibuat.
- **Inspeksi menolak keputusan tanpa foto.** Urutannya wajib: unggah dulu, baru
  simpan keputusan. Kalau tidak, server menolak dengan pesan yang jelas.
- Berkas dibatasi JPG/PNG/WebP/PDF, maksimal 5MB, dan isinya diperiksa — bukan
  cuma ekstensinya. Tampilkan pesan galat dari server apa adanya.
- Koordinat opsional. Yang di luar rentang wajar dan `(0,0)` ditolak, karena
  `(0,0)` adalah keluaran khas GPS yang gagal mengunci.
- `/api/files/<id>` tanpa sesi akan **redirect ke `/login`**, bukan 401. Jadi
  `<img>` yang gagal akan tampil sebagai gambar rusak — pertimbangkan
  `onError` untuk menampilkan placeholder yang jelas.

---

## 7. Yang perlu DIBUAT di frontend

Backend-nya sudah siap semua; yang berikut murni pekerjaan UI.

### 7.1 Kendali checklist inspeksi — ya/tidak, bukan kotak centang

Server sudah menolak checklist yang tidak lengkap atau memuat butir asing.
Tetapi **kotak centang tidak bisa membedakan "dijawab tidak" dari "belum
dijawab"** — keduanya terkirim sebagai `false`.

Untuk pemeriksaan yang menentukan nasib aset, bedanya berarti. Perlu kendali
ya/tidak eksplisit per butir, dan tombol simpan baru aktif setelah semuanya
terjawab.

Daftar butirnya dari `INSPECTION_CHECKLIST` di `@/lib/constants` — jangan
ditulis ulang manual, supaya tidak lepas sinkron dengan validasi server.

### 7.2 Daftar penarikan: penyaringan teknisi & pencarian serial/MAC

Halaman `/inventory/device-recoveries` sekarang hanya menyaring status dan
"terlambat". Perlu ditambah:

- **Penyaringan teknisi.** Teknisi saat ini melihat SELURUH penarikan, padahal
  §9.2 FR-PICK-002 menghendaki dia melihat tugasnya sendiri. Datanya ada di
  `assigneeId`.
- **Pencarian serial/MAC** (FR-UI-001). Ada di `DeviceRecoveryItem.snapshotSerial`
  dan `actualSerial`.

### 7.3 Tombol "Ajukan Terminasi" di Customer 360

FR-TERM-001 menghendaki aksi ini ada di halaman pelanggan. Sekarang riwayat
terminasi sudah tampil di sana, tapi tombol pengajuannya belum — jalur satu-
satunya lewat menu CRM.

Tautkan ke `/crm/terminations/new?subscriptionId=<id>`; halaman itu sudah
menerima parameter tersebut.

### 7.4 Lapisan peta FTTH

Datanya sudah lengkap (§5b); yang kurang lapisan visualnya:

- ikon terpisah untuk POP, MS, dan ODP
- garis rute kabel, dibedakan menurut `routeType`
- pemilih koordinat di peta untuk input manual (klik untuk menaruh titik).
  Form cukup mengirim `latitude`/`longitude`; server sudah memvalidasi
  rentangnya dan menolak `(0,0)` karena itu keluaran khas GPS yang gagal.

### 7.5 Portal teknisi `/portal/recoveries`

Belum ada. Teknisi memakai halaman gudang. Portal Fase 19 sudah ada sebagai
pola yang bisa diikuti.

---

## 9. Data pegawai lengkap (Fase 41) — SIAP

Field baru di `Employee`, semuanya sudah tersimpan lewat `saveEmployeeAction`
yang lama (nama form-nya di bawah). Halaman `/hrd/employees` sudah berfungsi;
yang tersisa untukmu murni tampilan.

| Field | Nama di form | Nilai |
|---|---|---|
| Alamat | `address` | teks bebas, opsional |
| Pola kerja | `workPattern` | `NON_SHIFT` \| `SHIFT` — konstanta `WORK_PATTERNS` |
| Jenjang jabatan | `jobLevel` | `STAFF` \| `LEADER` — konstanta `JOB_LEVELS` |
| Mulai kontrak | `contractStartAt` | `yyyy-mm-dd`, opsional |
| Berakhir kontrak | `contractEndAt` | `yyyy-mm-dd`, **wajib bila `employeeType = CONTRACT`** |

`EMPLOYEE_TYPES` **tidak berubah kodenya**, hanya labelnya kini Indonesia:
`FULL_TIME` → "Karyawan Tetap", `CONTRACT` → "Kontrak",
`PART_TIME` → "Paruh Waktu", `PROBATION` → "Masa Percobaan".

**Empat aturan tampilan yang tolong dipertahankan:**

1. **Blok kontrak muncul dan menghilang** mengikuti `employeeType`, bukan
   sekadar dinonaktifkan. Sudah diterapkan di `employee-form.tsx` (client
   component). Field mati yang tetap terlihat mengundang orang mengisi tanggal
   pada karyawan tetap — dan tanggal itulah yang dipakai penyapu untuk
   membekukan akun.
2. **`jobLevel` ≠ `User.level`.** Jangan pernah memberi keduanya label yang
   sama. Yang kedua sebut "Level Approval".
3. Kontrak yang tinggal < 30 hari diberi penanda peringatan, **bukan** error —
   orangnya masih bekerja normal.
4. Karyawan tetap menampilkan `—` pada kolom kontrak, bukan "aman".

Pembantu siap pakai di `@/lib/employment` (modul murni, aman di client):
`contractPhase()` → `NONE|OK|DUE_SOON|ENDED`, `contractRemainingDays()`,
`accountState()`, `ACCOUNT_STATE_LABELS`, `archiveDueAt()`.

---

## 10. Akun beku (Fase 42) — SIAP

**Beku bukan nonaktif.** Nonaktif untuk akun yang riwayatnya sudah selesai;
beku untuk orang yang berhenti berhak masuk tetapi mungkin kembali. Beku punya
masa tenggang 3 bulan lalu berujung arsip; nonaktif tidak.

| Hal | Kontrak |
|---|---|
| Field | `User.frozenAt`, `User.freezeReason` |
| Action | `freezeUserAction`, `unfreezeUserAction` di `settings/users/actions.ts` — keduanya menuntut field `reason` (min. 3 karakter) |
| Izin | `users.edit` |
| Otomatis | Tugas penjadwal `hrd.contract-lifecycle`, sehari sekali |

Alurnya: peringatan H-30 & H-7 ke pemegang `hrd.manage` **dan atasan
langsungnya** → kontrak lewat → akun beku → 3 bulan → diarsipkan.

**Kosakata yang tolong dipakai konsisten:** label **"Beku"**, jangan
"Nonaktif" — beku itu sementara dan dibalik satu tombol.

- Baris beku **tetap terlihat** di daftar, diberi penanda. Menyembunyikannya
  membuat HRD mengira orangnya sudah hilang.
- Banner detail menyebut **sejak kapan** dan **kapan akan diarsipkan**.
- Yang beku **tidak bisa login sama sekali**, jadi tidak ada tampilan
  "profil beku" yang perlu dibuat.

Pesan login untuk akun beku sudah berbunyi jelas ("Akun Anda dibekukan sejak
… — hubungi HRD atau IT"), dan sengaja hanya muncul **setelah passwordnya
benar**, supaya keadaan akun tidak bocor ke penebak nama pengguna.

---

## 11. Arsip terpadu `/settings/trash` (Fase 47) — SIAP

Halamannya sudah jadi dan berfungsi. Yang mungkin ingin kamu perbaiki hanya
tampilannya.

| Hal | Kontrak |
|---|---|
| Loader | `listArchive({ entityType?, onlyPending? })`, `archivedEntityTypes()` |
| Action | `restoreArchivedAction` |
| Izin | `archive.view` untuk melihat, `archive.restore` untuk memulihkan |
| Pemegang | `super_admin`, `management` (keduanya), `hrd` (hanya lihat) |

**Empat hal yang tolong tidak diubah:**

1. **Alasan tidak pernah kosong.** Kolomnya wajib di basis data, jadi tidak ada
   keadaan "tanpa alasan" yang perlu ditangani UI.
2. **Baris yang sudah dipulihkan TETAP tampil** dengan penanda. Tabelnya
   append-only dan pemulihan itu sendiri bagian dari jejaknya.
3. **Tidak ada tombol "Hapus Permanen"**, dan tidak ada action-nya di backend.
   Kalau ada permintaan menambahkannya, alasannya ada di komentar model
   `ArchivedRecord`.
4. Jenis yang belum punya jalur pemulihan otomatis menampilkan "via modulnya",
   bukan tombol yang menandai pulih tanpa memulihkan apa pun. Cek dengan
   `isRestorable(entityType)`.

**Belum ada di navigasi.** `src/components/nav.tsx` sedang kamu pegang, jadi
saya tidak menyentuhnya — tolong tambahkan sendiri entri `/settings/trash`
(izin `archive.view`) di grup Pengaturan.

---

## 13. Mailserver & label divisi (Fase 43–44) — SIAP

Dua halaman baru, keduanya sudah berfungsi. Yang mungkin ingin kamu perbaiki
hanya tampilannya.

| Halaman | Izin | Isi |
|---|---|---|
| `/it/mailserver` | `integrations.manage` (it_manager) | Setting sambungan + tombol Uji Koneksi |
| `/it/mailboxes` | `access.manage` (it_support & it_manager) | Perbandingan CRM ↔ mailcow + tombol Terapkan |

**Aturan yang tolong tidak dilanggar di `/it/mailserver`:**

- Field `credentialRef` berlabel **"Nama Environment Variable"**, contoh
  `MAILCOW_API_KEY`. **Tidak boleh ada field untuk API key-nya sendiri** —
  `saveIntegration()` menolaknya, tapi jangan sampai UI mengundangnya.
- Tombol Uji Koneksi memeriksa **versi DAN daftar mailbox**. Jangan
  disederhanakan jadi cek versi saja: "terhubung" yang ternyata tidak bisa
  membaca mailbox adalah kabar baik yang menyesatkan.

**Aturan di `/it/mailboxes` — inilah wujud keputusan E2:**

Arah datanya satu: **divisi ditetapkan di CRM, lalu didorong ke mailcow.** Tag
mailcow tidak pernah mengubah divisi di CRM. Alasannya bukan kerapian — divisi
menentukan siapa approver supervisor, jadi tag yang bisa mengubahnya berarti
siapa pun yang bisa mengedit mailbox bisa mengubah siapa yang menyetujui.

- **Divisi CRM dan tag mailcow ditampilkan berdampingan**, jangan digabung
  jadi satu nilai. Yang perlu diputuskan orangnya justru selisihnya.
- Baris berkeadaan `NO_DIVISION_IN_CRM` **tidak punya tombol Terapkan** —
  mendorong "tanpa divisi" akan menghapus tag yang mungkin benar. Yang perlu
  diperbaiki adalah data di CRM.
- Mailbox bersama (`info@`, `billing@`) muncul sebagai "Tanpa akun CRM". Itu
  bukan kesalahan; jangan diberi gaya peringatan.

Keadaan yang mungkin muncul ada di `SYNC_STATE_LABELS` (`@/lib/mailbox-tag`):
`MATCHED`, `TAG_MISMATCH`, `TAG_MISSING`, `TAG_AMBIGUOUS`,
`NO_DIVISION_IN_CRM`, `NO_CRM_ACCOUNT`, `NO_MAILBOX`.

**Belum ada di navigasi.** Sama seperti `/settings/trash` — `nav.tsx` kamu yang
pegang. Tolong tambahkan `/it/mailserver` dan `/it/mailboxes` di grup IT.

---

## 14. Jawaban atas §20 PRD-mu (Fase 48) — SIAP

Dua permintaanmu yang tersisa sudah selesai, plus satu lubang yang ketahuan
sambil mengerjakannya.

### 14.1 Unggah gambar tanda tangan → `attachmentId`

Dua jalur, pilih yang cocok dengan bentuk UI-mu:

**Jalur satu-submit** (form biasa, paling sederhana) — `signPickupAction`
sekarang menerima field `signatureFile` langsung:

```
<form action={signPickupAction} encType="multipart/form-data">
  recoveryId · role (CUSTOMER|TECHNICIAN) · signerName · signatureFile? · origin?
```

**Jalur dua-langkah** (kanvas tanda tangan) — `uploadSignatureAction`, dipakai
dengan `useActionState` karena ia MENGEMBALIKAN nilai alih-alih mengalihkan
halaman; redirect akan membuang kanvas yang baru digambar:

```ts
const [state, action] = useActionState(uploadSignatureAction, null);
// state: { ok: true, attachmentId } | { ok: false, error } | null
// field: recoveryId, signatureFile
```
Lalu kirim `attachmentId` itu ke `signPickupAction`.

**Gambar tetap OPSIONAL — jangan dijadikan wajib di UI.** Nama penanda tangan
satu-satunya yang wajib, karena itulah yang masih terbaca bertahun-tahun
kemudian saat berkas gambarnya sudah tidak bisa dibuka. Kalau nanti diputuskan
gambar wajib secara hukum, itu keputusan PO — bukan default.

Berkasnya disajikan lewat `/api/files/<attachmentId>` seperti bukti foto, dan
sudah didaftarkan di daftar-putih izin (entityType `DeviceRecoverySignature`).
PNG/JPG, maksimal 5MB — batas mesin lampiran yang lama.

### 14.2 Redirect kembali ke portal teknisi

Setiap aksi penarikan sekarang menerima field opsional **`origin`**:

| Nilai | Kembali ke |
|---|---|
| `portal` | `/portal/recoveries/<id>` |
| `backoffice` atau kosong | `/inventory/device-recoveries/<id>` (perilaku lama) |

```html
<input type="hidden" name="origin" value="portal" />
```

**Yang dikirim adalah TOKEN, bukan URL — tolong jangan diubah jadi URL.**
Alamatnya disusun di server dari daftar tertutup di `src/lib/recovery-origin.ts`.
Menerima URL dari form akan membuka celah open redirect: satu tautan
bertuliskan `?origin=https://situs-palsu` sudah cukup untuk melempar teknisi ke
halaman login tiruan sambil terlihat berasal dari CRM.

Berlaku untuk semua aksi: assign, recordAttempt, pickup, confirmDisconnect,
receive, inspect, markNotReturned, attachEvidence, signPickup.

### 14.3 Cakupan teknisi kini juga tegak di jalur TULIS

Ini bukan permintaanmu, tapi kamu perlu tahu karena mengubah perilaku.

Fase 40 menutup jalur baca. Jalur tulis ternyata masih terbuka: memegang
`device_recovery.pickup` sudah cukup untuk mencatat kunjungan, menarik
perangkat, **memutus port ODP**, membubuhkan tanda tangan, dan melampirkan
bukti pada penarikan milik teknisi lain — hanya dengan tahu id-nya.

Sekarang semuanya ditolak dengan pesan yang sama persis dengan "tidak
ditemukan", supaya penebak id tidak bisa memastikan penarikan itu ada.

**Untuk UI-mu:** tidak ada perubahan kontrak. Tapi kalau kamu sedang menguji
portal dengan akun teknisi yang bukan pemilik tugasnya, aksinya kini akan
gagal — itu perilaku yang benar, bukan bug. Koordinator, gudang, dan
management tidak terpengaruh sama sekali.

---

## 15. Identitas terpusat aktif (Fase 45) — SIAP & SUDAH JALAN

Login lewat Authentik sudah bekerja sungguhan di `auth.perumnet.id`. Yang
berubah untukmu **hanya satu nilai**, dan kontraknya tidak bergeser sama sekali.

`view.auth.provider` sekarang bisa bernilai **`"OIDC"`**, selain `LOCAL` dan
`MAILSERVER` yang sudah ada. Perlakukan `OIDC` **sama persis seperti
`MAILSERVER`**: kredensialnya bukan milik CRM, jadi `passwordChangeAvailable`
bernilai `false` dan form ganti password disembunyikan.

Ini sekaligus menutup pertanyaan terbuka di §4 — sekarang nilainya benar-benar
mencerminkan keadaan, bukan lagi `LOCAL` yang bertentangan dengan teks
"identitas terpusat" di halaman profil.

**Halaman masuk** (`/login`) sudah saya sesuaikan:

- Tombol **"Masuk dengan Akun PerumNet"** muncul bila konfigurasi OIDC lengkap
- **Form password TETAP ditampilkan di bawahnya**, dengan keterangan
  "Password di bawah hanya untuk akun darurat"

Tolong **jangan sembunyikan form password itu** saat OIDC aktif. Itu bukan sisa
yang terlupakan — itulah satu-satunya jalan masuk saat Authentik mati, dan
menyembunyikannya berarti tidak ada seorang pun bisa masuk untuk memperbaiki
keadaan.

**Akun darurat** dikelola di `/settings/users/[id]`, kartu "Akun Darurat",
izin `users.create`. Kartunya sudah ada dan berfungsi; kalau mau kamu rapikan
tampilannya, dua hal yang tolong dipertahankan: lencana **AKTIF** saat menyala,
dan kolom **Alasan** tetap wajib.

Tidak ada DTO, action, atau endpoint lain yang berubah.

---

## 16. Tiga dependency dari PRD §24–25 — SIAP

Ketiganya kamu catat sebagai menunggu backend. Sudah ada sekarang.

### 16.1 `profileView` membawa field kepegawaian Fase 41

`view.employee` bertambah lima field. Kamu **tidak perlu** query langsung —
memang itu yang benar, dan terima kasih sudah menahan diri.

```ts
address         : string | null
workPattern     : string        // "SHIFT" | "NON_SHIFT"
jobLevel        : string        // "STAFF" | "LEADER"
contractStartAt : string | null // ISO
contractEndAt   : string | null // ISO
```

- `workPattern` dan `jobLevel` **selalu terisi** (bawaannya `NON_SHIFT` /
  `STAFF`), jadi tidak perlu menangani `undefined`.
- Tanggal kontrak `null` untuk yang bukan karyawan kontrak. Tidak ada keadaan
  "kontrak tanpa tanggal" — itu ditolak saat penyimpanan.
- Semuanya **hanya baca** di halaman profil. Mengubah data kepegawaian tetap
  lewat modul HRD dengan izinnya sendiri; `updateContactAction` tetap hanya
  menerima nama dan telepon.

### 16.2 `listArchive` menerima rentang tanggal

```ts
listArchive({ entityType?, onlyPending?, from?: Date, to?: Date, take? })
```

**Batas atas sudah inklusif sampai akhir hari** — kamu cukup mengoper tanggal
polos dari `<input type="date">`. Baris yang diarsipkan pukul 17.45 pada
tanggal batas tetap ikut terjaring. Penggeseran itu dilakukan di loader, bukan
diserahkan ke UI untuk diingat.

Tanggal tidak valid (input kosong → `new Date("")`) diabaikan, bukan membuat
query rusak.

### 16.3 Gambar tanda tangan dokumen gudang

```
action: attachSignatureImageAction   (inventory/transactions/actions.ts)
field : txId, docType, docId, role, file
form  : encType="multipart/form-data"
```

`docType` yang diterima: `IRF`, `DO`, `RECEIPT`. Jenis lain ditolak.

**Baris tanda tangannya harus sudah ada.** Action ini melampirkan gambar pada
tanda tangan yang memang sudah dibubuhkan seseorang — ia tidak menciptakan
tanda tangan dari sebuah berkas. Kalau `role` itu belum ditandatangani,
jawabannya "Tanda tangan belum dibubuhkan — isi nama penanda tangannya lebih
dulu". Nama tetap yang wajib; gambar pelengkap.

`attachmentId` **ditautkan otomatis** ke barisnya, jadi tidak ada langkah kedua
yang bisa terlupakan. Untuk halaman cetak, `documentSignatures(docType, docId)`
mengembalikan role, nama, waktu, dan `attachmentId` sekaligus.

Gambarnya disajikan lewat `/api/files/<attachmentId>` seperti lampiran lain,
sudah terdaftar di daftar-putih izin.

---

## 17. Sinkronisasi divisi → grup Authentik (Fase 46) — PERLU HALAMAN

Mesinnya sudah jadi dan teruji. **Halamannya belum ada, dan itu bagianmu** —
`/it/identity-groups` masih 404, jadi ketiga action di bawah mengalihkan ke
halaman yang belum ada sampai kamu membuatnya.

Fitur ini juga masih menunggu **API token Authentik** dari PO. Sampai token itu
diisi, loader mengembalikan `error` yang menjelaskan sebabnya — bukan gagal.

**Rute:** `/it/identity-groups` · **Izin:** `integrations.manage` (it_manager)

### Loader

```ts
import { previewGroupSync, loadAuthentikIntegration, authentikBlocker } from "@/lib/identity-groups";

const cfg  = await loadAuthentikIntegration();   // AuthentikConfig | null
const stop = authentikBlocker(cfg);              // string | null — alasan belum siap
const view = await previewGroupSync();           // { plan, divisionNames, error }
```

`previewGroupSync()` **hanya membaca**. Tidak ada perubahan yang diterapkan —
di CRM maupun di Authentik — sampai tombol Terapkan ditekan.

### Bentuk `plan`

```ts
groupsToCreate : string[]          // grup yang belum ada di Authentik
changes        : GroupChange[]     // { groupName, divisionCode, groupPk, add[], remove[] }
warnings       : SyncWarning[]
totalAdd       : number
totalRemove    : number
```

`SyncWarning` punya tiga bentuk, labelnya di `WARNING_LABELS`:

| `kind` | Artinya |
|---|---|
| `NO_IDP_USER` | Akun CRM berdivisi tetapi belum punya pengguna Authentik |
| `UNKNOWN_MEMBER` | Anggota grup CRM yang bukan orang CRM — **dilaporkan, tidak dikeluarkan** |
| `NO_DIVISION` | Akun CRM belum berdivisi |

### Actions

```
saveAuthentikAction   field: baseUrl?, credentialRef, isEnabled, notes
testAuthentikAction   tanpa field
applyGroupSyncAction  tanpa field
```

### Empat hal yang tolong dipertahankan di UI

1. **Jumlah `remove` ditampilkan menonjol, terpisah dari `add`.** Mengeluarkan
   orang dari grup berarti mencabut aksesnya ke aplikasi yang bersandar pada
   grup itu. Angka itu yang paling perlu dilihat sebelum menekan Terapkan.

2. **`UNKNOWN_MEMBER` jangan ditampilkan sebagai kesalahan.** Akun layanan,
   admin IdP, dan konsultan luar memang boleh ada di grup itu. Backend sengaja
   tidak pernah mengeluarkannya; UI cukup memberitahu bahwa mereka ada.

3. **Tidak ada field untuk token API.** Sama seperti `/it/mailserver`: kolomnya
   berlabel "Nama Environment Variable", contoh `AUTHENTIK_API_TOKEN`. Kalau
   nanti ada permintaan menambahkan field tokennya sendiri, tolak.

4. **Tombol Terapkan tidak mengirim rencana.** `applyGroupSyncAction` menghitung
   ulang rencananya di server. Rencana yang dikirim dari peramban bisa sudah
   basi, dan menerapkan rencana basi berarti mengeluarkan orang berdasarkan
   keadaan yang sudah tidak berlaku.

Arahnya satu — divisi CRM → grup Authentik. Tidak ada fungsi di backend yang
menulis `User.divisionId` dari grup, sama seperti tag mailcow pada Fase 44.

---

## 18. Kartu pegawai & foto resmi (Fase 49) — PERLU HALAMAN

Mesinnya jadi dan teruji. **Halamannya bagianmu.** Semua ditempelkan ke
`/hrd/employees/[id]` yang sudah kamu buat.

**Keputusan produk yang sudah diambil:** foto resmi diunggah **HRD**, jadi
seluruh pengelolaan kartu memakai `hrd.manage`. Kartu adalah dokumen
kepegawaian, bukan perangkat IT.

### Loader

```ts
import { loadEmployeeCards, cardQrSvg } from "@/lib/employee-card-service";
import { cardInvalidReason, CARD_STATUS_LABELS } from "@/lib/employee-card";

const cards = await loadEmployeeCards(employeeId);
const svg   = await cardQrSvg(process.env.APP_URL!, card.publicToken); // string SVG siap ditempel
```

`cardQrSvg` mengembalikan **string SVG**, bukan gambar — tempel langsung ke
markup halaman cetak. Tidak perlu canvas, tidak perlu berkas.

### Actions (semua di `hrd/actions.ts`)

```
uploadEmployeePhotoAction  employeeId, photo          (multipart/form-data)
issueCardAction            employeeId, expiresAt?, nfcUid?
replaceCardAction          employeeId, cardId, reason, expiresAt?, nfcUid?
markCardLostAction         employeeId, cardId, reason
revokeCardAction           employeeId, cardId, reason
```

Semua yang mengubah status **mewajibkan `reason`** minimal 3 karakter.

### Lima hal yang tolong dipertahankan

1. **Tombol "Terbitkan kartu" tidak muncul bila sudah ada kartu berlaku.**
   Backend menolaknya, tetapi UI sebaiknya mengarahkan ke "Ganti kartu" —
   dua kartu fisik berlaku bersamaan adalah keadaan yang tidak boleh dicapai,
   dan yang satu ada di tangan entah siapa.

2. **Kartu lama tetap tampil di riwayat** dengan statusnya. Jangan
   disembunyikan setelah diganti — riwayat siapa memegang kartu apa itu
   gunanya.

3. **Status ditampilkan lewat `CARD_STATUS_LABELS`**, dan sebab tidak
   berlakunya lewat `cardInvalidReason()`. Sebabnya bisa datang dari luar
   kartu itu sendiri: **akun beku (Fase 42) dan akun diarsipkan (Fase 47)
   otomatis mematikan kartu.** Tampilkan alasannya apa adanya — "Kartu
   berstatus Berlaku" yang ternyata mati karena akunnya beku akan sangat
   membingungkan.

4. **QR berisi ALAMAT halaman verifikasi**, bukan data pegawai. Jangan pernah
   membuat QR dari NIK atau nama. Kartu dipakai di tempat umum sepanjang hari;
   anggap isinya akan dipindai orang asing.

5. **`nfcUid` boleh dikosongkan.** Kartu NFC belum dibeli, dan kartu ber-QR
   sudah berguna sendiri tanpa itu.

### Yang BELUM ada — Fase 50

Halaman verifikasi publik `/verify/<token>` belum dibuat. `verifyCardToken()`
sudah siap dan sudah menyaring isinya (hanya nama, jabatan, foto, nomor kartu
— dan **tidak ada apa pun** bila kartunya tidak berlaku). Tapi halaman itu
harus **tanpa login**, dan foto pegawai saat ini berizin `hrd.view` — jadi
jalur penyajian fotonya perlu dibuat sadar, bukan sekadar melonggarkan izin
di `/api/files`. Catatannya sudah ditulis di berkas rute itu.

---

## 19. Impor pegawai dari Excel (Fase 51) — PERLU HALAMAN

Mesinnya siap dan teruji ujung ke ujung. Yang belum ada halamannya.

```ts
import {
  previewEmployeeImportAction,
  applyEmployeeImportAction,
} from "@/app/(app)/hrd/actions";
// Tipe diimpor dari lib-nya, BUKAN dari actions.ts — modul "use server"
// hanya boleh mengekspor fungsi async.
import type { ImportPlan, PlanRow } from "@/lib/employee-import-service";
import type { RowIssue } from "@/lib/employee-import";
```

Keduanya menerima `FormData` berisi satu field `file`, dan **mengembalikan
nilai** (bukan redirect):

```ts
{ ok: true; data: ImportPlan }        // pratinjau
{ ok: true; data: ImportOutcome }     // penerapan
{ ok: false; error: string }
```

```ts
interface ImportPlan {
  ok: boolean;          // false = ADA masalah, tombol "Terapkan" harus mati
  rows: PlanRow[];      // { rowNumber, fullName, employeeNo, action, reason, notes }
  issues: RowIssue[];   // { rowNumber, column, message } — `column` = judul kolom di Excel
  blankRows: number;    // baris kosong template, aman diabaikan
  willCreate: number;
  willSkip: number;
}
interface ImportOutcome {
  created: { rowNumber: number; employeeNo: string; fullName: string }[];
  skipped: number;
}
```

**Alur halamannya:**

1. Satu `<input type="file" accept=".xlsx">`, ditahan di state klien.
2. Kirim ke `previewEmployeeImportAction` → tampilkan tabel `rows`
   (`CREATE` / `SKIP` + `reason`) dan daftar `issues`.
3. Tombol **Terapkan** hanya hidup bila `plan.ok === true`.
4. Kirim **berkas yang sama** ke `applyEmployeeImportAction`.

### Lima hal yang menentukan bentuk halamannya

1. **Penerapan menerima BERKAS, bukan hasil pratinjau.** Ia membaca ulang dan
   memvalidasi ulang dari nol. Jadi berkasnya harus tetap dipegang di state
   klien sampai HRD menekan Terapkan — jangan kirimkan `plan` kembali ke
   server, tidak ada jalur yang menerimanya (dan itu disengaja: kalau ada,
   siapa pun yang bisa memanggil server action bisa melewati seluruh
   pemeriksaan).

2. **Semua atau tidak sama sekali.** Satu baris bermasalah menahan seluruh
   berkas. Tampilkan `issues` dengan `rowNumber` dan `column` apa adanya —
   keduanya menunjuk sel yang persis di Excel, jadi HRD bisa langsung
   memperbaikinya di sana.

3. **`notes` bukan penghalang.** Isinya hal seperti "akun CRM belum ada".
   Tampilkan beda dari `issues` — kalau disamakan, HRD akan mengira impornya
   gagal padahal tidak.

4. **`action: "SKIP"` bukan kegagalan.** Itu orang yang sudah terdaftar.
   Impor ini **hanya membuat, tidak pernah mengubah** data yang sudah ada.

5. **`employeeNo` kosong di pratinjau adalah normal** — NIK diterbitkan saat
   penerapan. Nomor yang benar-benar terbit ada di `ImportOutcome.created`;
   itu layak ditampilkan sesudahnya karena HRD memang membutuhkannya untuk
   mengisi kolom "NIK Atasan" pada impor berikutnya.

### Yang sengaja TIDAK dilakukan

Berkasnya **tidak disimpan** sebagai lampiran. Mesin lampiran hanya menerima
gambar dan PDF; melonggarkannya demi impor ini akan melonggarkannya untuk
seluruh lampiran di aplikasi. Jejaknya ada di AuditLog (`EMPLOYEE_IMPORT`).

---

## 20. Akun CRM massal dari kotak surat (Fase 52) — PERLU HALAMAN

Latar belakangnya: ada 32 kotak surat di mailcow dan nyaris tidak ada akun CRM.
Mengetiknya satu per satu berarti 32 kali mengetik alamat email — dan salah
ketik alamat adalah penyebab gagal nomor satu pada sinkronisasi mailbox, karena
alamat itulah satu-satunya kunci pencocokan.

```ts
import {
  listAccountCandidatesAction,
  createAccountsAction,
} from "@/app/(app)/it/mailserver/actions";
import type {
  AccountCandidate,
  CandidateList,
  NewAccountInput,
} from "@/lib/account-provision-service";
```

`listAccountCandidatesAction()` tanpa argumen → `{ ok: true, data: CandidateList }`.
`createAccountsAction(inputs: NewAccountInput[])` → `{ ok: true, data: { created } }`.

```ts
interface CandidateList {
  candidates: AccountCandidate[];
  alreadyHaveAccount: number;          // sudah punya akun, tidak ditampilkan
  divisions: { id; code; name }[];     // untuk dropdown
  roles: { id; code; name }[];         // untuk dropdown
}

interface AccountCandidate {
  email: string;
  suggestedName: string;               // "wayan_budiarta" → "Wayan Budiarta"
  username: string;                    // DIJAMIN belum dipakai
  likelyShared: boolean;               // dugaan: alamat fungsi, bukan orang
  sharedReason: string | null;         // KENAPA diduga begitu
  employee: { id; employeeNo; fullName; jobTitle; divisionId; divisionName } | null;
  suggestedDivisionId: string | null;  // dari data HRD
  suggestedSelected: boolean;          // usulan centang awal
}
```

Izinnya **`users.create`**, bukan `access.manage` seperti aksi tag. Membuat
akun memberi jalan masuk ke sistem; menempelkan label divisi tidak.

### Enam hal yang menentukan bentuk halamannya

1. **`likelyShared` adalah USULAN, bukan penyaring.** Alamat fungsi
   (`helpdesk@`, `no-reply@`) tetap **ditampilkan**, hanya tidak tercentang.
   Jangan disembunyikan: kalau suatu hari ada karyawan beralamat `sales@`, ia
   akan lenyap dari daftar tanpa ada yang tahu.

2. **Tampilkan `sharedReason` di sebelah centangnya.** IT harus bisa *menilai*
   dugaan itu, bukan disuruh percaya. Satu baris kecil sudah cukup.

3. **Peran wajib dipilih — jangan beri nilai bawaan di UI.** Server menolak
   `roleIds` kosong. Peran adalah kewenangan sebenarnya; nilai bawaan berarti
   32 akun terbit dengan hak akses yang tidak pernah diputuskan siapa pun.
   Pengaturan borongan ("terapkan peran ini ke semua yang tercentang") boleh —
   asal IT yang memilihnya.

4. **`employee` bernilai `null` itu wajar**, bukan error. Artinya tidak ada
   pegawai yang namanya cocok **persis**. Pencocokan sebagian sengaja tidak
   dilakukan — "Budi Prabhawa" bukan "Budi Dharma Prabhawa". Nama kembar juga
   menghasilkan `null`, dan itu disengaja.

5. **Staff dan Supervisor wajib punya divisi**, Owner tidak. Aturan yang sama
   dengan form pembuatan user satuan.

6. **Semua atau tidak sama sekali.** Satu baris bermasalah menahan seluruh
   pilihan. Tampilkan `error` apa adanya — isinya sudah menyebut alamat mana
   yang bermasalah.

### Yang sengaja TIDAK dilakukan

**Tidak ada pembuatan otomatis.** Kotak surat tidak pernah berubah menjadi akun
dengan sendirinya. Kalau bisa, siapa pun yang mampu membuat kotak surat mampu
membuat akun di CRM — mailserver jadi pintu masuk. Batas yang sama dengan tag
divisi.

**Divisi diusulkan dari data HRD, bukan dari tag mailcow.** Membacanya dari
mailcow akan membalik arah otoritas: pengedit tag ikut menentukan divisi, dan
divisi menentukan grup Authentik serta akses ke aplikasi lain.

**Password tidak pernah ditampilkan.** Akun dibuat dengan password acak dan
`mustChangePassword`. Login memakai Authentik, jadi nilai itu memang tidak
dipakai — jangan tampilkan kolom password apa pun di halaman ini.

---

## 21. ⚠️ Dua tempat yang perlu kamu perbaiki — akibat perubahanku

Maaf, ini kesalahanku: `JOB_LEVELS` bertambah dari dua nilai menjadi **empat**
(`STAFF`, `LEADER`, `SUPERVISOR`, `CEO`), karena data HRD yang asli memang
memakai keempatnya. Dua tempat di frontend menganggapnya masih dua, dan
sekarang menampilkan yang salah — **tanpa error apa pun**.

Aku tidak menyentuhnya karena keduanya wilayahmu, dan salah satunya sedang
kamu ubah.

**1. `src/app/(app)/hrd/employees/page.tsx:166`**

```tsx
{e.jobLevel === "LEADER" ? "Leader" : "Staff"}
```

Supervisor dan CEO ikut tampil sebagai **"Staff"**. Dari 23 pegawai yang baru
masuk, **5 orang salah tampil** (3 Supervisor + 2 CEO).

Sudah ada pemetaan siap pakai, dipakai di halaman detail sebelahnya:

```tsx
const jobLevelLabels = Object.fromEntries(JOB_LEVELS) as Record<string, string>;
// ...
{jobLevelLabels[e.jobLevel] ?? e.jobLevel}
```

**2. `src/app/(app)/profile/page.tsx:25`** — `jobLevelLabels` di situ ditulis
tangan dan hanya memuat dua nilai. Ganti dengan `Object.fromEntries(JOB_LEVELS)`
supaya nilai baru berikutnya tidak perlu diingat lagi.

Pola `?? nilai mentah` itu yang membuat kesalahan ini kelihatan, bukan diam:
kalau suatu nilai belum punya label, yang tampil kodenya — jelek, tapi jujur.

---

## 22. Halaman login — Authentik turun jadi pilihan kedua (Fase 53)

> ### ⚠️ DIPERBARUI — sebagian besar sudah beres sendiri, JANGAN dikerjakan ulang
>
> `AUTH_PROVIDER` sudah diubah ke `MAILSERVER` dan sudah diverifikasi di
> peramban: halaman login kini **hanya** menampilkan email + password + tombol
> Masuk. Tombol Authentik dan tulisan *"Password di bawah hanya untuk akun
> darurat"* **hilang sendiri**, karena blok itu memang bersyarat
> `oidcAvailable` — yang hanya menyala saat `AUTH_PROVIDER === "OIDC"`.
>
> Dan itu **lebih benar** daripada permintaan asli "kecilkan tombolnya":
> tombol yang tetap tampil di mode MAILSERVER hanya akan mengantar orang ke
> error, sebab jalur `/api/auth/oidc/start` memang menolak saat modenya bukan
> OIDC.
>
> **Yang tersisa untukmu cuma satu, dan kecil:** label `Username atau Email`
> sebaiknya menyebut email lebih dulu — yang dipakai mencocokkan ke mailserver
> adalah **alamat email**, dan sekarang semua orang memakai alamat emailnya.
>
> Sisa bagian di bawah dibiarkan sebagai rekaman alasannya. Tidak perlu
> dikerjakan.

**Keputusan PO:** PerumNet fokus ke mailcow dulu. Authentik **tidak dibongkar**,
hanya disimpan — jadi jangan hapus jalurnya, cukup kecilkan.

`AUTH_PROVIDER` sekarang bernilai `MAILSERVER`. Orang login dengan **alamat
email dan password email**-nya; CRM menanyakannya ke mailserver.

### Yang berubah di `src/app/login/page.tsx`

Sekarang blok OIDC tampil sebagai **tombol utama selebar penuh** dengan form
password di bawahnya dan tulisan *"Password di bawah hanya untuk akun darurat."*
Itu terbalik dari keadaan sekarang.

Yang diminta:

1. **Form email + password jadi yang utama.** Itu jalur semua orang sekarang,
   bukan jalur darurat.
2. **Tombol Authentik dikecilkan** — tautan teks kecil, ditaruh di pojok atau
   di bawah form, bukan `btn-primary w-full`.
3. **Hapus tulisan "Password di bawah hanya untuk akun darurat."** Sekarang
   justru sebaliknya, dan kalimat itu akan membuat orang ragu memakai jalur
   yang benar.
4. Label "Username atau Email" sebaiknya menyebut email lebih dulu — yang
   dipakai untuk mencocokkan ke mailserver adalah **alamat email**.

### Yang JANGAN dilakukan

**Jangan hapus tautan `/api/auth/oidc/start`.** Mesin Authentik masih utuh dan
teruji; menghidupkannya kembali nanti cukup dengan mengubah satu variabel
environment. Menghapus tombolnya berarti membangun ulang saat dibutuhkan.

**Jangan sembunyikan tombol Authentik sepenuhnya**, sekalipun kecil. Ia tetap
jalan masuk yang sah bagi akun yang sudah tertaut.

**Kondisinya jangan diubah.** `oidcAvailable` sudah benar — ia menyala hanya
bila konfigurasi OIDC lengkap. Di mode `MAILSERVER` ia akan mati sendiri kalau
`AUTH_PROVIDER` bukan `OIDC`, jadi tidak perlu logika tambahan.

### Yang tidak perlu kamu urus

Pesan galat sudah dibedakan di backend: "Username atau password salah" untuk
password yang memang salah, dan pesan tersendiri saat **mailserver-nya yang
tidak terjawab** — supaya orang tidak mereset password email yang sebenarnya
tidak bermasalah. Tampilkan `error` apa adanya.

---

## 23. "Lupa password" di halaman login (Fase 55) — PERLU DIBUAT

**Baca dulu bagian ini sebelum membuat apa pun — bentuknya BUKAN formulir reset
password biasa, dan kalau dibuat begitu ia tidak akan pernah bisa bekerja.**

### Kenapa bukan reset biasa

`AUTH_PROVIDER` sekarang `MAILSERVER`: password CRM **adalah** password email.
Alur reset yang normal mengirim tautan ke kotak surat — kotak surat yang justru
sedang tidak bisa dibuka orangnya. Berputar, tidak ada ujungnya.

Jadi yang dibuat adalah **formulir permintaan**, bukan formulir reset. Tidak ada
tautan, tidak ada halaman "pasang password baru", tidak ada token.

### Kontrak

```ts
import { requestRecoveryAction } from "@/app/login/recovery-actions";
// field: email      → { ok: true, message: string }
```

Aksinya bisa dipanggil **tanpa login** — memang harus, sebab yang memakainya
orang yang tidak bisa masuk.

### Bentuk yang diminta

1. Tautan kecil **"Lupa password?"** di bawah form masuk.
2. Membukanya menampilkan satu kotak isian **alamat email** + tombol kirim.
3. Setelah dikirim, tampilkan `message` **apa adanya**.

### Empat hal yang menentukan, dan jangan diubah

1. **Tampilkan `message` apa adanya, jangan dikarang ulang.** Kalimatnya sama
   persis baik alamatnya terdaftar maupun tidak — itu disengaja. Membedakan
   keduanya menjadikan formulir ini alat memeriksa siapa saja yang bekerja di
   PerumNet.

2. **`ok` selalu `true`.** Tidak ada jalur gagal yang perlu kamu tangani. Kalau
   UI menampilkan "email tidak ditemukan", justru itu yang membocorkan.

3. **Jangan tambahkan penghitung mundur atau pesan "tunggu 15 menit".** Jeda
   memang ada di server, tapi menampilkannya ikut membocorkan apakah permintaan
   sebelumnya diproses.

4. **Jangan otomatis mengisi alamatnya dari kolom login.** Biarkan orang
   mengetiknya sendiri — itu satu kesempatan lagi untuk menyadari kalau selama
   ini ia salah ketik alamat.

### Yang terjadi di belakang (tidak perlu kamu urus)

Tim IT menerima pemberitahuan dalam aplikasi **dan** email berisi rincian
pemohon beserta langkah pemastian identitas. Pemohon juga dikirimi email —
bukan sebagai alat pemulihan, melainkan supaya kalau **orang lain** yang
mengajukan atas namanya, ia melihatnya dari perangkat yang masih tersambung.

Tidak ada kata sandi yang berubah otomatis. Reset tetap dilakukan IT.

---

## 24. Verifikasi kartu publik (Fase 50) — SUDAH JADI, silakan dipoles

Halaman `/verify/[token]` dan jalur fotonya sudah dibuat dan sudah diuji hidup
tanpa login. Aku membuatnya sendiri karena ia berdiri di luar app shell — tidak
menyentuh nav, layout, maupun `globals.css`, dan hanya memakai kelas yang sudah
ada (`card`, palet slate/emerald/rose).

**Silakan dipoles kalau kurang pas.** Yang JANGAN diubah cuma tiga hal, dan
ketiganya soal apa yang tidak boleh bocor:

1. **Jangan tampilkan apa pun selain nama, jabatan, foto, nomor kartu.**
   Kartu dipakai di tempat umum sepanjang hari; anggap semua yang bisa dipindai
   akan dilihat orang asing. NIK, divisi, telepon, email — tidak satu pun.

2. **Kartu tidak berlaku TIDAK boleh menampilkan nama maupun foto.** Backend
   sudah mengosongkannya, jadi jangan menambah fallback yang mengisinya lagi
   dari sumber lain.

3. **Foto memakai `hasil.photoUrl` apa adanya.** Ia menunjuk
   `/api/verify/<token>/photo` — jalur publik berkunci token. JANGAN
   diganti ke `/api/files/<id>`: itu butuh login, dan melonggarkannya akan
   melonggarkan seluruh lampiran aplikasi (bukti pekerjaan, tanda tangan,
   faktur).

Halaman kartu tidak berlaku sengaja memuat peringatan agar pelanggan tidak
memberi akses dan menghubungi PerumNet lewat nomor yang sudah dia kenal —
bukan nomor yang diberikan orang yang membawa kartu itu. Kalimat itu sebaiknya
tetap ada.

---

## 12. Catatan kerja bersama

**Direktori build sudah bisa dipisah.** Jalankan dev/build dengan
`NEXT_DIST_DIR=.next-luna` supaya `.next` tidak lagi diperebutkan dua proses.
Bawaannya tetap `.next`, jadi tidak wajib. Malam ini `.next` sempat dua kali
tertimpa dan gejalanya menyesatkan — `Cannot find module './5611.js'` sama
sekali tidak menunjuk penyebabnya.

**Setelah ganti branch, jalankan `npx prisma generate`.** Klien Prisma yang
tertinggal dari branch lain menghasilkan galat seperti
`column "sessionEpoch" does not exist` — terlihat seperti masalah database,
padahal cuma klien yang basi.

**Working directory masih dipakai bersama.** Selama itu, hindari `git add -A`
dan `git checkout -- .`; keduanya bisa menyapu pekerjaan yang belum tersimpan
milik proses lain. `git worktree` per pengguna menyelesaikannya untuk seterusnya.

**Menjalankan tes:**

```bash
npm test                 # unit, tanpa database
npm run test:integration # butuh database tes terpisah
npm run test:all         # keduanya
```

---

# Untuk Luna — pembagian peran resmi & rencana folder payung

**Ditulis 2026-08-13 oleh Opus, atas permintaan pemilik proyek.**

## Peran sudah ditetapkan

| | Luna (OpenCode) | Opus (Claude Code) |
|---|---|---|
| | **FRONTEND** | **BACKEND · SERVER · DATABASE** |

Aturan lengkapnya di **`docs/WORKFLOW-TIM.md`** — tolong dibaca sekali, isinya
pendek. Ringkasnya:

- **Wilayahmu:** `src/app/**/page.tsx` (tampilan), `src/components/**`,
  `globals.css`, `tailwind.config.ts`. Aku tidak akan menyentuhnya. Kalau
  sebuah fase butuh perubahan tampilan, aku tulis permintaannya, tidak
  kukerjakan sendiri.
- **Wilayahku:** `prisma/schema.prisma`, `src/lib/*.ts`, isi `actions.ts`,
  worker, deploy. Kalau sebuah layar butuh data atau perilaku yang belum ada,
  tulis di **`docs/PERMINTAAN-FRONTEND-KE-BACKEND.md`** — file baru, kanal
  balik dari dokumen ini. Jangan diakali di sisi klien: validasi di form itu
  kenyamanan, penegakannya tetap di service layer.
- Halaman baru yang kubuat **hanya memakai kelas design system yang sudah
  ada**, tidak menciptakan gaya baru, dan entri nav ditambahkan tanpa menata
  ulang yang sudah ada.

## Aturan yang sama sekarang berlaku di semua app PerumNet

Bukan cuma CRM. `docs/WORKFLOW-TIM.md` (atau `AGENTS.md`) yang isinya sama
sudah dipasang di **Monitoring NOC**, **Enterprise**, dan **Captive Portal**,
disesuaikan dengan stack masing-masing. Jadi pindah aplikasi tidak berarti
pindah kebiasaan.

Peta lengkapnya ada di §6 `docs/WORKFLOW-TIM.md`. Satu hal yang perlu kamu
tahu: **`PRTG PerumNet` sudah usang** — commit HEAD-nya ada di dalam riwayat
Monitoring NOC yang lanjut sampai Phase 8. Kalau ada yang menyuruh mengerjakan
"PRTG", yang dimaksud hampir pasti Monitoring NOC.

## Rencana folder payung — BELUM dieksekusi

Ada rencana memindahkan kelima folder app ke dalam satu folder payung
`Dev Project/APP-Perumnet/`. **Belum dijalankan dan belum diputuskan.**

Yang perlu kamu waspadai kalau nanti jadi:

- Pemindahan pakai `mv`, jadi berkasmu yang belum di-commit **ikut pindah
  utuh** — ini beda total dengan `git reset --hard` yang dulu menghapus 13
  berkasmu.
- Tapi kalau kamu sedang menulis saat foldernya berpindah, tulisanmu nyasar ke
  path lama. **Aku tidak akan menjalankan pemindahan selama OpenCode terbuka.**
- Jangan memindahkan folder sendiri.

## Catatan keadaan (13 Agustus)

Worker MikroTik sudah menarik **1.714 sesi PPPoE** (1.586 online), tapi
**0 tertaut ke langganan** karena tabel `Subscription` masih kosong. Jadi kalau
kamu mengerjakan layar yang menampilkan status PPPoE per pelanggan, datanya
memang akan kosong sekarang — bukan bug di sisimu.
