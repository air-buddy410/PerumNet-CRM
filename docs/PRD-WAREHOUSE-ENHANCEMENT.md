# PRD — Pendalaman Modul Warehouse PerumNet CRM

**Tanggal:** 2026-08-10
**Versi:** 1.0 (draft, belum disetujui)
**Sumber banding:** [REFERENCE-WAREHOUSE-OS.md](REFERENCE-WAREHOUSE-OS.md) — project PERUMNET Warehouse OS di `localhost:3100`
**Requirement induk:** [PRD-PerumNet-CRM.md](PRD-PerumNet-CRM.md) §16–§20 (Inventory & Operational)

## 1. Latar Belakang

Modul Inventory & Operational CRM kita (Fase 3) sudah menutup dasar: item master, gudang, perangkat serial, transaksi stok ber-posting, custody teknisi, work order, dan opname. Semuanya bertumpu pada aturan yang benar — stok hanya berubah lewat transaksi yang diposting, transaksi posted immutable, koreksi lewat reversal.

Perbandingan dengan PERUMNET Warehouse OS menunjukkan modul kita **benar tapi dangkal** untuk operasi gudang harian sebuah ISP. Yang hilang bukan fitur pemanis, melainkan mekanisme yang menjaga janji stok tetap dapat dipenuhi dan serah-terima barang dapat dipertanggungjawabkan.

Contoh paling konkret: `StockLevel` kita hanya menyimpan `qty`. Dua work order yang disetujui bisa sama-sama menjanjikan ONT terakhir, dan sistem tidak menolak keduanya — masalah baru ketahuan saat teknisi sampai di gudang.

## 2. Tujuan & Non-Tujuan

**Tujuan**
1. Stok yang sudah dijanjikan tidak bisa dijanjikan ulang.
2. Perpindahan barang antar gudang punya status "dalam perjalanan" yang jelas, dan bisa diterima bertahap.
3. Setiap serah-terima barang punya dokumen bernomor dan bukti tanda tangan kedua pihak.
4. Teknisi dan vendor bisa meminta serta mengembalikan material sendiri tanpa lewat admin.
5. Stok bisa dialokasikan menurut peruntukan (instalasi, maintenance, proyek, emergency), bukan hanya per gudang.

**Non-tujuan**
- Mengganti model custody teknisi yang sudah ada dengan "gudang teknisi".
- Membangun ulang work order — WO yang ada diperluas, bukan diganti.
- Menyalin portal, tampilan, atau kode dari Warehouse OS.
- Valuasi inventory & harga pokok — tetap menunggu keputusan PO (TECHNICAL-PLAN §9.6).

## 3. Persona

| Persona | Kebutuhan utama |
|---|---|
| Admin gudang | Tahu stok yang benar-benar bebas; menyiapkan & menyerahkan barang dengan bukti |
| Teknisi | Minta material dari lapangan, lihat stok yang dipegang, kembalikan sisa |
| Vendor / kontraktor | Ajukan kebutuhan proyek berikut lampiran, pantau statusnya |
| Koordinator operasional | Setujui permintaan, pantau barang dalam perjalanan |
| Manajemen | Nilai persediaan, pergerakan, dan barang tertahan |

## 4. Ringkasan Gap

| # | Kemampuan | Warehouse OS | CRM kita | Prioritas |
|---|---|---|---|---|
| G1 | Saldo `onHand`/`reserved`/`damaged`/`inTransit` | ada | hanya `qty` | **P0** |
| G2 | Reservasi stok saat WO disetujui | ada | tidak ada | **P0** |
| G3 | Transfer antar gudang 3 langkah + parsial | ada | satu transaksi langsung | **P0** |
| G4 | Penomoran dokumen per tipe (sequence atomik) | ada | satu format umum | **P0** |
| G5 | Delivery Order | ada | tidak ada | P1 |
| G6 | IRF + tanda tangan digital 2 pihak | ada | tidak ada | P1 |
| G7 | Portal requester (teknisi/vendor/proyek) | ada | tidak ada | P1 |
| G8 | Return material 2 jalur + kondisi GOOD/USED/DAMAGED/RMA | ada | return via transaksi admin saja | P1 |
| G9 | Slot peruntukan + ledger per slot | ada | tidak ada | P2 |
| G10 | Lokasi fisik Rack → Bin | ada | tidak ada | P2 |
| G11 | Tipe gudang & koordinat | ada | tidak ada | P2 |
| G12 | Opname per slot + scan serial + validasi snapshot | ada | opname dasar | P2 |
| G13 | Barcode/QR & katalog material | ada | tidak ada | P3 |
| G14 | Scope gudang per user | ada | tidak ada | P3 |
| G15 | Kategori material dua tingkat (materialType) | ada | kategori generik | P3 |

