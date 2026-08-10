# Rancangan Fase 8+ — Billing, Isolir, GL, dan Modul Lanjutan

**Tanggal:** 2026-08-10
**Dasar:** [FEATURE-GAP-ANALYSIS-HELPDESK-V2.md](FEATURE-GAP-ANALYSIS-HELPDESK-V2.md)
**Status:** rancangan untuk direview — belum ada kode yang ditulis

> **STATUS: CATATAN / BACKLOG — BUKAN PEKERJAAN AKTIF.**
> Fase 8–15 di sini **belum disetujui untuk dikerjakan**. Prioritas saat ini adalah
> menuntaskan PerumNet CRM sesuai `PRD-PerumNet-CRM.md` (7 fase PRD sudah selesai;
> sisanya keputusan PO & adapter eksternal). Rancangan ini baru dieksekusi setelah itu,
> dan hanya atas instruksi eksplisit.

## 0. Prinsip Rancangan

1. **Jangan tiru model data mereka yang menempel.** Di sistem lama 1 pelanggan = 1 langganan. Kita pertahankan `Customer` ⟷ `Subscription` terpisah — pelanggan bisa punya lebih dari satu layanan, dan riwayat langganan tidak hilang saat pelanggan ganti paket.
2. **Uang tidak boleh punya dua sumber kebenaran.** Semua peristiwa keuangan (invoice terbit, pembayaran masuk, fee kolektor, penyesuaian) menghasilkan **satu jurnal** di GL. Laporan keuangan diturunkan dari jurnal, tidak dihitung ulang dari tabel operasional.
3. **Segala yang mengubah layanan pelanggan harus dapat dibatalkan dan dapat diaudit.** Isolir, pembukaan blokir, dan sync ke router adalah *event* bercatat, bukan kolom boolean.
4. **Manfaatkan yang sudah kita punya.** Approval engine, `AuditLog`, `Integration`/`IntegrationEvent`, RBAC, dan `Notification` sudah ada dan lebih kuat dari milik mereka — modul baru menempel ke situ, bukan bikin mekanisme sendiri.
5. **Idempoten di setiap batch.** Generator invoice bulanan dan sync router harus aman dijalankan ulang.

## 1. Peta Modul Baru

| Fase | Modul | Gap yang ditutup |
|---|---|---|
| 8 | Billing & Invoice | G1, G4, G5, G13, G23 |
| 9 | Payment & Merchant/Kolektor | G2, G14, G22 |
| 10 | Isolir & Dunning + MikroTik | G3, G8 |
| 11 | General Ledger & Laporan Keuangan | G6 |
| 12 | Helpdesk Pelanggan & Dispatch | G15, G16, G17 |
| 13 | FTTH Port Management & Monitoring | G9, G10, G21 |
| 14 | HRD & Absensi | G7 |
| 15 | Kanal Pelanggan (WA, App, Promo) | G11, G12 |

## 2. Fase 8 — Billing & Invoice

### 2.1 Model

```prisma
model AddonService {
  id           String  @id @default(cuid())
  code         String  @unique
  name         String
  monthlyPrice BigInt
  description  String?
  isActive     Boolean @default(true)
  subscriptions SubscriptionAddon[]
}

model SubscriptionAddon {
  id             String    @id @default(cuid())
  subscriptionId String
  addonId        String
  priceOverride  BigInt?
  startedAt      DateTime  @default(now())
  endedAt        DateTime?
  @@unique([subscriptionId, addonId, startedAt])
}

model BillingProfile {           // menempel ke Subscription
  id             String  @id @default(cuid())
  subscriptionId String  @unique
  billingStartAt DateTime
  invoiceDay     Int              // tanggal terbit
  dueDays        Int     @default(20)
  isolirDay      Int?             // tanggal pemutusan bila belum bayar
  taxPercent     Decimal @default(0) @db.Decimal(5,2)
  merchantId     String?          // unit penagih
  isActive       Boolean @default(true)
}

model InvoiceRun {                // batch bulanan — idempoten
  id          String   @id @default(cuid())
  period      String                  // "2026-08"
  scope       String   @default("ALL")
  status      String   @default("DRAFT")   // DRAFT|PREVIEW|POSTED|CANCELLED
  totalCount  Int      @default(0)
  totalAmount BigInt   @default(0)
  createdById String
  postedAt    DateTime?
  invoices    Invoice[]
  @@unique([period, scope])
}

model Invoice {
  id             String    @id @default(cuid())
  invoiceNumber  String    @unique
  invoiceRunId   String?
  customerId     String
  subscriptionId String?
  merchantId     String?
  type           String    @default("MONTHLY")  // MONTHLY|INSTALLATION|ADDON|ADJUSTMENT|MANUAL
  period         String?                        // "2026-08"
  issuedAt       DateTime
  dueAt          DateTime
  subtotal       BigInt
  taxPercent     Decimal   @db.Decimal(5,2)
  taxAmount      BigInt
  totalAmount    BigInt
  paidAmount     BigInt    @default(0)
  status         String    @default("DRAFT")    // DRAFT|OPEN|PARTIAL|PAID|VOID|WRITTEN_OFF
  journalEntryId String?   @unique
  notes          String?
  lines          InvoiceLine[]
  allocations    PaymentAllocation[]
  @@unique([subscriptionId, period, type])      // kunci idempotensi
  @@index([status, dueAt])
}

model InvoiceLine {
  id          String  @id @default(cuid())
  invoiceId   String
  kind        String            // PACKAGE|ADDON|INSTALLATION|DISCOUNT|ADJUSTMENT
  refId       String?
  description String
  quantity    Int     @default(1)
  unitPrice   BigInt
  amount      BigInt
}
```

