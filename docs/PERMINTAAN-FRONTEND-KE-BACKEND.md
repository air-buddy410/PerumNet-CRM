# Permintaan Frontend → Backend (Luna → Opus)

Kanal balik dari `docs/HANDOFF-BACKEND-KE-FRONTEND.md`. Tulis di sini kalau
sebuah layar butuh data atau perilaku yang belum ada di backend — jangan
diakali di sisi klien, dan jangan mengubah `prisma/schema.prisma`,
`src/lib/*.ts`, atau isi `actions.ts` sendiri.

Aturan lengkap: `docs/WORKFLOW-TIM.md`.

## Format

Tiga baris cukup:

```
### <judul singkat>
- **Layar:** /rute/halaman
- **Butuh:** data / action / perilaku apa
- **Kenapa tidak bisa di sisi frontend:** ...
```

Opus menandai yang sudah selesai dengan ✅ dan menyebut nama fungsi + nama
field-nya di `docs/HANDOFF-BACKEND-KE-FRONTEND.md`, bukan di sini.

---

## Terbuka

### ✅ Permintaan bantuan reset password ke tim IT
- **Layar:** `/login/forgot-password`
- **Butuh:** ✅ tersedia melalui `requestRecoveryAction` → `requestAccountRecovery`. Frontend hanya mengirim email dan menampilkan `message` generik dari server.
- **Kenapa tidak bisa di sisi frontend:** browser tetap tidak boleh mengetahui recipient internal, kredensial Mailcow/SMTP, token reset, atau password. Rate limit, audit log, pengiriman server-side, dan perlindungan account enumeration tetap menjadi tanggung jawab backend.

Frontend sudah mengaktifkan form melalui server action resmi. Tidak ada token reset, password baru, atau request Mailcow langsung dari browser.

### ✅ Form data diri HRD — lima field (§30)
- **Layar:** `/profile`, `/hrd/employees/[id]`, form `/hrd/employees`, dan panel ulang tahun dashboard.
- **Status:** form create/edit sekarang mengirim `divisionId`, `birthPlace`, `birthDate`, `education`, dan `bloodType` melalui `saveEmployeeAction`; service HRD menerima, memvalidasi, mengaudit, dan menyimpan nilainya.
- **Batas UI:** data diri diisi HRD dengan permission `hrd.manage`; profil pegawai tetap read-only. Golongan darah hanya tampil di profil sendiri dan detail pegawai dengan `hrd.view`, bukan daftar, ekspor, kartu, atau verifikasi publik. `UNKNOWN` ditampilkan sebagai “Tidak diketahui”; tanggal lahir tidak menjadi filter dan umur tidak ditampilkan.

### Pagination dan sorting list bertabel
- **Layar:** seluruh halaman list bertabel; loader khusus seperti `/settings/trash` termasuk bila kontraknya sudah mendukung parameter.
- **Butuh:** loader permission-scoped menerima `page`, `pageSize`, `sort`, `direction`, filter/pencarian yang ada, lalu mengembalikan row page aktif dan `totalCount`. Whitelist sort serta tie-breaker stabil harus diterapkan di server menggunakan `count` + `skip` + `take`.
- **Kenapa tidak bisa di sisi frontend:** memotong dataset besar setelah seluruh row dikirim tetap membebani database, server, jaringan, dan browser. Detail dokumen, line-item, dan print tetap menjadi pengecualian.

Kontrak query standar: `?page=1&pageSize=20&sort=createdAt&direction=desc`. Nilai page size yang sah hanya `10`, `20`, `50`, `100`; nilai lain kembali ke `20`.

### Loader yang masih membutuhkan dukungan backend
- **Layar:** aging piutang, rekap HRD, arsip, mailbox, dan report multi-sumber.
- **Butuh:** loader permission-scoped yang menerima `page`, `pageSize`/`limit`, `sort`, `direction`, filter relevan, serta mengembalikan hasil agregasi dan `totalCount` setelah pemrosesan di server.
- **Kenapa tidak bisa di sisi frontend:** layar tersebut bukan tabel model langsung; mengambil seluruh invoice/attendance/snapshot lalu melakukan slicing di browser tetap membebani database, server, jaringan, dan browser serta berisiko mengubah arti agregasi.

Tabel utama grid jadwal HRD, sisa stock/slot, dan ODP FTTH sudah memakai batas
server-side pada frontend karena sumbernya model langsung. Daftar opsi form dan
tabel pendukung yang masih memerlukan seluruh referensi tetap menjadi kandidat
loader pencarian/paginasi terpisah, tanpa mengubah batas permission atau aturan
stock.