## 5. Kebutuhan Fungsional

### F1 — Saldo stok berdimensi (P0)

`StockLevel` diperluas: `onHand`, `reserved`, `damaged`, `inTransit`. Nilai `available` **selalu turunan** (`onHand − reserved`), tidak pernah disimpan sebagai kolom yang bisa menyimpang.

- Semua tampilan stok memakai `available`, bukan `onHand`.
- Keempat angka hanya berubah lewat transaksi yang diposting.
- Tersedia fungsi rekonsiliasi yang menghitung ulang saldo dari ledger dan melaporkan selisih.

### F2 — Reservasi (P0)

Saat work order disetujui, kebutuhan materialnya **direservasi**: `reserved` bertambah sebesar qty yang disetujui.

- Persetujuan ditolak bila `available` tidak mencukupi, dengan pesan menyebut item dan jumlah kurangnya.
- Pembatalan WO melepas seluruh reservasi.
- Pengeluaran barang mengurangi `onHand` dan `reserved` bersamaan.
- Reservasi tidak boleh membuat `reserved > onHand` dalam kondisi apa pun.

### F3 — Transfer antar gudang tiga langkah (P0)

`StockTransferOrder → Shipment → Receipt`, menggantikan transfer sekali jalan.

- Kirim: `onHand` & `reserved` gudang asal berkurang, `inTransit` gudang tujuan bertambah.
- Terima: `inTransit` berkurang, `onHand` bertambah.
- **Penerimaan bertahap didukung** — STO tetap `PARTIAL` sampai seluruh qty diterima.
- Barang dalam perjalanan terlihat di laporan dan tidak pernah hilang dari pembukuan.
- Perangkat serial ikut berpindah dan riwayatnya tercatat.

### F4 — Penomoran dokumen (P0)

Tabel `DocumentSequence` per (tipe, tanggal), diambil atomik di dalam transaksi.

| Dokumen | Format |
|---|---|
| Delivery Order | `DO-{yyyyMMdd}-{0001}` |
| IRF | `IRF-{yyyyMMdd}-{0001}` |
| Stock Transfer | `STO-{yyyyMMdd}-{0001}` |
| Shipment | `{STO}-SHP-{NN}` |
| Receipt | `RCV-{yyyyMMdd}-{0001}` |
| Return | `RET-{yyyyMMdd}-{0001}` |

Nomor dokumen eksternal (PO vendor) disimpan di kolom terpisah, tidak dicampur.

> Catatan: pola ini sekaligus memperbaiki celah konkurensi bergaya `count()+1` yang sudah teridentifikasi pada penomoran invoice (lihat `DECISIONS-PHASE-8.md` §5). Sebaiknya `DocumentSequence` dipakai ulang untuk invoice.

### F5 — Delivery Order (P1)

Dokumen penyerahan barang, sumbernya work order atau transfer order.

- Maksimal satu DO aktif per WO.
- Qty DO = `disetujui − sudah dikeluarkan`.
- Status `DRAFT → APPROVED → SHIPPED/RECEIVED` atau `CANCELLED`.

### F6 — IRF & tanda tangan digital (P1)

Satu IRF otomatis per sesi pengeluaran barang (termasuk pengeluaran sebagian).

- Dua tanda tangan: penerima dan admin gudang, **diambil sebelum transaksi database dijalankan**.
- Tanda tangan disimpan sebagai berkas gambar lewat model `Attachment` yang sudah ada, dengan metadata peran penanda tangan.
- Dapat dicetak, memuat rincian item beserta nomor serial.

### F7 — Portal requester (P1)

Antarmuka ringkas untuk teknisi, vendor, dan tim proyek — berbagi basis kode dengan aplikasi utama, dibatasi permission.

