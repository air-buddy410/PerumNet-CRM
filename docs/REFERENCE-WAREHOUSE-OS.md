# Referensi — PERUMNET Warehouse OS

**Tanggal:** 2026-08-10
**Sumber:** project `PerumNet Warehouse` (`/Users/air_buddy/Dev Project/Open Code/PerumNet Warehouse/perumnet-warehouse`), berjalan di `localhost:3100`, database PostgreSQL `perumnet-warehouse-postgres-1`
**Sifat:** dokumen acuan — bukan rencana kerja. Rencana penambahannya ada di [PRD-WAREHOUSE-ENHANCEMENT.md](PRD-WAREHOUSE-ENHANCEMENT.md).

Project ini milik sendiri (Next.js + Prisma + PostgreSQL, 88 tabel, ~100 model, 40+ enum). Isinya matang di sisi gudang — jauh lebih dalam dari modul inventory CRM kita. Dokumen ini menyalin **struktur dan master data**-nya sebagai acuan.

> Data operasional tidak disalin. Saat diperiksa, sistem masih berisi data demo (18 item, 0 asset, 0 stock movement, 4 work order), jadi yang bernilai memang master data & rancangannya, bukan isinya.

## 1. Kategori Material (19)

| Kode | Nama | Material Type |
|---|---|---|
| ADP | Adapter | Connector |
| CLS | Closure | Passive Device |
| CSM | Consumable | Consumable |
| DRP | Dropcore | Cable |
| FOC | Kabel Fiber Optic | Cable |
| FSC | Fast Connector | Connector |
| ODC | ODC | Passive Device |
| ODP | ODP | Passive Device |
| OLT | OLT | Network Device |
| ONT | ONU / ONT | Network Device |
| OTH | Lainnya | Other |
| PCH | Patchcord | Cable |
| PGT | Pigtail | Cable |
| PWR | Power Supply | Power |
| RTR | Router | Network Device |
| SFP | SFP | Network Device |
| SPL | Splitter | Passive Device |
| SWT | Switch | Network Device |
| TLS | Tools | Tools |

Pengelompokan dua tingkat: **kategori** (kode 3 huruf) di atas **materialType** (Cable, Connector, Network Device, Passive Device, Power, Consumable, Tools, Other). Modul inventory kita punya `Category` generik tanpa `materialType` — pengelompokan ini layak diadopsi karena spesifik FTTH.

## 2. Tipe Slot Stok (10)

| Kode | Nama | Sistem? |
|---|---|---|
| UNALLOC | Receiving / Unallocated | ✅ terkunci |
| INST | Installation | |
| MNT | Maintenance | |
| MKT | Marketing | |
| PRJ | Project | |
| EMG | Emergency | |
| SPR | Spare | |
| RMA | RMA | |
| DEMO | Demo | |
| OTHER | Other | |

**Konsep intinya:** stok tidak hanya berada di gudang, tapi dialokasikan ke *slot peruntukan*. Barang masuk selalu mendarat di `UNALLOC`, lalu dialokasikan ke slot tujuan. Reservasi work order mengambil dari slot sesuai jenis pekerjaan (instalasi → INST, maintenance → MNT, proyek → PRJ).

Kunci saldo: `{warehouse}:{slot}:{location}:{material}`.

## 3. Tipe Gudang

`CENTRAL` · `BRANCH` · `MINI_STOCK` · `TECHNICIAN_STOCK` · `PROJECT_STOCK`

Stok teknisi diperlakukan sebagai **gudang**, bukan tabel custody terpisah. Di CRM kita, stok teknisi memakai `CustodyLevel` — beda pendekatan, dan perbedaan ini penting saat menyelaraskan.

## 4. Penomoran Dokumen

| Dokumen | Format |
|---|---|
| Work Order | `WO-{WHCODE}-{yyyyMMdd}-{0001}` (prefix gudang bisa dimatikan) |
| WO Issue | `{WO}-ISS-{NN}` |
| IRF | `IRF-{yyyyMMdd}-{0001}` |
| Delivery Order | `DO-{yyyyMMdd}-{0001}` |
| Stock Transfer Order | `STO-{yyyyMMdd}-{0001}` |
| Shipment | `{STO}-SHP-{NN}` |
| Transfer Receipt | `RCV-{yyyyMMdd}-{0001}` |
| Stock Opname | `OPN-{yyyyMMdd}-{0001}` |
| Return Request | `RET-{yyyyMMdd}-{0001}` |