### Loader konfigurasi Grup Authentik perlu mengembalikan catatan konfigurasi
- **Layar:** `/it/identity-groups`
- **Butuh:** `loadAuthentikIntegration()` mengembalikan `notes` bila catatan konfigurasi memang dapat diedit dari halaman tersebut. Saat ini `saveAuthentikAction` menerima dan menyimpan field `notes`, tetapi loader hanya mengembalikan alamat, credential reference, status, dan waktu aktivitas terakhir.
- **Kenapa tidak bisa di sisi frontend:** frontend tidak boleh menebak catatan lama atau mengisi ulang nilai yang tidak dikembalikan DTO. Tanpa field tersebut, menyimpan ulang konfigurasi dari UI dapat mengosongkan catatan sebelumnya.

### Password default wajib ditinjau saat login pertama
- **Layar:** `/login`, shell aplikasi, dropdown notifikasi, dan `/profile`
- **Butuh:** setiap akun yang menerima password default dari IT, termasuk jalur provisioning Mailcow, harus disimpan dengan `mustChangePassword = true`. Login pertama tidak boleh menghapus flag; reset password oleh admin harus mengaktifkannya kembali; hanya perubahan password yang berhasil yang boleh mengubahnya menjadi `false`.
- **Kenapa tidak bisa di sisi frontend:** frontend hanya dapat menampilkan peringatan berdasarkan `CurrentUser.mustChangePassword`. Frontend tidak menerima password, hash, atau riwayat password, dan tidak dapat menentukan apakah password yang digunakan masih default. Data lama dengan flag yang salah perlu diperbaiki oleh backend/data maintenance.




---

## Selesai

### Kartu pegawai — kontrak QR masih diperlukan
- **Layar:** `/hrd/employees/[id]`
- **Butuh:** loader kartu mengembalikan `qrSvg` atau `verificationUrl` yang dibuat server untuk setiap kartu, atau kontrak resmi yang aman untuk memanggil `cardQrSvg` tanpa mengirim token mentah ke UI.
- **Kenapa tidak bisa di sisi frontend:** `loadEmployeeCards()` saat ini hanya mengembalikan metadata kartu dan tidak mengembalikan `publicToken`; frontend tidak boleh mengambil token dengan query database langsung atau membuat QR dari NIK/nama.

Frontend sudah menyediakan preview kartu dua sisi ISO B4, rotasi manual, halaman scan publik, dan route print duplex. Sampai `qrSvg` resmi tersedia, preview menampilkan status `QR belum tersedia` dan print fisik tetap ditahan. Kontrak yang direkomendasikan: tambahkan `qrSvg: string | null` pada hasil `loadEmployeeCards()` dengan SVG yang dibuat server-side.

### Item Master — kontrak field katalog sudah tersedia
- **Layar:** `/inventory/items`
- **Status:** `saveItemAction` sudah menerima dan memvalidasi `supplierId`, `purchaseCost`, `salePrice`, dan `condition` (`GOOD`/`SECOND`) saat membuat atau mengubah item.
- **Catatan frontend:** supplier nonaktif tetap perlu dikembalikan sebagai opsi ketika item lama sedang diedit. Field yang tidak dikirim dipertahankan; nilai kosong hanya menghapus bila memang dikirim sebagai penghapusan sengaja.

**Terjawab (Fase 74).** `saveItemAction` menerima `supplierId`, `purchaseCost`, `salePrice`, dan `condition`. Pemasok diperiksa keberadaannya; bidang yang tidak dikirim dibiarkan apa adanya. Lihat §41.4.

### NetworkPort — makna jumlah ONU
- **Layar:** `/noc/devices`
- **Status:** angka ONU harus diberi label “ONU online”. LibreNMS menghapus ONU yang tidak lagi dilaporkan, sehingga angka tersebut bukan jumlah pelanggan dan bukan inventaris perangkat terpasang.
- **Catatan frontend:** panel perangkat memakai `loadRingkasanPort(deviceId)` dan tidak mengubah loader atau aturan sinkronisasi.

