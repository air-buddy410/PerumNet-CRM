# Keputusan Product Owner — Fase 8–15

**Tanggal dicatat:** 2026-08-10
**Rujukan:** [DESIGN-PHASE-8-BILLING-AND-BEYOND.md](DESIGN-PHASE-8-BILLING-AND-BEYOND.md) §11

> **Cara membaca dokumen ini.** Delapan keputusan di §11 rancangan tidak pernah dicatat resmi
> sebelum implementasi berjalan. Isi di bawah adalah **rekonstruksi dari kode yang sudah jadi** —
> apa yang de-facto sudah dipilih. Statusnya:
>
> - **TERKUNCI** — sudah tertanam di skema/kode dan berjalan. Perlu persetujuan PO untuk diresmikan.
> - **DITUNDA** — sengaja dibiarkan generik, belum perlu diputuskan sekarang.
> - **BELUM DIPUTUSKAN** — perlu keputusan PO, dan ada konsekuensi bila terus dibiarkan.

## 1. Merchant — entitas baru ✅ TERKUNCI

Merchant dibuat sebagai model tersendiri, bukan dipetakan ke `Division`/`Area`.

Field: `code`, `name`, `contactName`, `phone`, `address`, `latitude`/`longitude`, `isPaymentPoint`, `cashbookId` (kas setoran mitra, jembatan ke CoA), `feePercent`, `isActive`.

**Alasan:** merchant menjalankan tiga peran sekaligus (unit penagih, titik pembayaran, pemilik kas) yang tidak dimiliki `Division`. Memaksakannya ke `Division` akan mencampur struktur organisasi internal dengan mitra eksternal.

## 2. Sales mitra — User dengan role SALES ✅ TERKUNCI

Tidak ada model `SalesAgent`. Sales tetap `User` dengan role SALES.

**Konsekuensi:** setiap sales mitra (termasuk BUMDES) butuh akun sistem. Bila nanti ada mitra yang tidak boleh punya akses login sama sekali, keputusan ini perlu ditinjau ulang.

## 3. Komisi kolektor — persen per merchant ✅ TERKUNCI

`Merchant.feePercent` (persen tunggal per merchant), dibukukan sebagai liabilitas lewat PostingRule.

**Belum didukung:** komisi berjenjang, komisi per paket, atau komisi nominal tetap. Bila skema komisi nyata lebih rumit dari satu persen datar, ini perlu diperluas sebelum go-live.

## 4. Ambang isolir — dua ambang + gerbang tanggal ✅ TERKUNCI

`DunningPolicy` menyediakan **dua ambang yang berjalan berdampingan**:
- `isolateAfterDays` — hari lewat jatuh tempo
- `maxUnpaidInvoices` — jumlah invoice tertunggak

Ditambah `graceDays` (0–60) dan digerbangi `BillingProfile.isolirDay` per langganan: evaluasi hanya mengisolir pada atau setelah tanggal tersebut.

**Yang perlu kamu tetapkan:** nilai konkretnya. Struktur sudah ada, angkanya belum. Sebelum dipakai produksi, jalankan **dry-run** dan periksa daftar yang akan terisolir.

## 5. Nomor invoice — format baru ✅ TERKUNCI

Format `INV-YYYYMM-####` (contoh `INV-202608-0001`).

**Catatan teknis:** nomor dihasilkan dari `count()` invoice berprefiks sama, lalu +1. Aman untuk satu run yang berjalan sekuensial. **Tidak aman bila dua proses membuat invoice bersamaan** — keduanya bisa mendapat nomor sama dan ditolak unique constraint, sehingga proses gagal di tengah. Tidak merusak data (idempotensi menjaga rerun tetap benar), tapi perlu diperbaiki sebelum ada beberapa operator membuat invoice manual berbarengan.

## 6. PPN — per langganan ✅ TERKUNCI

`BillingProfile.taxPercent` per langganan, di-*snapshot* ke `Invoice.taxPercent` saat terbit sehingga invoice lama tidak berubah bila tarif diganti. Pembulatan setengah ke atas ke rupiah bulat.

## 7. Payment gateway — generik ⏸ DITUNDA

`PaymentGatewayTx.provider` menerima `WINPAY|DUITKU|TRIPAY|OTHER`. Tidak ada yang dipilih sebagai default; adapter konkret menunggu kredensial.

**Ini keputusan yang benar untuk sekarang** — tidak ada yang terkunci, tinggal pilih saat kredensial tersedia.

## 8. Retensi data identitas ⚠ BELUM DIPUTUSKAN

Keadaan sekarang:

| Data | Status |
|---|---|
| KTP / NPWP pelanggan | **Tidak disimpan sama sekali** — bagus, minimalisasi data |
| Foto selfie absensi | **Disimpan** (`Attendance.clockInPhotoId`/`clockOutPhotoId` → `Attachment`) |
| Titik & jarak lokasi absensi | **Disimpan** (`clockInLocationId`, `clockInDistanceM`) |

Foto wajah karyawan dan jejak lokasi hariannya adalah data pribadi, dan saat ini **tidak ada kebijakan retensi, tidak ada batas akses khusus, dan tidak ada penghapusan otomatis**. Setiap hari sistem berjalan, tumpukannya bertambah.

**Perlu diputuskan:** berapa lama foto absensi disimpan, siapa yang boleh melihatnya, dan apakah dihapus otomatis setelah rekap bulanan disahkan. Ini satu-satunya dari delapan keputusan yang konsekuensinya bertambah berat kalau ditunda.

## Ringkasan untuk PO

| # | Keputusan | Status | Perlu tindakan? |
|---|---|---|---|
| 1 | Merchant entitas baru | TERKUNCI | Setujui |
| 2 | Sales = User role SALES | TERKUNCI | Setujui |
| 3 | Komisi persen per merchant | TERKUNCI | Setujui / perluas bila skema nyata lebih rumit |
| 4 | Isolir dua ambang | TERKUNCI | **Tetapkan angkanya** |
| 5 | Nomor invoice INV-YYYYMM-#### | TERKUNCI | Setujui + perbaiki celah konkurensi |
| 6 | PPN per langganan | TERKUNCI | Setujui |
| 7 | Gateway generik | DITUNDA | Pilih saat kredensial ada |
| 8 | Retensi data identitas | **BELUM** | **Putuskan** |