- Buat permintaan material bertahap: pekerjaan → lokasi → material (dengan ketersediaan langsung) → tinjau → kirim.
- Vendor dapat melampirkan berkas (PDF/DOCX/XLSX/JPG/PNG, ≤8MB).
- Lihat permintaan sendiri saja; batalkan atau ajukan ulang bila diminta revisi.
- Lihat stok yang sedang dipegang, dan ajukan pengembalian sisa.
- Katalog material **tanpa data harga internal**.

### F8 — Return material dua jalur (P1)

1. **Pengajuan mandiri** oleh pemegang barang, dengan kondisi `GOOD | USED | DAMAGED | RMA`.
2. **Verifikasi admin** — diterima: `GOOD`/`USED` masuk `onHand`, `DAMAGED`/`RMA` masuk `damaged`; ditolak: alasan dicatat.

Perangkat serial hanya boleh dikembalikan oleh pemegangnya yang tercatat.

### F9 — Slot peruntukan (P2)

Stok dialokasikan ke slot: `UNALLOC` (sistem, tujuan barang masuk), `INST`, `MNT`, `MKT`, `PRJ`, `EMG`, `SPR`, `RMA`, `DEMO`, `OTHER`.

- Kunci saldo `{gudang}:{slot}:{lokasi}:{material}`.
- Ledger per slot bersifat append-only.
- Perpindahan antar slot di atas ambang tertentu memerlukan approval — pakai `ApprovalRule` yang sudah ada.
- Slot sistem tidak dapat dinonaktifkan; slot lain hanya bila saldonya nol.

### F10 — Lokasi fisik & atribut gudang (P2)

- Hierarki `Warehouse → Rack → Bin`, dan `WarehouseLocation` untuk area penyimpanan.
- `Warehouse.type`: `CENTRAL | BRANCH | MINI_STOCK | PROJECT_STOCK`.
- Koordinat gudang untuk peta.

> Ini menjawab pertanyaan terbuka TECHNICAL-PLAN §9.7 (hierarki multi-warehouse).

**Keputusan yang dipertahankan:** stok teknisi tetap memakai `CustodyLevel`, **tidak** dijadikan tipe gudang. Model kita lebih sederhana dan sudah berjalan.

### F11 — Opname yang lebih ketat (P2)

- Cakupan: gudang + slot opsional + lokasi opsional + kategori.
- Snapshot `systemStock` dan jumlah serial saat sesi dibuka.
- Serial dihitung lewat pemindaian; jumlah wajib cocok dan terdaftar dalam cakupan.
- **Sesi hanya bisa diselesaikan bila semua baris terhitung dan saldo tidak berubah sejak snapshot.** Bila berubah, sesi harus dihitung ulang.
- Perangkat serial yang tidak terpindai ditandai hilang.

### F12 — Pendukung (P3)

- Barcode/QR per item; pemindaian dipakai di opname dan pengambilan barang.
- `UserWarehouseScope` — admin dibatasi pada gudang tertentu.
- `Category.materialType` (Cable, Connector, Network Device, Passive Device, Power, Consumable, Tools, Other) + 19 kategori acuan.
- Normalisasi satuan item.

## 6. Aturan Bisnis Non-Negotiable

Berlaku aturan `AGENTS.md` dan PRD §7/§53 tanpa pengecualian:

1. Saldo stok **tidak pernah** diedit langsung — hanya berubah lewat transaksi yang diposting.
2. Transaksi posted immutable; koreksi lewat reversal.
3. Setiap mutasi wajib `requirePermission()` + `logAudit()`.
4. Pembuat transaksi tidak boleh menyetujui transaksinya sendiri.
5. Seluruh alur multi-langkah dijalankan dalam satu transaksi database. Pengeluaran barang, transfer, dan opname memerlukan tingkat isolasi tertinggi yang tersedia agar dua proses tidak mengambil stok yang sama.
6. Ledger slot dan riwayat serial bersifat append-only.
7. Tanda tangan diambil **sebelum** transaksi dijalankan — bila transaksi gagal, tidak ada tanda tangan yatim yang seolah mengesahkan penyerahan yang tidak terjadi.

## 7. Alur Utama