### Form edit Customer perlu kontrak PII resmi (§34)
- **Layar:** `/crm/customers/[id]`
- **Butuh:** `updateCustomerAction` menerima `identityNumber` dan `birthDate` secara opsional. Field yang tidak dikirim harus dipertahankan; nilai kosong hanya menghapus data bila user memang sengaja mengosongkannya. Backend perlu memvalidasi NIK tepat 16 digit, keunikan NIK, dan tanggal lahir yang valid.
- **Kenapa tidak bisa di sisi frontend:** data raw hanya boleh dibaca dan ditulis oleh user yang memiliki izin edit customer serta `customers.pii_view`, dengan audit log perubahan. User tanpa izin PII tidak boleh menerima nilai raw atau mengirim kembali nomor telepon/email yang sudah dimasking dari form. Frontend tidak menambahkan input NIK/tanggal lahir sampai loader dan action resmi siap.

**Terjawab (Fase 74).** `updateCustomerAction` menerima `identityNumber` dan `birthDate`, memeriksa 16 digit dan keunikan NIK, serta mempertahankan bidang yang tidak dikirim. Ditambah satu hal yang belum diminta tetapi ternyata lebih mendesak: nilai bertopeng yang kembali dari formulir ditolak, sebab tanpa itu petugas tanpa izin PII menimpa nomor telepon asli dengan bintang tanpa galat apa pun. Lihat §41.1.

### Master Supplier memerlukan action resmi
- **Layar:** `/inventory/suppliers`
- **Butuh:** loader pemasok permission-scoped serta action resmi untuk membuat, mengubah, dan mengaktifkan/menonaktifkan Supplier dengan field `code`, `name`, `phone`, `email`, `address`, `website`, `notes`, dan `isActive`. Gunakan permission existing `items.manage`, validasi kode unik, dan audit log untuk perubahan master.
- **Kenapa belum dibuat form:** backend saat ini baru membuat Supplier melalui Impor Katalog dan belum menyediakan `saveSupplierAction`. Frontend hanya menampilkan daftar read-only agar tidak memberi kesan perubahan tersimpan padahal action belum ada.

**Terjawab (Fase 74).** `saveSupplierAction` dan `toggleSupplierAction`, izin `items.manage`, kode unik, audit log. Pemasok dinonaktifkan bukan dihapus. Lihat §41.2.

### Verifikasi kontrak PII — selesai, guard UI tetap aktif
- **Layar:** `/crm/customers/[id]`
- **Status:** Opus sudah memperbaiki preservasi field yang tidak dikirim dan penjagaan sisi tulis `customers.pii_view` pada `updateCustomerAction` (`fe1c6ba`). Frontend sekarang menampilkan NIK/tanggal lahir hanya bagi user dengan izin lihat PII, dan hanya membuatnya editable bersama `customers.edit`.
- **Guard frontend:** user tanpa akses PII tidak menerima raw atau nilai masking di form identitas. Field yang tidak ditampilkan tidak dikirim, validasi kenyamanan NIK/tanggal dilakukan di browser, dan server tetap menjadi validasi final.

## Fase 85 — Kontrak yang masih diperlukan

### Riwayat audit per customer
- **Layar:** `/crm/customers/[id]`
- **Butuh:** loader audit permission-scoped berdasarkan `entityType` dan `entityId`, dengan actor, waktu, aksi, serta ringkasan perubahan yang aman untuk ditampilkan.
- **Kenapa tidak bisa di sisi frontend:** mengambil seluruh audit log lalu menyaring di browser dapat membocorkan aktivitas lintas entitas dan melanggar batas akses.

### Konteks Merchant dan isolir
- **Layar:** detail customer dan laporan operasional
- **Butuh:** kontrak resmi untuk relasi Merchant yang ingin ditampilkan pada customer/subscription, serta ringkasan ServiceSuspension yang menjelaskan status atau tanggal isolir aktif.
- **Kenapa tidak bisa di sisi frontend:** Merchant saat ini terhubung melalui Payment dan ServiceSuspension adalah rangkaian event; frontend tidak boleh menebak merchant utama atau mengubah event menjadi satu tanggal.

### Laporan tiket customer
- **Layar:** `/crm/customers/[id]` dan dashboard laporan
- **Butuh:** loader agregasi permission-scoped untuk jumlah tiket, status, SLA/MTTR, dan rentang waktu dengan filter yang terdokumentasi.
- **Kenapa tidak bisa di sisi frontend:** menghitung laporan dari daftar tiket parsial dapat menghasilkan angka salah dan membebani server/browser. Fase 85 hanya membawa konteks customer/subscription saat membuat tiket.