Mekanisme: tabel `DocumentSequence` per (tipe, tanggal), diambil **atomik di dalam transaksi Serializable**. Nomor eksternal (PO vendor/SAP) disimpan terpisah di `externalNumber`.

Bandingkan dengan kita: `StockTransaction.txNumber` memakai `GR-/ISS-/RET-/TRF-/ADJ-YYYYMM-####` — satu format untuk semua jenis, tanpa tabel sequence khusus.

## 5. Status & Enum Penting

**Work Order:** `DRAFT → SUBMITTED → APPROVED → PREPARING → READY → ISSUED → IN_PROGRESS → COMPLETED`, dengan cabang `REVISION_REQUIRED`, `REJECTED`, `CANCELLED`, `PARTIAL`, `RETURNED`.

**Stock Movement:** `IN | OUT | TRANSFER | RETURN | ADJUSTMENT | INSTALLATION | OPNAME`

**Device/Asset:** status perangkat + `TECHNICIAN_STOCK`, `ISSUED`, `AVAILABLE`, `DAMAGED`, `RMA`, `LOST`

**Kondisi return:** `GOOD | USED | DAMAGED | RMA`

**Slot ledger:** `WORK_ORDER_ISSUE`, `BRANCH_RECEIVE`, alokasi, transfer, opname

**Transfer:** `DRAFT → SUBMITTED → APPROVED → IN_TRANSIT → RECEIVED`, dengan `PARTIAL` untuk multi-shipment

## 6. Saldo Inventory

`InventoryBalance` per (material × warehouse) menyimpan empat angka:

| Kolom | Arti |
|---|---|
| `onHand` | fisik ada di gudang |
| `reserved` | sudah dipesan WO yang disetujui |
| `damaged` | rusak, tidak bisa dipakai |
| `inTransit` | dalam perjalanan antar gudang |

Turunan: **`available = onHand − reserved`**.

Ini perbedaan struktural terbesar dengan kita — `StockLevel` kita hanya punya `qty`. Tanpa `reserved`, dua work order bisa menjanjikan barang yang sama.

## 7. Namespace Permission (29 namespace, 271 baris role-permission)

`installation` (17) · `wo` (11) · `requester` (8) · `registration` (7) · `sales` (7) · `slot` (6) · `do` (6) · `sto` (6) · `crm` (6) · `category` (5) · `addon` (4) · `package` (4) · `promo` (4) · `location` (3) · `opname` (2) · `warehouse` (2) · `movement` (2) · `irf` (2) · `sales_team` (2) · `tax` (2) · `inventory` · `master` · `dashboard` · `categories` · `system` · `menu` · `calendar` · `reports` · `vendor`

Role: `SUPER_ADMIN | WAREHOUSE_ADMIN | TECHNICIAN | VENDOR_REQUESTER | PROJECT_REQUESTER | MANAGEMENT`

Menu digerakkan data lewat `MenuDefinition` (90 baris) + preferensi per user.

## 8. Catatan Kualitas Data

Satuan barang tidak konsisten: `unit`, `PC`, `pcs`, `ROL`, `meter`, `M` dipakai bercampur untuk 18 item. Kalau master item ini nanti diimpor ke CRM kita, satuannya perlu dinormalisasi lebih dulu — `Item.unit` kita memakai `pcs | meter | roll | box`.

## 9. Yang Layak Ditiru vs Tidak

**Layak ditiru:**
- Empat kolom saldo (`onHand`/`reserved`/`damaged`/`inTransit`) — mencegah over-commit
- Slot peruntukan + ledger per slot
- Transfer antar gudang tiga langkah (order → shipment → receipt) dengan dukungan parsial
- `DocumentSequence` atomik per tipe+tanggal
- Tanda tangan digital dua pihak pada serah-terima barang
- Portal requester terpisah untuk teknisi/vendor
- Kategori material dua tingkat khas FTTH

**Tidak perlu ditiru:**
- Stok teknisi sebagai tipe gudang — `CustodyLevel` kita sudah menangani ini dan lebih sederhana
- `GoodsReceipt`/`GoodsIssue` legacy yang hidup berdampingan dengan `StockMovement` — duplikasi jalur mutasi
- Duplikasi namespace permission (`category` vs `categories`)
- Satuan barang yang tidak dinormalisasi