```
Permintaan material
  Requester buat WO ──> Approve (reservasi stok) ──> Siapkan ──> Siap
     ──> Buat DO ──> Approve DO ──> Serah terima + 2 tanda tangan
     ──> IRF terbit otomatis ──> Stok keluar, ledger & serial tercatat
     ──> Sisa material dikembalikan ──> Verifikasi admin ──> Stok kembali

Transfer antar gudang
  STO ──> Approve (reservasi di gudang asal) ──> Kirim (inTransit)
     ──> Terima sebagian/seluruhnya ──> Stok masuk gudang tujuan
```

## 8. Non-Fungsional

| Area | Persyaratan |
|---|---|
| Konsistensi | Tidak boleh ada jalur yang mengubah stok di luar service layer |
| Konkurensi | Dua pengeluaran bersamaan atas item yang sama tidak boleh membuat stok minus |
| Jejak audit | Setiap perubahan saldo dapat ditelusuri ke dokumen dan orangnya |
| Kinerja | Daftar stok dengan ribuan item tetap responsif; saldo dibaca dari tabel saldo, bukan agregasi ledger |
| Mobile | Portal requester dipakai di lapangan — harus jalan di layar kecil dan jaringan lambat |
| Berkas | Lampiran & tanda tangan lewat model `Attachment` yang ada, dengan batas ukuran dan tipe |

## 9. Fase Implementasi

| Fase | Isi | Alasan urutan |
|---|---|---|
| **16** | F1 saldo berdimensi, F2 reservasi, F4 penomoran dokumen | Fondasi integritas; tanpa ini sisanya menumpuk di atas dasar yang bocor |
| **17** | F3 transfer tiga langkah | Butuh `inTransit` dari Fase 16 |
| **18** | F5 DO, F6 IRF + tanda tangan, F8 return dua jalur | Alur serah-terima utuh |
| **19** | F7 portal requester | Butuh alur Fase 18 sudah jadi |
| **20** | F9 slot, F10 lokasi fisik, F11 opname ketat | Kedalaman gudang |
| **21** | F12 pendukung | Pelengkap |

Migrasi data: penambahan kolom saldo diisi dari `qty` yang ada (`onHand = qty`, sisanya 0), lalu dijalankan rekonsiliasi terhadap ledger.

## 10. Keputusan yang Perlu Diambil

1. **Ambang approval transfer slot** — berdasarkan qty, nilai, atau keduanya?
2. **Kebijakan reservasi kedaluwarsa** — apakah reservasi WO yang menganggur sekian hari dilepas otomatis?
3. **Penyimpanan tanda tangan** — di dalam repo (seperti Warehouse OS) atau object storage? Terkait TECHNICAL-PLAN §9.8 yang masih terbuka.
4. **Akses portal untuk vendor eksternal** — akun penuh, atau tautan terbatas?
5. **Valuasi persediaan** (moving average vs FIFO) — masih terbuka dari §9.6, dan menentukan bentuk laporan nilai persediaan.
6. **Impor master item** dari Warehouse OS — ikut kategori & satuan mereka, atau normalisasi dulu?

## 11. Kriteria Penerimaan

- Dua work order tidak bisa mereservasi unit yang sama; yang kedua ditolak dengan pesan jelas.
- Barang yang dikirim antar gudang selalu terlihat di salah satu dari tiga tempat: gudang asal, perjalanan, atau gudang tujuan — tidak pernah lenyap.
- Transfer dapat diterima bertahap dan tetap terbuka sampai lengkap.
- Setiap pengeluaran barang menghasilkan IRF bernomor dengan dua tanda tangan.
- Teknisi dapat mengajukan permintaan dan pengembalian sendiri tanpa admin.
- Sesi opname menolak diselesaikan bila saldo berubah sejak snapshot.
- Rekonsiliasi saldo terhadap ledger menghasilkan nol selisih pada data uji.

## 12. Yang Belum Diverifikasi

Dokumen ini disusun dari **PRD, skema database, dan master data** project Warehouse OS. Alur di antarmukanya belum ditelusuri langsung karena butuh login, dan kredensial tidak dimasukkan dari sisi ini. Bila ada perilaku UI yang berbeda dari dokumentasinya, dokumen ini perlu dikoreksi.