### 2.2 Aturan
- `@@unique([subscriptionId, period, type])` membuat generator bulanan **aman dijalankan ulang** — kunci yang tidak dimiliki sistem lama.
- Invoice `DRAFT` → `InvoiceRun` di-*preview* dulu (jumlah & total), baru `POSTED`. Posting inilah yang menerbitkan jurnal dan mengunci invoice.
- Pembatalan pakai `VOID` + invoice pengganti, **bukan** hapus — jurnal tidak boleh berlubang.
- `taxPercent` disimpan **per invoice**, bukan diambil dari master saat pelaporan, supaya invoice lama tidak berubah saat tarif PPN berganti.

## 3. Fase 9 — Payment, Merchant & Kolektor

### 3.1 Model

```prisma
model Merchant {
  id            String  @id @default(cuid())
  code          String  @unique
  name          String
  contactName   String?
  phone         String?
  address       String?
  latitude      Float?
  longitude     Float?
  isPaymentPoint Boolean @default(false)
  cashAccountId String?          // akun kas di CoA
  feePayableAccountId String?    // akun hutang fee (komisi)
  feePercent    Decimal @default(0) @db.Decimal(5,2)
  isActive      Boolean @default(true)
}

model Payment {
  id            String   @id @default(cuid())
  paymentNumber String   @unique
  customerId    String
  merchantId    String?
  receivedById  String              // kasir / kolektor
  method        String              // CASH|TRANSFER|GATEWAY
  cashbookId    String?             // untuk CASH/TRANSFER
  gatewayTxId   String?             // untuk GATEWAY
  amount        BigInt
  feeAmount     BigInt   @default(0)   // biaya gateway / komisi kolektor
  netAmount     BigInt
  paidAt        DateTime
  status        String   @default("DRAFT")  // DRAFT|POSTED|REVERSED
  journalEntryId String? @unique
  reversalOfId  String?  @unique
  allocations   PaymentAllocation[]
}

model PaymentAllocation {         // 1 pembayaran → banyak invoice
  id        String @id @default(cuid())
  paymentId String
  invoiceId String
  amount    BigInt
  @@unique([paymentId, invoiceId])
}

model PaymentGatewayTx {          // padanan "Bundle Payment"
  id           String   @id @default(cuid())
  bundleRef    String   @unique
  provider     String              // WINPAY|DUITKU|TRIPAY
  integrationId String?            // pakai framework Integration yang sudah ada
  customerId   String
  totalAmount  BigInt
  paidAmount   BigInt   @default(0)
  paymentUrl   String?
  expiresAt    DateTime?
  status       String   @default("PENDING")  // PENDING|PAID|EXPIRED|CANCELLED|FAILED
  rawPayload   Json?
  invoiceIds   String[]
  @@index([status])
}
```

