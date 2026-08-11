# Rencana Implementasi — Terminasi Pelanggan & Recovery Perangkat

**Tanggal:** 2026-08-11
**Sumber requirement:** [PRD-terminasi-pelanggan-dan-recovery-perangkat.md](PRD-terminasi-pelanggan-dan-recovery-perangkat.md) v1.0
**Status:** Fase 28–32 SELESAI diimplementasikan (2026-08-11). Dokumen ini
dipertahankan sebagai catatan rancangan; bagian §7 diperbarui dengan keputusan
yang akhirnya diambil.

## 0. Koreksi atas §20.1 PRD

PRD menyatakan *"struktur schema, migrasi additive, seed, helper server, UI terminasi/recovery, permission, dan alur inti telah tersedia pada source lokal"*.

**Itu tidak akurat.** Diperiksa langsung ke kode:

| Yang diklaim ada | Kondisi sebenarnya |
|---|---|
| Model `CustomerTermination`, `DeviceRecoveryIssue`, `DeviceRecoveryItem`, `DeviceRecoveryAttempt`, `DeviceInspection`, `DeviceRecoverySetting` | **Nol** di `prisma/schema.prisma` |
| Route `/terminations`, `/device-recoveries`, `/portal/recoveries` | **Tidak ada** |
| Permission `termination.*`, `device_recovery.*` | **Tidak ada** di `constants.ts` maupun seed |

Juga tidak ada di project `PerumNet Warehouse`. Jadi modul ini **belum dikerjakan sama sekali**, dan §20.1 sebaiknya dikoreksi sebelum dokumen dinaikkan statusnya dari Draft.

## 1. Penyelarasan Istilah

PRD ditulis memakai kosakata **Warehouse OS**, bukan kosakata CRM ini. Pemetaan wajib disepakati sebelum implementasi, supaya tidak lahir model kembar untuk hal yang sama.

| Istilah PRD | Padanan di CRM kita | Catatan |
|---|---|---|
| `Asset` | **`SerializedDevice`** | Sudah punya serial, MAC, status, lokasi, custodian, dan tautan pelanggan/langganan |
| `InventoryBalance` | **`StockLevel`** | Sudah berdimensi `onHand`/`reserved`/`damaged`/`inTransit` (Fase 16–17) |
| `StockLedger` | **`StockTransaction` + `StockTransactionLine`** | Immutable, reversal-only |
| `SlotBalance` | **`SlotAllocation`** | Fase 20 |
| Slot ledger | **`SlotLedger`** | Append-only, Fase 20 |
| `DocumentAttachment` | **`Attachment`** | Sudah dipakai foto bukti & tanda tangan |
| `DocumentSignature` | **`DocumentSignature`** | Sama — sudah ada sejak Fase 18 |
| Customer 360 `/customers/[id]` | **`/crm/customers/[id]`** | Konvensi route kita bermodul |

**Route yang diusulkan**, mengikuti struktur folder yang sudah berjalan:

| PRD | Usulan kita |
|---|---|
| `/terminations` | `/crm/terminations` |
| `/device-recoveries` | `/inventory/device-recoveries` |
| `/portal/recoveries` | `/portal/recoveries` (portal Fase 19 sudah ada) |

## 2. Yang Sudah Ada dan Dipakai Ulang

Sebagian besar fondasi PRD ini kebetulan sudah kita bangun di Fase 16–27:

| Kebutuhan PRD | Sudah tersedia |
|---|---|
| Nomor `TRM-`/`DRI-` aman terhadap request bersamaan (§11.1) | `DocumentSequence` + `nextDocumentNumber()` — Fase 16 |
| Tanda tangan pelanggan/teknisi | `DocumentSignature` — Fase 18 |
| Slot gudang, saldo slot, ledger append-only | Fase 20 |
| Pelepasan port ODP | `OdpPort.subscriptionId` + `status` — Fase 13 |
| Work Order untuk penarikan | `WorkOrder` tipe **`DEVICE_RETRIEVAL` sudah ada** — tidak perlu tipe baru |
| Approval + segregation of duties | Fase 1 |
| Audit log sebelum–sesudah | `logAudit()` |
| Notifikasi ke peran tertentu | Fase 15 |
| SLA & eskalasi berbasis worker | `ScheduledTask` — Fase 27 |
| Status langganan `TERMINATED` | Sudah ada di `SUBSCRIPTION_STATUSES` |

