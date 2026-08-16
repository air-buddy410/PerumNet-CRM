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
| 7 | Checklist inspeksi ya/tidak | — | ✅ **sudah kamu buat** |
| 8 | Penyaringan teknisi & pencarian serial di daftar penarikan | — | ✅ **sudah kamu buat** |
| 9 | Tombol "Ajukan Terminasi" di Customer 360 | — | ✅ **sudah kamu buat** |
| 10 | Portal teknisi `/portal/recoveries` | — | ✅ **sudah kamu buat** (commit fe7b4a3) — pemagarannya sudah kuperiksa, benar |
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

> **Catatan: EMPAT baris di tabel ini sudah kamu selesaikan** — checklist
> inspeksi (#7), filter teknisi & cari serial (#8), tombol "Ajukan Terminasi"
> (#9), dan portal teknisi (#10). Semuanya diperiksa langsung ke kode, bukan ke
> dokumen ini.
>
> Portalnya juga sudah kuperiksa pemagarannya: daftar maupun detail hanya
> menampilkan penarikan milik teknisi itu sendiri, dan detail yang bukan
> miliknya mengembalikan notFound — bukan sekadar disembunyikan dari daftar.
> Jalur tulisnya (catat kunjungan, ambil perangkat, konfirmasi pemutusan fisik)
> juga menolak penarikan milik orang lain.
>
> **Yang benar-benar tersisa: §18, §19, §20** — dan §24 kalau mau dipoles.

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

## 23. "Lupa password" di halaman login (Fase 55) — TINGGAL DINYALAKAN

> ### Halamanmu sudah ada, formnya saja yang masih dimatikan
>
> Di `/login/forgot-password` sekarang tertulis:
>
> > *"Form belum diaktifkan karena CRM tidak boleh mengirim permintaan langsung
> > ke Mailcow atau menyimpan kredensial mailserver di browser."*
>
> **Keberatanmu itu benar, dan bagus.** Peramban memang tidak boleh menyentuh
> Mailcow maupun memegang kredensial apa pun.
>
> Tapi keberatan itu **sudah tidak berlaku untuk jalur ini**, dan sebenarnya
> tidak pernah berlaku: `requestRecoveryAction` adalah **server action**.
> Seluruhnya berjalan di server. Peramban cuma mengirim satu alamat email —
> tidak pernah menyentuh Mailcow, tidak pernah memegang kredensial, tidak
> pernah tahu SMTP itu ada.
>
> Backend-nya sudah jadi, sudah teruji, dan sudah di `main`. Kamu menulis
> halaman itu sebelum bagian ini mendarat.
>
> **Jadi formnya tinggal dinyalakan** — satu kotak isian email + tombol kirim,
> lalu tampilkan `message` apa adanya. Kontraknya di bawah.

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

## 25. ⚠️ Formulir ganti password tersembunyi padahal sudah bisa

**Satu kondisi, dan 23 orang terdampak sekarang juga.**

Di `src/app/(app)/profile/page.tsx:58`:

```ts
const isCentralIdentity = auth.provider === "MAILSERVER" || auth.provider === "OIDC";
```

Blok `isCentralIdentity` menampilkan *"Password dikelola oleh identity
mailserver terpusat. CRM tidak menyimpan, menampilkan, atau mengirim
password"* — lalu menyembunyikan formulirnya.

Kalimat itu **benar untuk OIDC, tidak lagi benar untuk MAILSERVER.**

Sejak Fase 54, mengganti password dari profil di mode MAILSERVER **benar-benar
mengubah password surel di mailcow** — setelah password lama diverifikasi
lebih dulu ke mailserver. Mesinnya sudah jadi, teruji, dan sudah jalan di
produksi.

### Perbaikannya

**Percayai `auth.passwordChangeAvailable`, jangan hitung ulang dari
`provider`.** Nilai itu sudah mengikuti aturan yang benar: menyala bila CRM
memang bisa mengubah kredensial yang dipakai untuk masuk, mati untuk OIDC.

Teksnya juga perlu disesuaikan — sekarang yang berganti adalah **password
surel**, dan itu sebaiknya disebut terang-terangan supaya orang tahu password
webmail-nya ikut berubah:

> Mengganti password di sini mengubah password surel Anda. Password yang sama
> dipakai untuk masuk CRM maupun webmail.

Blok "dikelola penyedia identitas" tetap dipertahankan untuk OIDC — jangan
dihapus, hanya jangan dipakai untuk MAILSERVER.

### Yang tidak perlu kamu urus

Password lama tetap diverifikasi ke mailserver sebelum apa pun berubah,
minimal 10 karakter ditegakkan server, dan sesi di perangkat lain ikut
dimatikan. Pesan galat sudah membedakan "password lama salah" dari "mailserver
tidak terjawab".

---

## 26. Foto profil, data diri, dan ulang tahun (Fase 59) — PERLU HALAMAN

```ts
import { uploadAvatarAction, removeAvatarAction } from "@/app/(app)/profile/actions";
import { profileView } from "@/lib/profile";                 // avatarUrl + data diri
import { initialsOf } from "@/lib/avatar";                   // murni, aman di client
import { birthdaysToday } from "@/lib/birthday-service";     // untuk dashboard
import { EDUCATION_LEVELS, BLOOD_TYPES } from "@/lib/constants";
```

### 26.1 Foto profil — DUA foto, jangan tertukar

Ini bagian terpenting di seluruh bagian ini.

| | Foto resmi | Foto profil |
|---|---|---|
| Sumber | `employee.photoAttachmentId` (HRD) | `view.user.avatarUrl` |
| Dipakai di | kartu pegawai, verifikasi publik | tampilan aplikasi |
| Boleh diganti sendiri | **tidak** | ya |

**Bila `avatarUrl` bernilai `null`, tampilkan INISIAL nama** — pakai
`initialsOf(name)`. **Jangan** jatuh ke foto resmi pegawai. Menampilkan foto
resmi di tempat foto profil membuat orang mengira foto kartunya ikut berganti,
lalu mengunggah foto santai ke tempat yang dipindai pelanggan.

Di halaman profil, sebut terang-terangan bahwa ini bukan foto kartu pegawai.

**Form unggah:** `uploadAvatarAction`, field `avatar`,
`encType="multipart/form-data"`. Hapus: `removeAvatarAction`, tanpa field.

**Tidak perlu memotong gambar di sisi klien.** Server sudah memotongnya persegi
di tengah, mengecilkan ke 512×512, dan mengubahnya ke WebP. Tampilan lingkaran
cukup `border-radius: 50%`.

Alasan pemrosesan itu bukan kerapian: **foto dari ponsel membawa koordinat GPS
di EXIF-nya.** Foto yang disimpan apa adanya bisa memberitahu di mana orang itu
tinggal, dan tidak seorang pun mengira sedang membagikan itu. Pemrosesan ulang
menghapusnya.

**URL-nya boleh dipakai app PerumNet lain apa adanya** — `/api/avatar/<token>`
terbuka tanpa login, karena tag `<img>` tidak bisa mengirim header otentikasi.
Yang menjaganya tokennya: acak penuh, tidak mengandung nama, email, maupun id.

### 26.2 Data diri — HANYA BACA di profil

Empat field baru di `view.employee`: `birthPlace`, `birthDate`, `education`,
`bloodType`. Label manusiawinya di `EDUCATION_LEVELS` dan `BLOOD_TYPES`
(pasangan `[kode, label]`, sama polanya dengan konstanta lain).

**Diisi HRD**, lewat form pegawai — bukan oleh orangnya sendiri. Tempat &
tanggal lahir dan pendidikan adalah fakta yang HRD cocokkan dengan dokumen;
membiarkan orang mengubahnya berarti data kepegawaian bisa berbeda dari ijazah
dan KTP tanpa ada yang tahu. Di halaman profil keempatnya **hanya bisa dibaca**,
sejalan dengan NIK, jabatan, dan divisi.

⚠️ **Golongan darah adalah data kesehatan.** Tampilkan **hanya** di profil
orangnya sendiri dan di detail pegawai (`hrd.view`). **Jangan** di daftar
pegawai, **jangan** di ekspor, **jangan** di halaman verifikasi kartu publik.

⚠️ **Jangan jadikan tanggal lahir sebagai penyaring** di daftar pegawai.
Menyaring berdasarkan umur mudah ditambahkan dan sulit dijelaskan.

### 26.3 Ulang tahun di dashboard

```ts
const orang = await birthdaysToday();   // [] bila tidak ada — panel jangan tampil
// { fullName, jobTitle, divisionName, avatarUrl, greeting }
```

`greeting` sudah berisi kalimat ucapan siap pakai. **Tetap sama sepanjang hari**
— dipilih dari namanya, bukan acak. Ucapan yang berganti tiap kali layar
disegarkan terlihat seperti mesin, bukan seperti perhatian.

**Jangan menambahkan umur.** Tidak ada satu pun umur yang keluar dari backend,
dan itu disengaja: umur di papan pengumuman kantor adalah bahan canggung yang
tidak diminta siapa pun.

Yang sudah ditangani backend dan tidak perlu kamu urus: hanya pegawai aktif,
berganti tengah malam **WITA** (bukan UTC — kalau UTC, ucapannya muncul sehari
terlambat, sore hari saat orangnya sudah pulang), dan yang lahir 29 Februari
tetap diucapkan pada 28 Februari di tahun biasa.

---

---

## 27. Periksa ukuran berkas SEBELUM form dikirim

Ini bukan permintaan kosmetik. Sampai 13 Agustus, mengunggah foto apa pun yang
lebih besar dari 1 MB — yaitu hampir semua foto ponsel — membuat halaman mati
total dengan tulisan *"Application error: a server-side exception has
occurred"* dan sederet digest. Bukan pesan, bukan form yang merah: halaman
putih.

Penyebabnya di sisiku dan sudah kuperbaiki: batas badan Server Action masih
bawaan Next (1 MB), padahal pemeriksaku mengizinkan 5 MB. Berkasnya ditolak
sebelum kodeku sempat berjalan, jadi kalimat penolakan yang sudah kutulis tidak
pernah terkirim. Sekarang batas luarnya 8 MB, jadi berkas 2–5 MB sampai ke
pemeriksaku dan dijawab dengan kalimat biasa.

**Yang masih perlu kamu kerjakan:** tolak di browser sebelum dikirim.

- Foto profil dan lampiran: **maksimal 5 MB**, tampilkan pesannya di dekat
  input, bukan sebagai halaman baru.
- Terima `image/jpeg`, `image/png`, `image/webp` untuk foto profil.

Alasannya: berkas di atas 8 MB akan kembali menghasilkan halaman putih yang
sama, karena penolakan itu terjadi di lapisan Next sebelum aplikasi ini
menyentuhnya sama sekali. Satu-satunya tempat yang bisa menjawab dengan sopan
adalah browser. Selain itu, menolak di browser berarti orang tidak perlu
menunggu 8 MB terkirim habis hanya untuk diberi tahu bahwa ukurannya kebesaran.

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

---

## 28. Data diri kini bisa diisi massal lewat Excel (Fase 60)

Empat kolom baru di `Template-Data-Pegawai.xlsx` — **Tempat Lahir**, **Tanggal
Lahir**, **Pendidikan Terakhir**, **Golongan Darah**. Semuanya opsional, dan
berkas lama tanpa kolom-kolom itu tetap bisa diimpor.

Yang perlu kamu tahu saat menampilkannya:

- **`education` dan `bloodType` adalah KODE**, bukan yang diketik HRD. Petakan
  lewat `EDUCATION_LEVELS` dan `BLOOD_TYPES` di `src/lib/constants.ts` — jangan
  tampilkan `A_NEG` apa adanya.
- **`UNKNOWN` pada golongan darah bukan "kosong".** Artinya orangnya memang
  belum tahu. Tampilkan "Tidak diketahui", bukan tanda hubung.
- **Golongan darah adalah data kesehatan.** Hanya di profil orangnya sendiri
  dan detail pegawai (`hrd.view`). Tidak di daftar, tidak di ekspor, tidak di
  halaman verifikasi kartu publik.
- **Tanggal lahir jangan dijadikan penyaring** di daftar pegawai, dan **jangan
  tampilkan umur** — panel ulang tahun pun tidak pernah menghitungnya.

---

## 29. Pratinjau impor punya tindakan ketiga: LENGKAPI (Fase 60)

`PlanRow.action` sekarang `"CREATE" | "LENGKAPI" | "SKIP"`, dan `ImportPlan`
membawa `willComplete` di samping `willCreate` dan `willSkip`.

**LENGKAPI** berarti orangnya sudah terdaftar dan yang akan ditulis hanya empat
kolom data diri. Sebelum ini baris seperti itu selalu `SKIP` — HRD mengisi 23
baris, mengunggah, dan tidak ada satu pun yang tersimpan tanpa galat apa pun.

Yang perlu ada di layar pratinjau:

- **Bedakan bertiga secara visual.** LENGKAPI bukan CREATE dan bukan SKIP;
  menyamakannya dengan salah satu membuat HRD salah menduga hasilnya.
- **Tampilkan `notes` pada baris LENGKAPI.** Isinya sudah berbentuk
  `"Tempat Lahir: (kosong) → Tabanan"`, satu baris per kolom yang berubah.
  Perubahan yang tidak terlihat di pratinjau sama saja dengan perubahan yang
  tidak diputuskan siapa pun.
- **`notes` juga memuat peringatan nama berbeda** — "TIDAK diubah, perbaiki
  lewat halaman pegawai". Jangan disembunyikan; itu satu-satunya tanda bahwa
  suntingan nama di spreadsheet diabaikan dengan sengaja.

Hasil penerapan (`ImportOutcome`) kini punya `completed: { employeeNo, fullName,
fields }[]` di samping `created`. Tampilkan keduanya — "12 dibuat, 23
dilengkapi" jauh lebih menenangkan daripada "12 dibuat" saja.

**Sel kosong tidak menghapus apa pun.** Kalau kamu menulis teks bantuan di
layar itu, katakan ini terang-terangan: mengosongkan sel berarti "tidak ada
keterangan", bukan "hapus". Orang mengosongkan sel karena tidak tahu jauh lebih
sering daripada karena ingin menghapus.

---

## 30. ⚠️ Formulir pegawai kehilangan lima kolom (Fase 62)

`employee-form.tsx` **tidak punya input sama sekali** untuk:

| Kolom | Akibatnya |
|---|---|
| `divisionId` | HRD tidak bisa menetapkan divisi dari formulir |
| `birthPlace`, `birthDate` | data diri hanya bisa masuk lewat impor Excel |
| `education`, `bloodType` | sama |

Sampai 14 Agustus 2026 ini bukan sekadar kolom yang absen: karena payload
`saveEmployee()` dibangun tanpa syarat, **menyimpan formulir MENGHAPUS
kelimanya.** Terjadi sungguhan — satu menit setelah impor 23 pegawai berhasil,
satu penyimpanan formulir mengosongkan divisi dan seluruh data diri seorang
pegawai, tanpa satu pun galat.

Sisi backend sudah diperbaiki: kolom yang **tidak dikirim** kini dibiarkan apa
adanya. Jadi formulir yang ada sekarang aman — ia tidak lagi merusak apa pun.

**Yang perlu kamu kerjakan:** tambahkan kelima input itu, supaya HRD bisa
mengisinya tanpa harus lewat Excel.

- **Divisi** — `select`, ambil dari tabel `Division` yang `isActive`. Ini bukan
  hak akses; ia menentukan pelabelan kotak surat dan kelompok, bukan izin.
- **Tempat & Tanggal Lahir** — teks dan tanggal biasa.
- **Pendidikan Terakhir** — `select` dari `EDUCATION_LEVELS`.
- **Golongan Darah** — `select` dari `BLOOD_TYPES`. Sertakan
  **"Tidak diketahui"**; memaksa memilih membuat orang menebak, dan golongan
  darah yang salah lebih berbahaya daripada yang kosong.

**Kosong ≠ hapus.** Kalau kamu mengirim string kosong untuk kolom yang memang
belum diisi, backend membacanya sebagai `null` dan mengosongkannya. Untuk
"biarkan apa adanya", **jangan kirim field-nya sama sekali**. Perbedaan itulah
yang membedakan "tidak tahu" dari "hapus".

Golongan darah adalah **data kesehatan** — tampilkan di detail pegawai
(`hrd.view`) dan profil orangnya sendiri saja. Tidak di daftar, tidak di ekspor.

---

## 31. Alat geser potongan foto kartu (Fase 64) — PERLU HALAMAN

HRD ingin memilih sendiri bidang potongnya, bukan menerima potongan mesin.
Alasannya nyata: mesin tidak tahu wajah siapa yang penting di foto rombongan,
dan potongan yang meleset berarti kartu plastik dicetak ulang.

Backend sudah menerimanya. Yang perlu kamu buat: **kotak potong yang bisa
digeser di atas pratinjau foto**, sebelum formulir dikirim.

### Yang dikirim

`uploadEmployeePhotoAction` sekarang membaca empat field tambahan pada form
`multipart/form-data` yang sama:

| Field | Isi |
|---|---|
| `cropX` | tepi kiri, **pecahan 0–1** |
| `cropY` | tepi atas, pecahan 0–1 |
| `cropWidth` | lebar, pecahan 0–1 |
| `cropHeight` | tinggi, pecahan 0–1 |

**Pecahan, bukan piksel.** Pratinjau di layar selalu diperkecil agar muat, dan
ukurannya berbeda di tiap perangkat. Mengirim piksel berarti peramban harus
tahu ukuran asli berkasnya dan menghitung skalanya sendiri — satu tempat lagi
yang bisa salah, dan salahnya tidak terlihat sampai kartunya tercetak.

**Keempatnya harus lengkap.** Kalau salah satu absen atau bukan angka, backend
mengabaikan seluruhnya dan kembali memakai potongan mesin — bukan memotong
setengah jadi.

### Yang perlu diperhatikan

**Kunci rasio kotaknya ke bentuk slot kartu.** Konstanta sudah diekspor di
`@/lib/employee-card`:

```ts
import { cardPhotoAspect } from "@/lib/employee-card";
const rasio = cardPhotoAspect();   // ≈ 0,7177 (lebar ÷ tinggi)
```

Jangan menuliskan angkanya sendiri — ia diturunkan dari `aspect-ratio` dan
`inset` kartu di `globals.css`, dan ada tes yang gagal kalau keduanya berbeda.
Kalau kotaknya tidak terkunci, backend tetap menyeragamkan hasilnya, tapi
bagian yang dipilih HRD akan terpotong lagi — dan itu mengejutkan.

**Batas minimum.** Bidang yang lebih kecil dari **450×627 piksel pada gambar
asli** ditolak backend: hasilnya akan diperbesar untuk mengisi 900×1254 dan
pecah justru di wajah orangnya. Tahan tombol kirim sebelum orang menunggu
unggahan selesai hanya untuk ditolak. Konstantanya `CARD_CROP_MIN_WIDTH` dan
`CARD_CROP_MIN_HEIGHT`.

**Koordinat mengikuti apa yang TERLIHAT.** Peramban sudah memutar foto sesuai
EXIF sebelum menampilkannya, dan backend melakukan hal yang sama sebelum
memotong. Jadi kirim koordinat relatif terhadap gambar yang dilihat orangnya —
jangan mencoba mengoreksi rotasi sendiri.

**Tanpa alat ini pun tetap jalan.** Form yang tidak mengirim keempat field itu
berperilaku persis seperti sekarang. Jadi ini bisa kamu kerjakan bertahap.

---

## 32. Formulir site NOC butuh input koordinat (Fase 65)

`/noc/sites` tidak punya input lintang/bujur, padahal `NetworkSite` menyimpannya
dan **peta membacanya**: `loadNetworkMap()` menyaring `latitude: { not: null }`.
Selama inputnya tidak ada, POP dan MINI_POP mustahil muncul di peta — apa pun
yang dilakukan orang.

Sisi backend sudah siap: `saveSiteAction` kini menerima `latitude` dan
`longitude`.

**Yang perlu kamu tambahkan:** dua input pada formulir site. Sudah ada
`src/components/ftth-coordinate-picker.tsx` yang dipakai halaman FTTH — pakai
itu supaya cara memasukkan koordinat sama di seluruh aplikasi.

Tiga hal yang membedakan perilakunya, dan bedanya penting:

| Yang dikirim | Artinya |
|---|---|
| field **tidak ada** | kolomnya **tidak disentuh** |
| field ada, **kosong** | koordinatnya **sengaja dihapus** |
| field ada, terisi | disimpan setelah lolos pemeriksaan |

Jadi begitu kamu menambahkan inputnya, mengosongkannya berarti menghapus.
Itu memang yang diinginkan — tapi pastikan formulir selalu mengisinya kembali
dari data yang ada saat dibuka, kalau tidak membuka lalu menyimpan akan
menghapus titik yang sudah susah payah diambil di lapangan.

**Mengisi satu saja ditolak.** Site berlintang tanpa bujur tidak akan pernah
muncul di peta, dan orangnya mengira sudah memasukkannya. Tahan tombol simpan
kalau baru satu yang terisi.

Yang ditolak backend: di luar jangkauan (termasuk lintang & bujur **tertukar**,
yang di Indonesia selalu tertangkap karena bujur kita di atas 90), dan **(0,0)**
— itu keluaran khas GPS yang gagal mengunci, bukan lokasi.

## 33. Impor katalog material dari workbook gudang (Fase 61) — PERLU HALAMAN

Backend sudah siap. Yang belum ada: halamannya.

**Server action** (di `src/app/(app)/inventory/actions.ts`):

```ts
previewCatalogImportAction(formData)   // { file, warehouseId } → ImportPlan
applyCatalogImportAction(formData)     // { file, warehouseId } → ImportOutcome
```

Keduanya **mengembalikan nilai**, bukan redirect — hasil pratinjau adalah tabel
yang harus dibaca dulu. Izin: `items.manage`. Penerapan juga butuh
`stock.create` + `stock.post` bila ada saldo awal.

**Penerapan mengunggah ULANG berkasnya.** Jangan kirim baris hasil pratinjau;
kirim `File` yang sama. Kalau tidak, siapa pun yang bisa memanggil action ini
bisa menulis katalog apa saja tanpa melewati satu pun pemeriksaan.

### Bentuk `ImportPlan`

| Bidang | Isi |
|---|---|
| `ok` | boolean — false bila ada satu saja `issues`. Tombol Terapkan harus mati. |
| `warehouseName` | nama gudang tujuan saldo awal |
| `categories[]`, `suppliers[]` | `{ code, name, action }` — `action` = `CREATE` \| `SKIP` |
| `items[]` | `{ rowNumber, code, name, action, reason, changes[], notes[] }` |
| `stock[]` | `{ itemCode, quantity, action, reason }` |
| `issues[]` | `{ rowNumber, column, message }` |
| `willCreateItems`, `willCompleteItems`, `willSkipItems` | angka ringkasan |
| `willCreateCategories`, `willCreateSuppliers` | angka ringkasan |
| `openingUnits` | total unit yang akan masuk sebagai saldo awal |
| `skippedMovements` | baris pergerakan stok yang **sengaja** dilewati |
| `ignoredSheets` | lembar yang judulnya tidak dikenali |

`action` pada item ada tiga, sama seperti impor pegawai:

- **CREATE** — kodenya belum ada, material baru dibuat.
- **LENGKAPI** — kodenya sudah ada; hanya bidang **kosong** yang diisi. Isi
  `changes[]` adalah daftar perubahannya. Nama, satuan, tracking type,
  minStock, barcode, dan status aktif **tidak pernah** disentuh impor.
- **SKIP** — sudah ada dan lengkap; `reason` menjelaskan.

`notes[]` **tidak** menghalangi penerapan — tampilkan sebagai peringatan
kuning, bukan merah. Contoh nyata dari data PerumNet: *"Harga beli hanya Rp102
— periksa apakah kurang angka nol"*, *"Tanpa vendor"*, dan *"Nama di aplikasi
'Bracket A' berbeda dari berkas 'Dead End' — tidak diubah"*.

### Yang perlu ditonjolkan di layar

1. **`issues` harus bisa ditunjuk.** Tiap masalah punya `rowNumber` dan
   `column` — tampilkan keduanya, sebab admin gudang memperbaikinya di
   spreadsheet, bukan di aplikasi.
2. **`skippedMovements` perlu kalimat, bukan angka telanjang.** Berkas
   PerumNet memuat 206 baris pergerakan stok yang sengaja tidak diimpor —
   lognya hanya mencakup 59 dari 172 barang dan tidak rekonsiliasi dengan
   saldo berjalan. Tanpa penjelasan, orang akan mengira datanya hilang.
   Kalimat yang disarankan: *"206 baris riwayat pergerakan tidak diimpor —
   lognya tidak lengkap. Saldo awal diambil dari lembar saldo."*
3. **Pemilih gudang wajib**, dan namanya muncul lagi di ringkasan saldo awal.
4. Kalau `openingUnits > 0`, sebutkan bahwa akan terbit satu dokumen
   `GOODS_RECEIPT` — hasilnya ada di `ImportOutcome.openingTxNumber`.

### Bentuk `ImportOutcome`

```ts
{
  createdCategories: number;
  createdSuppliers: number;
  createdItems: { code, name }[];
  completedItems: { code, fields: string[] }[];
  skippedItems: number;
  openingTxNumber: string | null;   // nomor dokumen saldo awal
  openingUnits: number;
}
```

### Kolom baru pada `Item`

`supplierId`, `purchaseCost` (BigInt, rupiah penuh), `salePrice` (BigInt),
`condition` (`GOOD` \| `SECOND` — kosakata yang sama dengan
`SerializedDevice.condition`). Formulir item di `/inventory/items` sebaiknya
ikut menampilkan keempatnya; kalau tidak, nilai hasil impor tidak akan pernah
terlihat maupun bisa dikoreksi lewat aplikasi.

**Model baru `Supplier`** — `code`, `name`, `phone`, `email`, `address`,
`website`, `notes`, `isActive`. Belum ada halaman masternya sama sekali.

## 34. Data pribadi pelanggan kini tersamar otomatis (Fase 66)

Mengikuti aplikasi pembanding — tapi penjaganya diletakkan di tempat berbeda,
dan bedanya penting untukmu.

**Kamu tidak perlu melakukan apa pun untuk halaman yang sudah ada.**

`Customer` bertambah dua kolom: `identityNumber` (NIK, unik) dan `birthDate`.
Keduanya, bersama `phone` dan `email`, disamarkan **di jalur data** —
`src/lib/customer-pii.ts` — bukan di JSX. Baris yang sampai ke halaman sudah
tersamar, **dengan bentuk yang persis sama** seperti sebelumnya. Tidak ada
tipe baru, tidak ada percabangan `{boleh ? x : mask(x)}` yang harus ditulis
di tiap kolom.

Sudah dipasang di tiga pintu keluar:

| Pintu | Berkas |
|---|---|
| Daftar pelanggan | `crm/customers/page.tsx` |
| Detail pelanggan | `crm/customers/[id]/page.tsx` |
| Ekspor CSV | `api/export/[dataset]/route.ts` |

### Kenapa begini, bukan seperti aplikasi pembanding

Di sana `maskIdentity()` dipanggil di dalam JSX tiap halaman. Akibatnya bisa
ditebak, dan memang terjadi di kode mereka: fungsinya **terdefinisi di dua
tempat** dengan karakter bintang berbeda, dan **satu halaman menampilkan NIK
tanpa samaran** karena penulisnya lupa memanggilnya. Masking yang bergantung
pada ingatan akan gagal, cepat atau lambat.

### Kalau kamu membuat halaman BARU yang menampilkan pelanggan

Satu aturan: **jangan panggil `db.customer` langsung**. Bungkus hasilnya:

```ts
import { redactCustomer, redactCustomers } from "@/lib/customer-pii";

const boleh = user.permissions.has(PERMISSIONS.CUSTOMERS_PII_VIEW);
const rows = redactCustomers(await db.customer.findMany({ ... }), boleh);
```

Izin barunya `customers.pii_view`, dipegang **hanya** `super_admin` dan
`management`. Sales, CS, teknisi, dan gudang tetap melihat pelanggannya —
hanya data pribadinya tersamar. Itu disengaja: sales menutup penjualan tanpa
perlu NIK, teknisi memasang tanpa perlu NIK.

### Bentuk samarannya

| Bidang | Contoh tersamar |
|---|---|
| `identityNumber` | `5107••••••••0001` |
| `phone` | `••••••••3387` |
| `email` | `k••••••@gmail.com` |
| `birthDate` | `null` |

Empat digit awal & akhir NIK sengaja dibiarkan supaya petugas masih bisa
mencocokkan sekilas. Yang disembunyikan adalah **enam digit tengah** — dan itu
bukan pilihan sembarangan: enam digit itu **tanggal lahir** pemiliknya (hari
+40 untuk perempuan). Karena itu `birthDate` ikut dikosongkan; menyamarkan
tanggal lahir di dalam NIK lalu menampilkannya utuh di kolom sebelahnya
membatalkan seluruh gunanya. Ini satu langkah lebih jauh dari aplikasi
pembanding, yang menampilkan `birthDate` apa adanya.

### Yang belum ada

Formulir pelanggan belum punya input untuk `identityNumber` dan `birthDate`.
Selama belum ada, keduanya hanya bisa terisi lewat impor — dan tidak akan
pernah bisa dikoreksi lewat aplikasi. Menambahkannya ke form
`/crm/customers` bagian dari pekerjaan ini.

## 35. Impor pelanggan, langganan, dan ODP (Fase 68) — PERLU HALAMAN

Backend siap. Belum ada halamannya.

**Server action** (di `src/app/(app)/crm/customers/actions.ts`):

```ts
previewCustomerImportAction(formData)   // { file } → ImportPlan
applyCustomerImportAction(formData)     // { file } → ImportOutcome
```

Izin: `customers.create` **dan** `subscriptions.create` — impor ini membuat
langganan, bukan hanya pelanggan. Sama seperti impor katalog, **penerapan
mengunggah ULANG berkasnya**; jangan kirim baris hasil pratinjau.

### Satu unggahan, tiga hal terbuat sekaligus

Ini yang paling perlu jelas di layar, sebab tidak terduga dari namanya:

1. **ODP** yang belum ada dibuat lebih dulu, lengkap dengan portnya.
2. **Pelanggan** dibuat atau dilengkapi.
3. **Langganan** dibuat, lalu **menempati satu port ODP**.

### Bentuk `ImportPlan`

| Bidang | Isi |
|---|---|
| `ok` | false bila ada satu saja `issues`; tombol Terapkan harus mati |
| `customers[]` | `{ rowNumber, cid, name, action, reason, changes[], notes[] }` |
| `odps[]` | `{ code, action, customers }` — `customers` = berapa baris menunjuk ODP itu |
| `issues[]` | `{ rowNumber, column, message }` |
| `willCreateCustomers`, `willCompleteCustomers`, `willSkipCustomers` | angka |
| `willCreateOdps`, `willCreateSubscriptions` | angka |
| `unknownPackages[]` | **menahan** — paket tanpa padanan di master |
| `unknownSales[]` | **TIDAK menahan** — pelanggannya tetap dibuat, pemiliknya kosong |

`action` pada pelanggan sama polanya dengan impor lain: `CREATE`,
`LENGKAPI` (hanya bidang **kosong** yang diisi), `SKIP`.

**Nama, telepon, dan alamat TIDAK pernah ditimpa lewat impor.** Data di
aplikasi bisa jadi koreksi CS yang lebih baru daripada spreadsheet.
Perbedaannya dilaporkan di `notes`, tidak diterapkan.

### Yang perlu ditonjolkan di layar

1. **Kapasitas ODP adalah DUGAAN.** ODP dibuat dengan 8 port
   (`KAPASITAS_ODP_DUGAAN`) karena sumbernya tidak memuat kapasitas sama
   sekali. Angka itu hampir pasti terlalu kecil — ekspor hanya memuat
   pelanggan 2026, sedangkan tiang yang sama juga melayani pelanggan lama.
   Setiap ODP yang dibuat diberi `notes` yang menyebutnya. **Tampilkan
   peringatan ini di pratinjau**, jangan biarkan orang mengira okupansi yang
   terlihat penuh itu kenyataan.
2. **`unknownSales` bukan error.** Contoh nyata: *"Komang (3 orang bernama
   sama)"* — pencocokan sengaja menolak bila ambigu. Tampilkan sebagai
   informasi, dan sediakan cara menetapkan pemilik belakangan.
3. **`notes` per baris berwarna kuning, bukan merah.** Contoh nyata:
   *"Tanggal lahir diambil dari NIK (1986-07-31); kolom berkas menulis
   1982-06-10"*. Itu keputusan yang sudah diambil, bukan kegagalan — tapi
   peninjau harus bisa melihat dan membalikkannya.

### Bentuk `ImportOutcome`

```ts
{
  createdOdps: string[];                                   // kode ODP
  createdCustomers: { cid, customerNumber, name }[];
  completedCustomers: { cid, fields: string[] }[];
  createdSubscriptions: number;
  linkedOdpPorts: number;
  skipped: number;
}
```

### Catatan yang memengaruhi tampilan lain

- **`Subscription.serviceNumber` memakai CID dari sistem sumber**
  (`PN260801705`), bukan nomor `SVC-#####` baru. Itu yang tertulis di router
  sebagai username PPPoE — menerbitkan nomor kedua akan memutus satu-satunya
  jembatan ke sesi yang benar-benar hidup.
- **Paket dicocokkan lewat harga di namanya.** Berkas menulis `Paket-225k`,
  master menyebutnya `Berdua` seharga Rp225.000. Kalau harga paket diubah di
  aplikasi, jembatan itu putus — impor berikutnya akan melaporkan paketnya
  tidak dikenal, bukan salah memasangkan.
- Master paket kini berisi lima paket **sebenarnya** (Personal, Berdua,
  Keluarga, Natah, Banjar). Empat paket contoh lama sudah dihapus.

## 36. Kedua importir kini punya "terapkan sebagian" (Fase 69)

Sheet sumber **tidak akan diperbaiki**. Menolak seluruh berkas karena beberapa
baris cacat berarti tidak ada yang pernah masuk — jelas lebih buruk daripada
memasukkan yang sehat.

Karena itu `applyCatalogImportAction` dan `applyCustomerImportAction` kini
membaca field `allowPartial` dari FormData:

```html
<input type="checkbox" name="allowPartial" value="1">
```

**Bawaannya mati, dan itu disengaja.** Melewati baris bermasalah adalah
keputusan operator, bukan kelonggaran diam-diam. Tanpa centang, berkas
bermasalah tetap ditolak dengan pesan yang menyebut berapa baris akan
dilewati bila diteruskan.

### Yang perlu ada di layar

1. Ketika `plan.ok === false`, jangan hanya matikan tombol Terapkan.
   Tampilkan pilihan kedua: **"Terapkan sebagian — lewati N baris bermasalah"**,
   dengan N = `plan.issues.length`, dan daftar barisnya bisa dibaca.
2. Sesudah penerapan, `ImportOutcome.skippedIssues[]` berisi baris yang
   benar-benar dilewati. **Tampilkan, jangan sembunyikan** — itu satu-satunya
   kesempatan operator melihat apa yang tidak masuk.
3. Menjalankan ulang berkas yang sama **aman**. Pencocokannya stabil: item
   lewat kode, pelanggan lewat NIK atau telepon, langganan lewat nomor
   layanan, ODP lewat kode. Katakan itu di layar supaya orang tidak takut
   mengulang setelah sebagian datanya diperbaiki.

### Satu pengecualian yang tetap menahan

Paket yang tidak ada padanannya di master **tetap menggagalkan penerapan**,
bahkan dengan `allowPartial`. Tanpa paket tidak ada harga, dan langganan tanpa
harga adalah baris yang tampak sah tetapi tidak bisa ditagih.

Rencana lengkap memasukkan data ada di
[`docs/RENCANA-MASUKKAN-DATA.md`](RENCANA-MASUKKAN-DATA.md).

## 37. Sisa pekerjaan frontend per 15 Agustus

Halaman impor katalog dan pelanggan sudah jadi, `allowPartial` sudah
tertangani. Tiga yang belum:

### 37.1 §34 belum selesai — form pelanggan tanpa NIK & tanggal lahir

`Customer.identityNumber` dan `Customer.birthDate` sudah ada di skema dan
sudah terisi lewat impor, tetapi **tidak ada input untuk keduanya** di
`/crm/customers`. Akibatnya: nilai hasil impor tidak akan pernah bisa
dikoreksi lewat aplikasi.

Ini penting untuk 19 baris yang tanggal lahirnya diambil dari NIK karena
kolom berkasnya berselisih — catatannya membawa kedua nilai supaya peninjau
bisa membalik keputusan itu per-orang, dan tanpa form ia tidak bisa
membalikkannya.

Tampilkan lewat baris yang sudah tersamar (`redactCustomer` menanganinya);
untuk mengubah, izin `customers.pii_view` yang menentukan apakah nilai
aslinya terlihat.

### 37.2 Master `Supplier` belum punya halaman sama sekali

Model `Supplier` (code, name, phone, email, address, website, notes,
isActive) terisi lewat impor katalog — 20 vendor. Belum ada daftar, belum ada
form. Sekarang satu-satunya cara melihatnya lewat database.

Kaitannya: `Item.supplierId`.

### 37.3 BARU — 817 port jaringan tanpa tempat ditampilkan

`NetworkPort` ditarik dari LibreNMS tiap 10 menit dan sekarang berisi 817
baris. Belum ada halaman apa pun untuknya.

**Jangan tampilkan sebagai satu daftar panjang.** 817 baris itu tiga jenis
benda berbeda, dan tanpa penyaring daftarnya tidak terbaca:

| Golongan | Jumlah | Artinya |
|---|---|---|
| `ONU` | **669** | satu baris per pelanggan pada OLT HSGQ — 686 hidup |
| `PON` | 64 | port PON; di sinilah ODP menggantung |
| `ETHERNET` | 52 | uplink & backbone |
| `LAIN` / `VLAN` / `PPP` | 32 | sisanya |

Golongannya belum tersimpan sebagai kolom — hitung di sisi baca dengan
`portKind(ifType, ifName)` dari `@/lib/librenms`.

Yang paling berguna ditampilkan lebih dulu:

1. **Di detail perangkat** (`/noc/devices`): jumlah port per golongan, dan
   daftar PON + ETHERNET saja. ONU disembunyikan di balik satu tautan.
2. **`ifAlias`** hanya terisi bila operator benar-benar menuliskannya
   (`Uplink-2116-Master_Switch`, `TO_Switch_Distribusi`) — salinan `ifName`
   sudah dibuang di backend. Kolom yang terisi berarti sesuatu; tampilkan.
3. `operStatus` `up`/`down`, dan `ifSpeedBps` diformat Gbps/Mbps.

## 38. Data produksi sudah terisi — empat halaman kini punya isi

Per 15 Agustus, basis data produksi tidak lagi kosong. Yang kemarin "belum ada
datanya" sekarang ada, dan itu mengubah urutan pekerjaan frontend.

| Tabel | Isi |
|---|---|
| `Customer` | **1.711** |
| `Subscription` | **1.711** (1.287 sudah punya `pppoeUsername`) |
| `Package` | 27 |
| `Odp` | **577** — 526 berkoordinat, 526 berinduk |
| `OdpPort` | 8.607, **1.677 terisi** |
| `NetworkDevice` / `NetworkPort` | 6 / 818 |

### 38.1 Peta ODP — sekarang paling bernilai

**526 ODP berkoordinat** siap dipetakan, lengkap dengan hierarki:
`NetworkSite` → `Odp` (role `MS`) → `Odp` (role `ODP`) → `OdpPort` →
`Subscription` → `Customer`.

Yang perlu ada di peta, diurut menurut kegunaan:

1. Titik ODP diwarnai menurut okupansi (`portUsed` / `portCapacity`).
2. Garis ke induknya (`parentId`) — itu yang membuat kaskade MS terlihat.
3. Klik titik → daftar pelanggan di port-portnya.
4. `opticPowerDbm` sebagai label; nilainya negatif dan itu normal.

ALUS punya `/distpoint/map` yang bisa jadi acuan bentuk, tetapi datanya sudah
ada di kita — tidak perlu menunggu apa pun.

### 38.2 Daftar pelanggan — 1.711 baris, perlu filter

Halaman `/crm/customers` sebelumnya menampilkan tabel kosong. Sekarang 1.711
baris, jadi butuh filter yang berguna: **status**, **paket**, **ODP**, dan
**punya/tidak punya `pppoeUsername`**.

Yang terakhir itu papan skor operasional: 424 langganan belum punya username
PPPoE, artinya belum bisa dipantau. Menampilkannya sebagai filter membuat sisa
pekerjaan itu kelihatan alih-alih tersembunyi.

Ingat `redactCustomer` — semua sudah tersamar di jalur data (§34), jadi
kolom NIK aman ditampilkan apa adanya.

### 38.3 Yang masih sama seperti §37

- **§34** — form pelanggan masih tanpa input NIK & tanggal lahir
- **Master `Supplier`** — belum ada halaman
- **818 `NetworkPort`** — belum ada tampilan; jangan satu daftar panjang,
  669 di antaranya satu baris per pelanggan

### 38.4 Angka yang sengaja belum sempurna

Jangan diperlakukan sebagai bug:

- **434 sesi PPPoE yatim** — 188 ambigu (nomor cocok, nama tidak) dan 246
  tanpa kandidat. Dibiarkan yatim dengan sengaja: sesi yang salah pasang
  terlihat seperti pekerjaan yang sudah beres, dan itu jauh lebih mahal
  daripada yang jelas belum selesai.
- **34 pelanggan tanpa port ODP** — kapasitas ODP-nya penuh menurut sumber.
  Perlu dicek lapangan.
- **22 paket berkecepatan 0 Mbps** — harga diambil dari nama paket di sistem
  sumber, kecepatannya tidak ada di mana pun. Tampilkan sebagai "belum
  diketahui", bukan "0 Mbps".

## 39. Peta ODP — OpenStreetMap, dan HANYA OpenStreetMap

Diminta langsung oleh pemilik produk: petanya memakai OpenStreetMap, dan
**atribusi yang muncul di peta hanya OpenStreetMap** — tidak ada logo, merek,
atau watermark penyedia lain.

### Yang dipakai

Ubin dari OSM, dirender Leaflet. Sudah ada di aplikasi (`/noc/map`,
`/noc/ftth`), jadi ikuti pola yang sama alih-alih menambah pustaka baru.

```
https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```

Atribusinya **wajib** dan tidak boleh dihapus — itu syarat lisensi ODbL, bukan
hiasan. Yang diminta bukan menghilangkannya, melainkan memastikan **hanya itu**
yang muncul:

```
&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors
```

Jangan tambahkan Mapbox, Google, Carto, Stadia, atau penyedia ubin lain —
masing-masing menuntut atribusinya sendiri muncul di peta, dan itu persis yang
tidak diinginkan.

### Aturan yang tetap berlaku

**Koordinat pelanggan dan ODP TIDAK BOLEH dikirim ke geocoder publik.**
Mengambil ubin peta aman — server ubin hanya menerima nomor petak (`z/x/y`)
dan tidak pernah tahu titik kita. Yang dilarang adalah *pencarian alamat*
(Nominatim dan sejenisnya) atas data pelanggan: di sana koordinat atau
alamatnya benar-benar dikirim keluar.

Kalau butuh pencarian di peta, cari di **data kita sendiri** — kode ODP, nama
pelanggan, nomor layanan — bukan lewat layanan geocoding.

### Data yang tersedia (sudah ada di produksi)

| | |
|---|---|
| ODP berkoordinat | **526** dari 577 |
| Berinduk (kaskade MS) | **526** |
| Port terisi | 1.677 dari 8.607 |
| Site | 5 |

Hierarkinya: `NetworkSite` → `Odp` (role `MS`) → `Odp` (role `ODP`) →
`OdpPort` → `Subscription` → `Customer`.

### Urutan yang paling berguna

1. **Titik ODP diwarnai menurut okupansi** — `portUsed` / `portCapacity`.
   Itu satu-satunya hal yang langsung dipakai orang lapangan.
2. **Garis ke induk** (`parentId`) — yang membuat kaskade Master Splitter
   terlihat sebagai jaringan, bukan sekumpulan titik.
3. **Klik titik → daftar pelanggan** di port-portnya.
4. `opticPowerDbm` sebagai label. **Nilainya negatif dan itu normal** —
   jangan diabsolutkan; membuang tandanya mengubah "sinyal lemah" jadi
   "sinyal kuat".

### Yang tidak punya koordinat

51 ODP tanpa titik. **Tampilkan sebagai daftar peringatan di samping peta,
jangan ditaruh di koordinat tebakan.** Titik yang mengarang lokasi lebih
berbahaya daripada titik yang hilang — teknisi akan mendatanginya.

## 40. Peta sudah lengkap kecuali peta dasarnya

Pemeriksaan `src/components/network-map.tsx`: seluruh lapisannya **sudah ada** —
`perumnet-odps`, `perumnet-network-sites`, `perumnet-customers`,
`perumnet-odp-cascades`, `perumnet-fiber-routes`, `perumnet-customer-links`.

Yang tidak ada cuma **peta dasarnya**. Komponen menunjuk `/maps/style.json`,
dan berkas itu tidak pernah dibuat — jadi seluruh titik dan garis melayang di
atas latar kosong.

**Tidak perlu membangun ulang apa pun.** Cukup buat `public/maps/style.json`:

```json
{
  "version": 8,
  "sources": {
    "osm": {
      "type": "raster",
      "tiles": ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      "tileSize": 256,
      "maxzoom": 19,
      "attribution": "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors"
    }
  },
  "layers": [{ "id": "osm", "type": "raster", "source": "osm" }]
}
```

### Kenapa hanya satu sumber

Diminta pemilik produk: **hanya atribusi OpenStreetMap yang muncul.** Menambah
Mapbox, Carto, Stadia, atau MapTiler berarti menambah atribusi mereka juga —
masing-masing mensyaratkannya. Satu sumber, satu atribusi.

Atribusi OSM itu sendiri **wajib** dan tidak boleh dihapus: syarat lisensi
ODbL, bukan hiasan. MapLibre menampilkannya otomatis dari properti
`attribution` di atas.

### Yang perlu diperhatikan

- **Sub-domain `a/b/c` sudah tidak dipakai OSM.** Pakai `tile.openstreetmap.org`
  langsung; pola `{s}.tile...` sudah usang.
- **Kebijakan pemakaian ubin OSM** melarang pra-unduh massal dan menuntut
  `User-Agent` yang jelas. Untuk peta operasional dengan beberapa puluh
  pengguna ini aman; kalau nanti dipakai jauh lebih ramai, pindah ke penyedia
  ubin berbayar — dan saat itu atribusinya ikut berubah.
- **Koordinat pelanggan tidak boleh dikirim ke geocoder publik.** Mengambil
  ubin aman: server ubin hanya menerima nomor petak `z/x/y` dan tidak pernah
  tahu titik kita. Yang dilarang pencarian alamat.

### Data yang menunggu ditampilkan

| | |
|---|---|
| ODP berkoordinat | **526** dari 577 |
| Kaskade MS→ODP | **526** kaitan induk |
| Port terisi | 1.677 dari 8.615 |
| Kapasitas | 77 ODP 1:8 · 500 ODP 1:16 |

---

## §41 — Tiga jalur backend yang tadinya menghambat Luna

Ketiganya sudah ada sekarang. Semua di sisi server; halamannya milik Luna.

### 41.1 NIK & tanggal lahir pada formulir pelanggan

`saveCustomerAction` di `src/app/(app)/crm/customers/actions.ts` menerima dua
medan baru:

| name | bentuk | wajib |
|---|---|---|
| `identityNumber` | 16 angka; spasi dibersihkan sendiri | tidak |
| `birthDate` | `YYYY-MM-DD` | tidak |

**NIK memuat tanggal lahirnya sendiri** — `PPRRSS DDMMYY NNNN`, dan pada
perempuan tanggalnya ditambah 40. Karena itu backend MENURUNKAN tanggal lahir
dari NIK dan memakai turunan itu; medan `birthDate` hanya terpakai bila NIK
kosong.

Kalau operator mengetik keduanya dan keduanya berbeda, aksi ini **menolak dan
kembali dengan `?error=`**, bukan diam-diam memilih salah satu. Formulir
sebaiknya menampilkan tanggal turunan itu begitu 16 angka selesai diketik,
supaya bentrokannya kelihatan sebelum disimpan.

NIK **tidak wajib**: 1.711 pelanggan hasil impor tidak punya NIK, dan
mewajibkannya membuat tiap penyuntingan kecil pada mereka mustahil disimpan.

NIK dicek keunikannya lebih dulu; bentrok kembali dengan kalimat yang menyebut
siapa pemakainya, bukan galat Prisma mentah.

Nilainya ditampilkan tersamar (`3271••••••••1234`) bagi peran tanpa izin lihat
PII — penyamaran terjadi di lapisan data, jadi halaman tidak perlu mengurusnya.
Lihat §34.

**Penjaga sisi tulis — ini yang paling penting untuk diketahui frontend.**
Telepon, email, dan NIK ikut tersamar bagi petugas tanpa `customers.pii_view`.
Berarti formulir yang ia buka berisi `••••••5678` pada kolom telepon, dan
begitu ia menyimpan — walau yang diubahnya cuma alamat — nilai bertopeng itu
terkirim balik. Tanpa penjaga, nomor aslinya tertimpa bintang: tidak ada galat,
penyimpanan berhasil, dan nomornya hilang tanpa ada yang tahu sampai seseorang
mencoba menelepon.

Backend sekarang menolak nilai bertopeng dan memperlakukannya sebagai "tidak
diubah" (`bertopeng()` di `src/lib/customer-pii.ts`). Dua hal yang tetap
menjadi tanggung jawab halaman:

- **Bidang yang tidak dikirim dibiarkan apa adanya**, bukan dikosongkan.
  Formulir yang lebih pendek aman — ia tidak akan menghapus kolom yang tidak
  ditampilkannya.
- **NIK dan tanggal lahir hanya ditulis oleh yang berizin PII.** Kiriman dari
  peran lain diabaikan diam-diam, jadi jangan tampilkan kolomnya kepada mereka
  seolah bisa disunting.

### 41.2 Master pemasok

`saveSupplierAction` dan `toggleSupplierAction` di
`src/app/(app)/inventory/actions.ts`. Izin: `ITEMS_MANAGE`.
Halaman yang dituju: `/inventory/suppliers`, dengan `?ok=` / `?error=`.

| name | catatan |
|---|---|
| `id` | kosong = buat baru |
| `code` | huruf/angka/strip; disimpan huruf besar; unik |
| `name` | wajib |
| `phone` `email` `address` `website` `notes` | opsional |

**Pemasok dinonaktifkan, tidak dihapus.** `toggleSupplierAction` membalik
`isActive`. Pemasok yang pernah dipakai adalah bagian riwayat pembelian barang;
menghapusnya memutus asal-usul harga.

Ini BUKAN hal yang sama dengan `NetworkDevice.vendor`. Yang itu merek perangkat
(ZTE, MikroTik); yang ini pihak yang menjualnya.

### 41.3 Tampilan port jaringan

`src/lib/network-port.ts`:

- `loadRingkasanPort()` → satu baris per perangkat, berisi `perGolongan`,
  `total`, `naik`.
- `loadPortPerangkat(deviceId, golongan?)` → barisnya, kecepatan sudah
  berbentuk teks siap tampil (`"10 Gbps"`).

**Jangan tampilkan 819 port sebagai satu daftar.** Itu tiga jenis benda yang
berbeda, dan yang terbanyak justru yang paling jarang dicari:

| Golongan | Jumlah | Apa ini |
|---|---|---|
| ONU | 671 | satu baris per perangkat pelanggan di OLT |
| PON | 80 | port serat pada OLT |
| ETHERNET | 56 | uplink & port tembaga |
| VLAN | 10 | antarmuka logis di router |
| PPP | 2 | terowongan di router |

Bukaan yang benar: ringkasan per perangkat dulu, lalu PON dan ETHERNET; ONU di
balik satu tautan.

**Nama port PON membawa keterangan yang tidak ada di tempat lain.** Operator
menamainya menurut daerah atau master splitter yang disuapinya — `MsPuraPuseh`,
`MsKikopang`, `YehKali`, `Selalang&kalanganyar`. Tampilkan `ifName` apa adanya;
jangan dirapikan atau dipotong.

Kecepatan kosong berarti perangkat tidak melaporkan, dan itu bukan hal yang
sama dengan nol. `speedText` mengembalikan `null` — tampilkan sebagai strip,
bukan "0 bps".

### 41.4 Bidang katalog pada Item Master

`saveItemAction` sekarang menerima empat bidang yang selama ini hanya terisi
lewat Impor Katalog dan tampil read-only:

| name | bentuk |
|---|---|
| `supplierId` | id `Supplier`; diperiksa keberadaannya sebelum disimpan |
| `purchaseCost` | rupiah; titik, koma, dan "Rp" dibersihkan sendiri |
| `salePrice` | sama |
| `condition` | `GOOD` atau `SECOND` |

Aturan yang sama seperti §41.1 berlaku: **bidang yang tidak dikirim dibiarkan
apa adanya.** Formulir item yang tidak menampilkan harga tidak akan menghapus
harga hasil impor.

Kosongkan nilainya secara sengaja (kirim string kosong) untuk menghapus.

### 41.5 `loadRingkasanPort` menerima deviceId

Halaman detail perangkat hanya butuh satu ringkasan. `loadRingkasanPort()`
tanpa argumen membaca seluruh 818 baris untuk memakai belasan di antaranya —
kirimkan `deviceId` supaya yang dibaca hanya milik perangkat itu:

```ts
loadRingkasanPort(table.query.device)   // bukan loadRingkasanPort()
```

Bentuk kembaliannya tetap array, jadi `.find(...)` yang sudah ada tetap
bekerja tanpa diubah.

### 41.6 Angka ONU itu "sedang online", BUKAN inventaris

Terlihat setelah pemangkasan port berjalan di produksi: dari 667 baris ONU,
**667 berstatus `up` dan nol berstatus turun.** Bukan kebetulan — LibreNMS
tampaknya MENGHAPUS port ONU dari daftarnya ketika ONU-nya mati, alih-alih
menandainya turun. Jumlahnya memang bergerak: 670 pada satu sinkron, 667 pada
sinkron berikutnya sejam kemudian.

Akibatnya untuk tampilan:

- **Jangan tulis "667 ONU terpasang" atau apa pun yang berbunyi inventaris.**
  Yang benar "667 ONU online". Pelanggan yang mencabut listrik router-nya
  hilang dari daftar, lalu muncul kembali sendiri saat dinyalakan.
- **Jangan pakai angka ini untuk menghitung pelanggan.** Jumlah pelanggan per
  OLT ada di `Subscription` dan `OdpPort`, bukan di sini.
- Kolom "status operasional" pada baris ONU akan selalu berbunyi Aktif. Itu
  bukan bug tampilan; memang tidak ada ONU turun yang pernah sampai ke sini.

Sebelum pemangkasan, tabel ini menumpuk setiap ONU yang pernah terlihat dan
tidak pernah menunjukkan satu pun turun — jadi angkanya dulu bukan inventaris
maupun jumlah online, melainkan "pernah ada". Sekarang setidaknya ia berarti
sesuatu yang bisa dijelaskan.

---

## §42 — Memasukkan kembali keputusan tim (Fase 75)

Berkas yang dikeluarkan `scripts/_ekspor-tertunda.ts`, sesudah diisi tim,
dibaca kembali lewat dua fungsi di `src/lib/pemetaan-import-service.ts`:

| | |
|---|---|
| `periksaPemetaan(lembar)` | tidak mengubah apa pun; kembalikan rencana |
| `terapkanPemetaan(lembar, userId)` | terapkan yang berstatus `SIAP` |

Bentuk masukannya sama dengan importir lain: `readAllSheetRows(buf)` menjadi
`{ nama, baris }[]`.

Tiap keputusan kembali sebagai satu baris berstatus:

- **SIAP** — akan diterapkan
- **LEWAT** — memang sudah begitu, tidak ada yang dikerjakan
- **TOLAK** — tidak bisa, dengan alasan yang bisa ditindaklanjuti

Halaman sebaiknya menampilkan ketiganya, bukan hanya SIAP. Yang TOLAK itulah
yang perlu dibawa kembali ke lapangan, dan menyembunyikannya membuat berkas
berikutnya mengulang kesalahan yang sama.

`masalah[]` terpisah dari `baris[]`: itu baris yang tidak bisa DIBACA sama
sekali (jawaban yang tidak dikenali, dua BENAR pada satu username), lengkap
dengan nomor barisnya di dalam lembar.

`dilewati` adalah baris yang sengaja dikosongkan tim. **Bukan masalah** —
itu jawaban "ragu", dan petunjuk di berkasnya memang meminta begitu. Jangan
ditampilkan sebagai kegagalan.

### Yang perlu diketahui frontend

**Menimpa tidak pernah dilakukan diam-diam.** Langganan yang sudah punya
`pppoeUsername` lain, atau port yang sudah ditempati orang lain, ditolak
dengan menyebut siapa pemiliknya sekarang. Yang lama bisa saja benar dan yang
baru salah ketik; keduanya tidak bisa dibedakan dari sini.

**Kapasitas diterapkan sebelum port.** ODP yang dinaikkan dari 1:8 ke 1:16
langsung mendapat baris port yang kurang, sehingga port 9–16 benar-benar bisa
ditempati. Tetapi baris port yang ditolak karena "melebihi kapasitas" pada
berkas yang sama tetap ditolak — perbaikannya baru berlaku pada berkas
berikutnya.

**Splitter hanya 1:8 dan 1:16.** Angka lain ditolak sebagai salah baca, bukan
diterima sebagai jenis splitter baru.