### 3.2 Aturan
- **Alokasi eksplisit.** Satu pembayaran bisa melunasi beberapa invoice sekaligus (bundle) — jumlah alokasi wajib sama dengan `amount`. Sistem lama menyelesaikan ini lewat "bundle ref"; kita selesaikan di level data.
- **Fee kolektor jadi liabilitas, bukan pengurang pendapatan.** Meniru pola mereka yang sudah benar: saat pembayaran diterima mitra, jurnal mencatat `Hutang Fee` ke akun mitra. Pembayaran komisi ke mitra kemudian mengurangi liabilitas itu.
- **Webhook gateway masuk lewat `/api/integrations/[code]/webhook` yang sudah ada**, dengan verifikasi signature per provider. `IntegrationEvent` menjadi jejak audit dan sarana replay.
- Pembayaran dibatalkan lewat `REVERSED` + jurnal balik, mengikuti pola `reversalOfId` yang sudah dipakai `CashTransaction`.

## 4. Fase 10 — Isolir & Dunning + MikroTik

```prisma
model DunningPolicy {
  id             String  @id @default(cuid())
  name           String
  graceDays      Int     @default(0)
  reminderOffsets Int[]              // hari relatif jatuh tempo: [-3, 0, 3]
  isolateAfterDays Int?               // ambang pemutusan
  maxUnpaidInvoices Int?              // ambang alternatif: jumlah tunggakan
  isActive       Boolean @default(true)
}

model ServiceSuspension {
  id             String    @id @default(cuid())
  subscriptionId String
  reason         String              // OVERDUE|REQUEST|ABUSE|MAINTENANCE
  triggeredBy    String              // SYSTEM|USER
  policyId       String?
  unpaidInvoices Int?
  unpaidAmount   BigInt?
  suspendedAt    DateTime
  restoredAt     DateTime?
  suspendJobId   String?
  restoreJobId   String?
  createdById    String?
  @@index([subscriptionId, suspendedAt])
}

model NetworkAccessJob {     // antrian perintah ke router — auditable & retryable
  id             String   @id @default(cuid())
  subscriptionId String?
  routerId       String
  action         String             // ENABLE|DISABLE|CREATE|UPDATE|DELETE|SYNC
  payload        Json
  status         String   @default("QUEUED")  // QUEUED|RUNNING|SUCCESS|FAILED|SKIPPED
  attempts       Int      @default(0)
  lastError      String?
  executedAt     DateTime?
  @@index([status, routerId])
}
```

**Aturan:** isolir **tidak pernah** dieksekusi langsung dari UI ke router. Alurnya: evaluasi kebijakan → `ServiceSuspension` tercatat → `NetworkAccessJob` diantrikan → worker mengeksekusi ke MikroTik → hasil dicatat. Kalau router mati, job gagal dan **terlihat** (sistem lama melacak ini sebagai "Mikrotik Sync Failures" — kita jadikan first-class). Pembukaan blokir otomatis saat pembayaran ter-posting mengikuti jalur yang sama secara terbalik.

## 5. Fase 11 — General Ledger

```prisma
model Account {                    // Chart of Accounts
  id          String  @id @default(cuid())
  code        String  @unique      // "1-10100"
  name        String
  category    String              // KAS_BANK|PIUTANG|PERSEDIAAN|AKTIVA_TETAP|HUTANG|EKUITAS|PENDAPATAN|BEBAN|...
  normalSide  String              // DEBIT|CREDIT
  parentId    String?
  isTaxAccount Boolean @default(false)
  taxPercent  Decimal? @db.Decimal(5,2)
  cashbookId  String?  @unique    // jembatan ke Cashbook yang sudah ada
  isActive    Boolean @default(true)
  children    Account[] @relation("AccountTree")
}

model JournalEntry {
  id          String   @id @default(cuid())
  entryNumber String   @unique
  entryDate   DateTime
  source      String              // INVOICE|PAYMENT|CASH_TX|MANUAL|ADJUSTMENT|PAYROLL
  sourceId    String?
  memo        String?
  partyType   String?             // CUSTOMER|CONTACT|EMPLOYEE|MERCHANT
  partyId     String?
  status      String   @default("POSTED")  // DRAFT|POSTED|REVERSED
  reversalOfId String? @unique
  postedById  String
  lines       JournalLine[]
  @@index([entryDate, source])
}

model JournalLine {
  id        String @id @default(cuid())
  entryId   String
  accountId String
  debit     BigInt @default(0)
  credit    BigInt @default(0)
  description String?
  costCenterId String?
}

model PostingRule {              // pemetaan peristiwa → akun, bukan hardcode
  id        String @id @default(cuid())
  event     String              // INVOICE_POSTED|PAYMENT_RECEIVED|COLLECTOR_FEE|...
  debitAccountId  String?
  creditAccountId String?
  scope     String?             // per merchant / per kategori
  isActive  Boolean @default(true)
}
```