**Konsekuensi:** yang benar-benar baru hanya lapisan terminasi/recovery-nya. Sisanya menempel ke mesin yang sudah teruji.

## 3. Perubahan pada Model yang Ada

### 3.1 `SerializedDevice.ownership` — paling kritis

Aturan bisnis nomor 1 PRD: *"hanya aset ber-ownership COMPANY yang dapat masuk recovery issue"*. **Field ini tidak ada.** Tanpa itu, aturan tersebut mustahil ditegakkan dan perangkat milik pelanggan bisa ikut ditarik — risiko tertinggi di §21 PRD.

```prisma
/// COMPANY = milik PERUMNET, wajib ditarik saat terminasi.
/// CUSTOMER = milik pelanggan, TIDAK boleh masuk recovery.
ownership String @default("COMPANY")
```

**Backfill wajib disertai keputusan**, bukan asumsi diam-diam. `default("COMPANY")` membuat seluruh perangkat lama otomatis dianggap milik perusahaan — itu pilihan konservatif yang disarankan §20.2 PRD, tetapi berarti perangkat pelanggan yang terlanjur tercatat akan ikut tertarik bila tidak dikoreksi lebih dulu. Perlu daftar tinjau sebelum modul ini dipakai produksi.

### 3.2 Status & kondisi perangkat

`DEVICE_STATUSES` sekarang: `AVAILABLE`, `IN_TRANSIT`, `IN_CUSTODY`, `INSTALLED`, `UNDER_INSPECTION`, `DAMAGED`, `LOST`, `SCRAPPED`.

Ditambah: **`RECOVERY_PENDING`**, **`RETURN_IN_TRANSIT`**, **`QUARANTINED`**, **`RMA`**.

> `IN_TRANSIT` yang ada milik transfer antar gudang (Fase 17). `RETURN_IN_TRANSIT` sengaja dibedakan — dua hal berbeda yang kalau disatukan akan mengaburkan laporan.

`condition` sekarang `GOOD|DAMAGED` → ditambah **`SECOND`** (aturan §13.8: hasil layak selalu SECOND, bukan NEW).

### 3.3 Tipe slot baru

Fase 20 menyediakan UNALLOC/INST/MNT/MKT/PRJ/EMG/SPR/RMA/DEMO/OTHER. PRD butuh dua lagi:

- **`QUARANTINE`** — wajib, tujuan seluruh penerimaan recovery
- **`SECOND`** — perangkat layak pakai ulang

Keduanya di-seed idempoten seperti tipe slot lain.

### 3.4 Permission

Sepuluh permission baru sesuai §12 PRD: `termination.create|view|approve|cancel` dan `device_recovery.assign|pickup|receive|inspect|dispose|escalate`.

Pemetaan awal ke peran yang ada: CS/`customer_service` → create/view · `management` → approve/escalate/dispose · `technician` → pickup · `warehouse` → receive/inspect/assign.

## 4. Model Baru

