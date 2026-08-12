# Handoff Backend → Frontend (Luna)

**Tanggal:** 2026-08-12 (diperbarui setelah Fase 45 — identitas terpusat aktif)
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