**Aturan:**
- Jurnal **append-only**. Koreksi = jurnal balik, tidak pernah edit.
- Validasi total debit = total kredit di level transaksi database.
- `Cashbook` yang sudah ada dijembatani ke `Account` lewat `cashbookId`, jadi modul kas Fase 4 tidak perlu dibongkar — cukup ikut memposting jurnal.
- Laporan (buku besar, neraca saldo, neraca, laba rugi, arus kas langsung & tidak langsung, perubahan modal, rasio) semuanya **query di atas jurnal**, bukan tabel terpisah.

Contoh posting yang ditiru dari pola mereka:

| Peristiwa | Debit | Kredit |
|---|---|---|
| Invoice diposting | Piutang Usaha | Pendapatan + PPN Keluaran |
| Pembayaran tunai di kantor | Kas/Bank | Piutang Usaha |
| Pembayaran via mitra | Kas Mitra | Piutang Usaha |
| Komisi mitra diakui | Beban Fee | Hutang Fee (mitra) |
| Komisi dibayarkan | Hutang Fee | Kas/Bank |
| Pembayaran via gateway | Kas/Bank + Beban Biaya Gateway | Piutang Usaha |

## 6. Fase 12 — Helpdesk Pelanggan & Dispatch

Kita **belum punya tiket pelanggan** — `ItTicket` adalah helpdesk internal dan `Incident` adalah gangguan NOC. Tambahkan jalur pelanggan:

```prisma
model TicketCategory {
  id          String  @id @default(cuid())
  name        String  @unique
  slaHours    Int?
  workflowId  String?
  isActive    Boolean @default(true)
}

model WorkflowTemplate {          // dipakai bersama oleh tiket & lead
  id      String @id @default(cuid())
  kind    String              // TICKET|LEAD
  name    String
  steps   WorkflowStep[]
}

model WorkflowStep {
  id          String @id @default(cuid())
  templateId  String
  order       Int
  name        String
  description String?
  isRequired  Boolean @default(true)
}

model CustomerTicket {
  id           String    @id @default(cuid())
  ticketNumber String    @unique
  customerId   String
  subscriptionId String?
  categoryId   String
  title        String
  description  String?
  status       String    @default("OPEN")   // OPEN|IN_PROGRESS|PENDING|SOLVED|CLOSED
  priority     String    @default("NORMAL")
  tags         String[]
  assigneeId   String?
  members      TicketMember[]
  parentId     String?                       // sub-tiket
  scheduledAt  DateTime?
  latitude     Float?
  longitude    Float?
  firstResponseAt DateTime?
  resolvedAt   DateTime?
  closedAt     DateTime?
  mttrMinutes  Int?                          // dihitung saat resolve
  slaBreached  Boolean   @default(false)
  workOrderId  String?                       // sambungan ke modul operasional kita
  progress     TicketStepProgress[]
  pauses       TicketPause[]
  @@index([status, scheduledAt])
}

model TicketPause {                // "Hentikan Sementara" — MTTR berhenti dihitung
  id        String    @id @default(cuid())
  ticketId  String
  reason    String
  pausedAt  DateTime
  resumedAt DateTime?
  createdById String
}
```

**Nilai tambah dibanding mereka:** MTTR kita dihitung **bersih dari jeda pause**, dan tiket tersambung ke `WorkOrder` sehingga pemakaian material dari gudang ikut tercatat — sesuatu yang tidak bisa dilakukan sistem lama karena tidak punya modul inventory.

**Dispatch board / TV Wall** cukup menjadi view di atas `CustomerTicket` + `WorkOrder` yang terjadwal hari ini, dikelompokkan per teknisi. Tidak perlu model baru.

## 7. Fase 13 — FTTH Port Management

Perluas model NOC yang sudah ada, jangan bikin paralel:

```prisma
model OltDevice {                 // spesialisasi dari NetworkDevice
  id           String @id @default(cuid())
  networkDeviceId String @unique
  vendor       String            // ZTE|HUAWEI|CDATA|HSGQ|FIBERHOME|VSOL|HIOSO
  model        String?
  managementIp String
  telnetPort   Int?
  snmpPort     Int?
  // kredensial TIDAK disimpan plaintext — rujuk ke secret store
  credentialRef String?
  ponPorts     PonPort[]
}

model PonPort {                   // padanan "Dist Group"
  id        String @id @default(cuid())
  oltId     String
  slot      Int
  port      Int
  label     String              // "1/2/1"
  odps      Odp[]
  @@unique([oltId, slot, port])
}

model Odp {
  id           String  @id @default(cuid())
  code         String  @unique
  siteId       String?
  ponPortId    String?
  parentId     String?           // ODP kaskade
  portCapacity Int
  portUsed     Int     @default(0)
  opticPowerDbm Decimal? @db.Decimal(5,2)
  latitude     Float?
  longitude    Float?
  status       String  @default("ACTIVE")
  children     Odp[]   @relation("OdpTree")
  ports        OdpPort[]
}

model OdpPort {                   // ini yang TIDAK dimiliki sistem lama
  id             String  @id @default(cuid())
  odpId          String
  portNumber     Int
  subscriptionId String? @unique
  status         String  @default("FREE")   // FREE|USED|RESERVED|DAMAGED
  @@unique([odpId, portNumber])
}
```

**Perbaikan atas sistem lama:** mereka hanya menyimpan `capacity` dan `port_used` sebagai angka, sehingga tidak diketahui *port nomor berapa* yang dipakai pelanggan mana. Dengan `OdpPort`, penelusuran gangguan per port jadi mungkin, dan `portUsed` menjadi turunan yang selalu konsisten.

**Kredensial perangkat (OLT/router) tidak boleh disimpan plaintext** seperti di sistem lama — gunakan referensi ke secret store atau enkripsi kolom.

Monitoring (`ProbeTarget`, `PppoeSession`) dan tools (IP calculator, MAC vendor, burst calculator) menyusul di fase yang sama; ketiganya murni utilitas tanpa dampak data.

## 8. Fase 14 — HRD & Absensi

```prisma
model Employee {
  id           String  @id @default(cuid())
  userId       String? @unique
  employeeNo   String  @unique
  fullName     String
  jobTitle     String?
  employeeType String            // FULL_TIME|PART_TIME|CONTRACT|PROBATION
  supervisorId String?
  joinedAt     DateTime
  isActive     Boolean @default(true)
}

model AttendanceLocation {
  id        String @id @default(cuid())
  name      String
  latitude  Float
  longitude Float
  radiusM   Int
  isActive  Boolean @default(true)
}

model Shift {
  id            String @id @default(cuid())
  name          String
  startTime     String
  endTime       String
  lateToleranceMin Int  @default(0)
  isActive      Boolean @default(true)
}

model ShiftSchedule {
  id         String   @id @default(cuid())
  employeeId String
  date       DateTime @db.Date
  shiftId    String?
  dayType    String   @default("WORK")   // WORK|OFF|HOLIDAY
  note       String?
  @@unique([employeeId, date])
}

model Attendance {
  id           String    @id @default(cuid())
  employeeId   String
  date         DateTime  @db.Date
  shiftId      String?
  clockInAt    DateTime?
  clockInLocationId String?
  clockInDistanceM  Int?
  clockInPhotoId    String?     // pakai model Attachment yang sudah ada
  clockOutAt   DateTime?
  clockOutPhotoId   String?
  lateMinutes  Int      @default(0)
  workMinutes  Int      @default(0)
  status       String   @default("PRESENT")  // PRESENT|LATE|ABSENT|LEAVE|SICK|HOLIDAY
  @@unique([employeeId, date])
}

model LeaveRequest {
  id          String   @id @default(cuid())
  employeeId  String
  type        String              // ANNUAL|SICK|OTHER
  startDate   DateTime @db.Date
  endDate     DateTime @db.Date
  days        Int
  reason      String
  attachmentId String?
  approvalRequestId String? @unique   // ← pakai approval engine kita
  status      String   @default("PENDING")
}

model OvertimeRequest {
  id          String   @id @default(cuid())
  employeeId  String
  date        DateTime @db.Date
  startTime   String
  endTime     String
  minutes     Int
  reason      String
  approvalRequestId String? @unique
  status      String   @default("PENDING")
}
```

**Keunggulan kita:** izin dan lembur lewat `ApprovalRule` yang sudah ada — bisa berjenjang (atasan → HRD), sedangkan sistem lama hanya satu tingkat approve/tolak.

## 9. Fase 15 — Kanal Pelanggan