```prisma
model CustomerTermination {
  id            String   @id @default(cuid())
  terminationNumber String @unique         // TRM-YYYYMMDD-XXXX
  customerId    String
  subscriptionId String
  reason        String
  effectiveDate DateTime
  warehouseToId String                     // gudang penerima
  status        String   @default("DRAFT") // DRAFT|SUBMITTED|APPROVED|EFFECTIVE|REJECTED|CANCELLED
  snapshot      Json                       // §11.2 — pelanggan, layanan, jaringan, perangkat
  approvalRequestId String? @unique        // pakai approval engine yang ada
  decidedById   String?
  decidedAt     DateTime?
  decisionNote  String?
  createdById   String
  createdAt     DateTime @default(now())

  recovery DeviceRecoveryIssue?
  @@index([status, effectiveDate])
}

model DeviceRecoveryIssue {
  id             String   @id @default(cuid())
  recoveryNumber String   @unique          // DRI-YYYYMMDD-XXXX
  terminationId  String   @unique          // tepat satu terminasi
  workOrderId    String   @unique          // tepat satu WO DEVICE_RETRIEVAL
  warehouseToId  String
  status         String   @default("OPEN") // OPEN|ASSIGNED|IN_PROGRESS|PARTIAL|RECOVERED|INSPECTION|COMPLETED
  assigneeId     String?
  scheduledAt    DateTime?
  slaDueAt       DateTime?
  physicalDisconnectedAt DateTime?         // gerbang pelepasan port ODP
  physicalDisconnectedById String?
  completedAt    DateTime?

  items    DeviceRecoveryItem[]
  attempts DeviceRecoveryAttempt[]
  @@index([status, slaDueAt])
}

model DeviceRecoveryItem {
  id          String  @id @default(cuid())
  recoveryId  String
  deviceId    String                       // SerializedDevice
  /// Snapshot saat approval — tidak ikut berubah bila master data diperbarui.
  snapshotSerial String
  snapshotMac    String?
  snapshotItemName String
  actualSerial String?                     // dicatat teknisi di lapangan
  actualMac    String?
  mismatchNote String?                     // wajib bila actual ≠ snapshot
  status      String @default("RECOVERY_PENDING")
  finalDecision String?                    // LAYAK_DIGUNAKAN|PERLU_PERBAIKAN|RUSAK|SCRAP|TIDAK_KEMBALI
  receivedAt  DateTime?
  receivedById String?

  inspection DeviceInspection?
  @@unique([recoveryId, deviceId])
  @@index([status])
}

model DeviceRecoveryAttempt {
  id          String   @id @default(cuid())
  recoveryId  String
  attemptAt   DateTime @default(now())
  result      String                        // BERHASIL|TIDAK_DI_TEMPAT|DITOLAK|GAGAL_LAIN
  note        String?
  latitude    Float?
  longitude   Float?
  byUserId    String
  @@index([recoveryId, attemptAt])
}

model DeviceInspection {
  id           String   @id @default(cuid())
  itemId       String   @unique
  checklist    Json                         // casing, boot, reset, LAN/WiFi, optical, aksesori
  decision     String
  note         String
  inspectorId  String
  inspectedAt  DateTime @default(now())
}

model DeviceRecoverySetting {
  id           String @id @default(cuid())
  slaDays      Int    @default(7)
  minAttempts  Int    @default(3)           // syarat TIDAK_KEMBALI
  isActive     Boolean @default(true)
}
```

## 5. Pemecahan Fase

| Fase | Isi | Bergantung |
|---|---|---|
| **28** | Fondasi: `ownership` + backfill, status & kondisi perangkat baru, slot QUARANTINE/SECOND, sepuluh permission, `DeviceRecoverySetting` | — |
| **29** | Terminasi: pengajuan, approval atomik (TRM + DRI + WO + snapshot + status aset), penolakan, pembatalan, timeline di Customer 360 | 28 |
| **30** | Penarikan: penugasan teknisi, attempt, pickup penuh/parsial, bukti & tanda tangan, konfirmasi pemutusan fisik → pelepasan port ODP | 29 |
| **31** | Gudang: penerimaan ke QUARANTINE, pencocokan serial/MAC, checklist inspeksi, lima keputusan final, dampak inventory | 30 |
| **32** | SLA & eskalasi lewat worker Fase 27, notifikasi, laporan/KPI §17, cetak berita acara A4 | 31 |
| **33** | Bukti lapangan: foto, tanda tangan, koordinat — beserta pengerasan penyimpanan berkas privat §15 | 30–31 |

Fase 28 sengaja dipisah karena menyentuh data yang sudah ada (`ownership` backfill) — perubahan itu harus mendarat dan diperiksa sendiri sebelum alur di atasnya dibangun.

**Status akhir:** kelima fase selesai. Invariant §6 diverifikasi lewat 43 pemeriksaan
berjalan di dev DB (pengajuan → approval → penarikan → karantina → inspeksi → eskalasi
→ pemberlakuan → pemutusan fisik), ditambah 20 tes unit untuk aturan murni di
`lib/recovery.ts`.

## 6. Invariant yang Ditegakkan di Service Layer

Mengikuti aturan repo ini — ditegakkan di mesin, bukan di UI:

1. Hanya `ownership = COMPANY` yang boleh masuk recovery item.
2. Satu perangkat tidak boleh berada di dua recovery aktif (unique parsial pada status non-final).
3. Approval terminasi bersifat **atomik**: TRM, DRI, WO, snapshot, dan status aset dalam satu transaksi — gagal salah satu berarti tidak ada yang tersimpan.
4. Port ODP hanya dilepas setelah `physicalDisconnectedAt` terisi.
5. Penerimaan gudang **selalu** ke QUARANTINE; `onHand` tersedia tidak bertambah.
6. Hanya `LAYAK_DIGUNAKAN` yang menambah stok tersedia, dan selalu dengan kondisi `SECOND`.
7. `TIDAK_KEMBALI` menuntut SLA terlewati **dan** ≥ `minAttempts` **dan** izin `device_recovery.escalate`.
8. Terminasi `EFFECTIVE` tidak dapat dibatalkan.
9. Seluruh mutasi inventory lewat `StockTransaction` yang diposting — tidak ada penulisan saldo langsung.

## 7. Keputusan yang Perlu Diambil

**Dari PRD (§22), masih terbuka:** Q-001 nilai buku saat eskalasi lost · Q-002 siapa berhak menyetujui scrap · Q-003 SLA per wilayah/jenis · Q-004 salinan berita acara ke pelanggan · Q-005 aksesori sebagai aset serial atau kuantitas.

**Keputusan yang diambil saat implementasi:**

| # | Pertanyaan | Keputusan |
|---|---|---|
| P-1 | Backfill `ownership` | Ya, semua perangkat lama jadi COMPANY (saran konservatif §20.2), **tetapi** disertai jalur koreksi ber-audit + filter kepemilikan di daftar perangkat sebagai daftar tinjau. Wajib ditinjau sebelum produksi. |
| P-2 | Tipe work order | Pakai `DEVICE_RETRIEVAL` yang sudah ada. Tidak ada tipe kembar. |
| P-3 | Route | `/crm/terminations` + `/inventory/device-recoveries`, konsisten dengan struktur bermodul yang sudah berjalan. |
| P-4 | Alur persetujuan | Pakai approval engine yang ada, satu langkah ke Management. SoD-nya ikut terpakai gratis. |

**Yang masih terbuka (tidak diputuskan sendiri oleh implementasi):**

- **Q-001 nilai buku saat eskalasi lost.** `markNotReturned()` menandai perangkat LOST dan menutup kasusnya, tetapi **tidak** membuat jurnal apa pun. Angka kerugian tidak boleh ditebak sistem.
- **Q-002 siapa berhak menyetujui scrap** — sementara dipagari izin `device_recovery.dispose` (dipegang Management), bukan approval berjenjang.
- **Q-003 SLA per wilayah** — `DeviceRecoverySetting` sudah berupa data, jadi perubahannya nanti tidak menuntut migrasi.
- **Q-004 salinan berita acara ke pelanggan** — halaman cetak tersedia; pengirimannya belum otomatis.
- **Q-005 aksesori sebagai aset serial atau kuantitas** — saat ini hanya butir checklist, bukan aset tersendiri.

**Catatan lain yang muncul dari pemetaan ini:**

Satu penyesuaian pada mesin yang sudah ada ternyata tidak terhindarkan:
`STOCK_RETURN` semula hanya menerima perangkat berstatus `IN_CUSTODY`, sehingga
perangkat hasil penarikan (`RETURN_IN_TRANSIT` / `QUARANTINED`) tertolak.
Penjaganya diperlebar untuk ketiga status itu — pemeriksaan custodian TIDAK
dilonggarkan, karena rantai tanggung jawabnya memang sama.

## 8. Yang Perlu Diketahui Sebelum Mulai

- Modul ini **menyentuh inventory produksi**. Kesalahan di sini bukan sekadar tampilan salah — perangkat bisa masuk stok tersedia padahal rusak, atau perangkat pelanggan ikut ditarik.
- Karena itu Fase 28 (`ownership` + backfill) harus **selesai dan diperiksa** sebelum apa pun di atasnya dibangun.
- Tes integrasi berbasis database belum ada di repo ini (lihat `tests/README.md`). Untuk modul dengan invariant sebanyak ini, sebaiknya database tes disiapkan lebih dulu — §19.2 PRD sendiri menuntut uji konkurensi.