- Perluas `Notification` dengan `channel` (`IN_APP|EMAIL|WHATSAPP|PUSH`) dan preferensi per pelanggan (`None|WhatsApp|Email|App`, meniru mereka).
- **WA Gateway sebagai adapter `Integration`**, bukan modul terpisah — dengan template pesan, antrian kirim, status terkirim/gagal, dan rate limit.
- `Announcement` / promo untuk portal & app pelanggan (judul, badge, periode tayang, status).
- Portal pelanggan: lihat tagihan, riwayat pembayaran, bayar via gateway, buat tiket, lihat status gangguan (nyambung ke modul Outage yang sudah kita punya).

## 10. Rencana Migrasi Data

Migrasi dikerjakan sendiri oleh tim PerumNet; ini pemetaan acuannya.

| Sumber (sistem lama) | Tujuan (CRM kita) | Catatan |
|---|---|---|
| `customer` | `Customer` + `Subscription` + `BillingProfile` | satu baris pecah jadi tiga entitas |
| `customer.pppoe`, `password` | `Subscription.pppoeUsername` + secret store | password jangan dipindah plaintext |
| `customer.isolir_date` | `BillingProfile.isolirDay` | tanggal dalam bulan, bukan tanggal penuh |
| `customer.id_card`, `npwp` | `Customer` (field baru) | data identitas — perlu kebijakan retensi |
| `plan` | `Package` | "Speed" bebas → dipecah jadi `downloadMbps`/`uploadMbps` |
| `addon` | `AddonService` | |
| `merchant` | `Merchant` + `Account` | akun kas & hutang fee ikut dipetakan |
| `sale` | `User` (peran SALES) atau `SalesAgent` | perlu keputusan, lihat §11 |
| `invoice` | `Invoice` + `InvoiceLine` | nomor invoice lama dipertahankan |
| transaksi pembayaran | `Payment` + `PaymentAllocation` | fee & selisih dipisah eksplisit |
| `akun` | `Account` | kode akun dipertahankan apa adanya |
| jurnal | `JournalEntry` + `JournalLine` | saldo awal via satu jurnal pembuka |
| `site`, `olt`, `distpoint`, `distrouter` | `NetworkSite`, `OltDevice`, `Odp`, `NetworkDevice` | `port_used` diverifikasi ulang lewat `OdpPort` |
| `ticket` | `CustomerTicket` | MTTR historis ikut dibawa |
| karyawan & absensi | `Employee`, `Attendance`, dst. | |

**Urutan wajib:** master (akun, paket, merchant, site/OLT/ODP) → pelanggan & langganan → invoice → pembayaran → jurnal pembuka → data historis (tiket, absensi).

## 11. Keputusan yang Perlu Diambil

1. **Merchant vs Division/Area.** Merchant adalah unit penagih + kolektor + pemilik akun kas. Apakah dijadikan entitas baru (usulanku: ya) atau dipaksakan ke `Division` yang sudah ada?
2. **Sales mitra.** Sistem lama memberi login terpisah untuk sales. Kita jadikan `User` dengan role SALES, atau entitas `SalesAgent` tanpa akses sistem?
3. **Skema komisi.** Persen per merchant, atau nominal per invoice, atau berjenjang? Ini menentukan bentuk `PostingRule`.
4. **Ambang isolir.** Berdasarkan hari lewat jatuh tempo, atau jumlah invoice tertunggak (sistem lama menyediakan sampai 13)? Atau keduanya, mana yang lebih dulu tercapai?
5. **Nomor invoice.** Ikut format lama (agar pelanggan tidak bingung saat transisi) atau format baru?
6. **PPN.** Per pelanggan (seperti sekarang di sistem lama) atau per paket?
7. **Payment gateway mana yang dipakai** setelah migrasi — mereka punya 5 terdaftar tapi teramati 0 aktif / 7 non-aktif.
8. **Retensi data identitas** (KTP, NPWP, foto selfie absensi) — perlu kebijakan sebelum modul dibangun, bukan sesudah.

## 12. Yang Sengaja Tidak Kita Tiru

- **1 pelanggan = 1 langganan** — batasan struktural sistem lama.
- **Kredensial perangkat plaintext** di form OLT/router.
- **`port_used` sebagai angka lepas** tanpa tahu port mana yang dipakai siapa.
- **Ejaan/penamaan tidak konsisten** (`parrent`, `tittle`, `Mounthly`, `distpoint.ip` yang sebenarnya kapasitas, `distpoint.security` yang sebenarnya optic power) — kolom yang namanya tidak sesuai isinya adalah utang teknis yang tidak perlu kita warisi.
- **Approval satu tingkat** untuk izin/lembur — kita sudah punya yang berjenjang.
