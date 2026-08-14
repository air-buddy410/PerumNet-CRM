# Banding: PerumNet CRM (kita) vs PerumNet Warehouse/Operations (PRD pembanding)

Tanggal: 15 Agustus 2026
Sumber pembanding:
- `PRD-PERUMNET-CRM-OPERATIONS.md` v3.1 (1.127 baris, 27 bab)
- Kode sumbernya sendiri: `~/Downloads/perumnet-warehouse` (berjalan di `http://localhost:3000`)

Ukuran kasar kedua aplikasi:

| | CRM kita | Warehouse (pembanding) |
|---|---|---|
| Model Prisma | 136 | 192 |
| Halaman (`page.tsx`) | 165 | 144 |
| Database | PostgreSQL 5433 | PostgreSQL 16 (Docker lokal) |

**Kesimpulan utama: keduanya bukan aplikasi yang sama dengan kualitas berbeda —
keduanya membelah masalah di tempat yang berbeda.** Aplikasi pembanding dalam
tentang *teknik jaringan dan legal*; aplikasi kita luas tentang *operasional
bisnis*. Yang satu tahu di core mana sinyalnya putus; yang lain tahu siapa yang
belum bayar dan siapa yang masuk kerja hari ini. Hanya ~35% fitur beririsan.

---

## 1. Yang SUDAH ada di kita dan setara (atau lebih)

| Area PRD | Punya kita | Catatan |
|---|---|---|
| Warehouse multi-gudang, lokasi, rack/bin, stock slot | `Warehouse`, `Rack`, `Bin`, `StockSlot`, `StockSlotType`, `SlotAllocation`, `SlotLedger`, `SlotTransferPolicy` | Struktur slot/ledger kita sepadan |
| Inventory catalog, kategori, saldo, stock card | `Item`, `Category`, `StockLevel`, `StockTransaction(+Line)` | |
| Serial/aset & lifecycle | `SerializedDevice`, `DeviceMovement`, `DeviceInspection` | |
| Opname & rekonsiliasi | `OpnameSession`, `OpnameLine` | |
| WO / IRF / DO / Transfer receipt | `WorkOrder`, `InventoryRequestForm`, `DeliveryOrder(+Line)`, `TransferReceipt(+Line)`, `MaterialRequest(+Line)`, `MaterialUsage` | Nomenklatur sama |
| Return teknisi | `ReturnRequest(+Line)` | |
| Warehouse scope enforcement (WH-006) | `UserWarehouseScope` | **Sudah ada di kita**, sama persis namanya |
| Terminasi & device recovery (§11.8) | `CustomerTermination`, `DeviceRecoveryIssue/Item/Attempt/Setting`, `DeviceInspection` + halaman `/inventory/device-recoveries`, `/portal/recoveries`, laporan | Setara penuh — model kita 1:1 dengan mereka |
| Nomor dokumen server-side unik (DOC-002) | `DocumentSequence` | |
| Signature dokumen (DOC-007) | `DocumentSignature` | |
| ODP & port master | `Odp`, `OdpPort`, `PonPort`, `OltDevice` | Kita malah punya rantai OLT→PON→ODP kaskade yang mereka tidak punya |
| Peta jaringan | `/noc/map`, `/noc/ftth`, `/noc/ftth/kml` | |
| RBAC, audit, approval | `Role`, `Permission`, `RolePermission`, `AuditLog`, `ApprovalRequest/Rule/Step`, `WorkflowTemplate` | **Engine approval kita generik & lebih kuat** — mereka approval-nya khusus Legal |
| Soft delete / arsip | `ArchivedRecord`, `/settings/trash` | Tidak ada padanan di mereka |
| Package / add-on / pajak | `Package`, `AddonService`, `taxPercent` pada `Quotation` | Lihat gap §3.6 — versioning & promo belum |

## 2. Yang ADA di mereka, TIDAK ada di kita (gap sebenarnya)

Diurut dari yang paling besar.

### 2.1 Fiber Backbone & Core — gap terbesar (±40% PRD)

PRD-nya 40 requirement (FBR-001…FBR-040) dan ±30 model. Kita punya **satu**
model: `FiberRoute` — itu pun cuma geometry KML + nama, tanpa kabel, tanpa core.

Yang belum ada sama sekali di kita:

- `FiberCableSegment`, `FiberCore` (tube/warna/kapasitas/status/purpose)
- `FiberClosure`, `SpliceTray`, `FiberSplice` + **Core Matrix** (crossing arbitrary, bulk auto-connect, conflict detection, commit atomik)
- **Trace dua arah** device→patchcord→OTB→core→closure→OTB→device, deteksi loop/split/dead-end
- `OpticalTerminationBox`, `OTBPort`, `DevicePort`, `OpticalPatchConnection`, `FiberCoreTermination`, `OpticalCircuit`
- **OTDR**: `OTDRTestSession`, `OTDRMeasurement`, `OTDREvent`, `OTDRAttachment` — riwayat test per core per wavelength, baseline vs latest, event manual per jarak, link ke closure setelah dikonfirmasi engineer
- `FiberCoreFault`, `FiberClosureInspection`, `FiberMaintenanceCase`
- `NetworkNode` sebagai registry topology (referensi ke SuperPOP/Site/Closure tanpa duplikasi identitas)
- Import staging CSV/XLSX (`FiberImportBatch`, `FiberImportRow`) dengan review baris ambigu + commit idempotent

**Ini pekerjaan berbulan-bulan, bukan berminggu-minggu.** Tapi juga: ini yang
paling relevan buat kita sekarang, karena kita baru saja pasang LibreNMS dan
punya 5 OLT + jalur distribusi yang belum terpetakan corenya.

### 2.2 Legal & Compliance — nol di kita

±45 model, 12 requirement (LEG-001…012). Kita **tidak punya satu pun**
(grep `legal`/`compliance` = 0 berkas).

- `LegalDocument` + `LegalDocumentVersion` (versi lama tidak pernah ditimpa) + `LegalDocumentAccessLog`
- `TelecomLicense` (izin ISP), `BusinessAgreement`, `AgreementAmendment`, `VillageAgreement`, `InfrastructurePermit`, `SiteAgreement`, `InfrastructureAgreement`, `InfrastructureOwner`
- `ComplianceObligation/Occurrence/Task/Evidence` + reminder + recurring `nextDueDate` server-side
- `LegalApprovalTemplate/Stage/Request/Decision` — self-approval ditolak, decision immutable
- `LegalFinancialObligation` alur `REQUESTED → FINANCE_VERIFIED → PAID → LEGAL_CONFIRMED`
- `LegalClearance(+Item)` — **gate yang memblokir WO pembangunan** kalau izin belum beres (default OFF)
- `LegalRequirementTemplate/Rule`, `EntityLegalRequirement`, `RouteLegalRequirement` — matriks kelengkapan izin per rute
- `Regulation`, `ObligationRegulation`, `LegalCase`, `LegalCorrespondence`, `LegalMeeting(+Action)`, `LegalEmailOutbox`, `LegalAutomationRun`
- Kalender kedaluwarsa + peta legal

Untuk ISP yang menggelar kabel lewat desa, `VillageAgreement` +
`InfrastructurePermit` + clearance gate itu bukan formalitas — itu yang
menghentikan tim tarik kabel di lahan yang izinnya belum turun.

### 2.3 ODP Installation Checkpoint — kita punya master, belum punya alur lapangan

Kita punya `Odp` dan `OdpPort`. Yang belum ada adalah **prosedur teknisi di
lapangan** (ODP-001…ODP-009):

- `ODPInstallationCheckpoint` — scan barcode/QR (isi barcode hanya `odpCode`), validasi expected ODP + assignment teknisi + **jarak GPS**
- Foto berurutan wajib: before → port → after
- `ODPInspection(+Item)` — checklist yang **dihitung server** jadi health score & status kondisi
- `ODPMaintenanceCase` otomatis dari temuan wajib, tanpa duplikasi case aktif
- Reservasi port: dua teknisi tidak bisa reserve port sama
- `ODPChangeRequest`, `ODPCheckpointOverrideRequest` — requester tidak boleh approve sendiri
- `ODPScanHistory`, draft lokal untuk sinyal jelek
- **Gate**: completion & aktivasi ditolak kalau checkpoint/port/bukti belum valid

### 2.4 SUPERPOP / Rack Data Center — `Rack` kita rack gudang, bukan rack DC

`Rack` kita cuma `warehouseId + code + bins`. Mereka punya:

- `SuperPop`, `DataCenterRack`, `RackUnitOccupancy` (posisi U, **collision ditolak di server DAN di database**)
- `DataCenterAsset` + `AssetRackPlacement` (placement aktif unik; pindah = histori baru, identitas aset tetap) + `AssetMovement`
- `RackAssetAudit(+Scan)` — bandingkan expected vs scanned
- `Manufacturer`, `DeviceType`, `AssetCodeSequence/Setting`, `AssetLabelSetting`
- DCA-006: credential perangkat **tidak boleh disimpan/ditampilkan** di rack view — sejalan dengan aturan kita (`credentialRef` hanya nama env var)

Kita punya `ItAsset`, `Server`, `NetworkDevice` — tapi tidak ada konsep posisi U
dan tidak ada audit rack.

### 2.5 Customer 360 & Gallery

- Halaman 360 baca-saja yang menyatukan identitas + sales + paket + instalasi + WO + ODP + perangkat + layanan
- **PII masking** di daftar, dibuka hanya dengan permission `crm.customer.pii.view`
- Gallery foto rumah & foto bersama pelanggan, dilayani lewat endpoint privat `private, no-store`

Kita punya `/crm/customers/[id]` tapi tanpa masking PII dan tanpa gallery.

### 2.6 Registrasi sales & snapshot komersial

Alur kita `Lead → Quotation → Survey → Subscription`; alur mereka
`CustomerRegistration → InstallationOrder → CustomerNetworkService`. Bentuknya
beda, dan bentuk kita tidak lebih buruk. Tapi ada empat hal spesifik yang belum
ada di kita:

- `Promotion` + `PromotionRedemption` — **reservasi atomik** saat submit, dilepas kalau reject/cancel, hanya satu kode promo nominal per registrasi (SAL-007/008)
- Versioning paket & add-on dengan *effective date* (SAL-005), dan **taxable flag per komponen** (SAL-006) — kita `taxPercent` flat 11% di quotation
- `SalesHierarchy` — downline, tanpa relasi ganda/melingkar; atribusi pakai `downlineUserId ?? salesUserId` (SAL-002, CRM-006, CRM-011)
- Origin `NEW` / `COMPETITOR` + ISP sebelumnya wajib untuk competitor (SAL-004)

### 2.7 Installation Order sebagai entitas sendiri

Kita pakai `WorkOrder` bertipe `NEW_INSTALLATION`. Mereka punya
`InstallationOrder` + `InstallationActivity` + `InstallationTeam(+Member)` +
`InstallationPayment` + `Technician`, dengan gate keras:

- INS-005: aktivasi butuh port `USED`, bukti wajib, dan network status `READY_ACTIVATION`
- INS-006: instalasi lama boleh *legacy exemption* yang eksplisit & teraudit

### 2.8 Lain-lain yang lebih kecil

- `Company` multi-perusahaan + `BusinessClassification` (KBLI) — kita single-company
- `District` / `Village` sebagai master wilayah — kita cuma `Area`
- `GeocodeCache` + policy: Nominatim **hanya** untuk warehouse, lewat proxy, tidak pernah untuk koordinat pelanggan
- `MenuDefinition` + `UserMenuPreference` + landing page per role
- Import staging generik (upload → parse → staging → review → validate → commit idempotent)

## 3. Yang ada di KITA, tidak ada di mereka

Sebagian besar ini mereka daftarkan sendiri sebagai **out of scope** (§18) atau
backlog P2 (§22) — jadi ini memang keunggulan kita, bukan kebetulan.

| Modul kita | Status di PRD mereka |
|---|---|
| **Billing** — `Invoice(+Line)`, `InvoiceRun`, `Payment`, `PaymentAllocation`, `PaymentGatewayTx`, `Merchant`, `BillingProfile`, `DunningPolicy`, `ServiceSuspension` (isolir), receivables | §18 out of scope, P2 backlog |
| **Finance / GL** — `JournalEntry(+Line)`, `PostingRule`, `Cashbook`, `CashTransaction`, `CashClosing`, trial balance, ledger, income statement | §18 "General ledger, accounting journal" out of scope |
| **HRD lengkap** — `Employee`, `EmployeeCard` (+QR), `Attendance`, `AttendanceLocation`, `Shift`, `ShiftSchedule`, `LeaveRequest`, `OvertimeRequest`, `Division`, `CostCenter`, import pegawai | Tidak disebut sama sekali |
| **Helpdesk** — `CustomerTicket`, `TicketCategory`, `TicketMember`, `TicketPause` (SLA), `TicketStepProgress`, dispatch | Tidak ada |
| **NOC live** — `NetworkAlarm`, `Incident(+Update,+Subscription)`, `NetworkMaintenance`, `ChangeRequest`, `ProbeTarget/Result`, `PppoeSession`, `PppoePollRun`, `MikrotikRouter`, `NetworkAccessJob`, `Subnet`/`IPAddress` (IPAM), `NetworkLink` | §18 "OLT live telemetry" out of scope; §22 P2 |
| **IT Ops** — `Server`, `BackupRecord`, `Deployment`, `Application`, `AccessRequest`, `ItAsset`, `ItTicket`, mailserver/mailbox | Tidak ada |
| **Marketing** — `Campaign` | Tidak ada |
| **Komunikasi** — `MessageTemplate`, `OutboundMessage`, `Announcement`, `Notification`, preferensi kanal | §17.2 "rencana" |
| **Approval generik** — `ApprovalRule(+Step)`, `ApprovalRequest(+Step)`, `WorkflowTemplate/Step` | Mereka hanya punya approval khusus Legal |
| **Scheduler** — `ScheduledTask(+Run)` | §22 P1 "scheduler terkelola" |
| **Integrasi** — `Integration`, `IntegrationEvent` (LibreNMS webhook sudah jalan) | §17.2 "rencana" |
| **Arsip/trash** — `ArchivedRecord` | Tidak ada |

## 4. Aturan mereka yang layak kita adopsi walau modulnya tidak

Ini murah dan bernilai, terlepas dari apakah kita bangun fiber/legal:

1. **Snapshot komersial** (§12.1, SAL-010) — registrasi menyimpan salinan harga, bukan referensi ke master. Perubahan master tidak boleh mengubah histori. Cek: `Quotation` kita sudah simpan `monthlyPrice` sendiri ✔, tapi `Subscription.packageId` masih referensi hidup.
2. **Approval ≠ pergerakan stok** (§12.3) — dokumen di-approve tidak mengurangi stok; hanya event operasional sah yang menggerakkan ledger.
3. **Serial tidak boleh keluar di dua transaksi aktif** (§10.2) — perlu unique constraint, bukan cek di UI.
4. **Requester tidak boleh approve miliknya sendiri** (LEG-007, ODP-007) — worth diperiksa di `ApprovalRule` kita.
5. **File privat, bukan `public/`** (§14.1) — signature, foto instalasi, KTP, bukti recovery. Endpoint wajib auth + MIME check + `nosniff` + `private, no-store`. Metadata minimal: checksum, MIME, ukuran, uploader, timestamp, storage key.
6. **Password perangkat/PPPoE tidak pernah masuk dokumen operasional** (§12.10) — sudah jadi aturan kita (`credentialRef` = nama env var).
7. **Koordinat pelanggan tidak boleh dikirim ke geocoder publik** (§12.8) — Nominatim hanya untuk warehouse, lewat proxy + cache.
8. **Tidak ada hard-delete** untuk audit, ledger, approval decision, splice history (§12.11) — kita sudah punya `ArchivedRecord`, tinggal ditegakkan.
9. **Data demo/reference tidak menghasilkan saldo atau movement nyata** (§12.15).
10. **Peta menampilkan warning untuk data tanpa koordinat, bukan garis perkiraan** (CRM-008, FBR-031).

## 5. Rekomendasi urutan

Tidak semua gap layak ditutup. Urutan menurut nilai per usaha untuk PerumNet
hari ini:

| Prioritas | Apa | Alasan |
|---|---|---|
| **1** | **ODP Installation Checkpoint** | Paling murah, dampak lapangan langsung. Master ODP kita sudah ada; tinggal alur scan + foto + inspeksi + gate. |
| **2** | **Fiber Core & Splice (subset)** — cable segment, core/tube/warna, closure, splice matrix, trace | Kita baru pasang LibreNMS. Tanpa peta core, alarm OLT tidak bisa diterjemahkan jadi "core mana yang putus". Lewati dulu OTDR & OTB. |
| **3** | **Legal: izin desa + permit + clearance gate** (subset) | Hanya `VillageAgreement`, `InfrastructurePermit`, `LegalDocument(+Version)`, clearance gate. Lupakan dulu 40 model sisanya. |
| **4** | **Promo + versioning paket + taxable flag** | Kecil, langsung dipakai sales. |
| **5** | **Customer 360 + PII masking** | Sebagian besar datanya sudah ada, tinggal disatukan. |
| **6** | **Rack unit occupancy (SUPERPOP)** | Baru bernilai kalau POP kita sudah padat. |
| — | OTDR, OTB/patchcord, legal penuh, multi-company | Tunda. Belum ada beban operasional yang menuntutnya. |

## 6. Data mentah (3 Google Sheet) — sudah terbaca

Berkas `.gsheet` lokalnya memang hanya penunjuk Drive, tapi isinya terbaca
lewat konektor Google Drive. Ketiganya ada dalam dua salinan: **asli** milik
`kadekdwisarmilyawan@gmail.com` dan **"Salinan dari …"** milik kita (dibuat
14 Agu 2026). Asli sudah berubah lagi setelah salinan dibuat — untuk impor,
**pakai yang asli**, jangan salinan.

### 6.1 `2026 Master Data Perumnet` — paling bernilai

Tiga tab: *Jadwal Engginer* (jadwal libur/on-call, 6 engineer), *DashBoard*
(target & realisasi 2026: 590 subs, revenue Rp101 jt, ROI −Rp137 jt, homepass
1.672, capaian per sales), dan **`Data Billing Baru`** — ini datanya.

Kolomnya nyaris 1:1 dengan model kita:

| Kolom sheet | Model kita |
|---|---|
| Nama, KTP, DOB, Phone, Email, Alamat | `Customer` |
| Kordinat Client | `Customer.latitude/longitude` |
| Customer Id (CID), PPPOE User | `Subscription.serviceNumber`, `pppoeUsername` |
| Paket | `Subscription.packageId` |
| Sales | `Customer.salesOwnerId` |
| **OLT**, **No port OLT** | `OltDevice` → `PonPort` |
| **Distribution Point (ODP)** | `Odp.code` → `OdpPort` |
| **Distribution Router** | `Subscription.routerId` |
| Billing Start, Isolir Date, ppn | `BillingProfile`, `ServiceSuspension` |

**Rantai OLT → PON port → ODP → port → router itu persis rantai yang sudah
ada di schema kita.** Tidak perlu model baru untuk mengimpornya.

Masalah kualitas data yang harus ditangani saat impor:

1. **Password PPPoE ada di kolom terbuka, dan nilainya satu literal yang sama diulang di semua baris** — bukan per pelanggan. Ini dua masalah sekaligus (kredensial di spreadsheet + password bersama). Kolom ini **tidak boleh diimpor**, sesuai aturan kita dan aturan mereka sendiri (PDF Alur §8, PRD §12.10).
2. **Tanggal lahir tidak cocok dengan NIK.** NIK mengandung tanggal lahir, jadi bisa diperiksa otomatis. Dari 6 baris contoh, **3 tidak cocok** (mis. NIK `…7107860001` → 31-07-1986, sheet menulis 1982-06-10). Validator NIK→DOB wajib jalan sebelum commit.
3. **Kode ODP tidak konsisten**: `BSS 011204`, `ABG1 05DC01`, `GKS 05120101`, `TMG2 DC01`. Panjang berbeda, pakai spasi. Ada juga `BSS 011204` vs `BBS 011204` yang kemungkinan ODP sama salah ketik. Perlu tahap staging + review baris ambigu — persis FBR-035.
4. **Header dobel** (Inggris lalu Indonesia) dan jumlah kolom header ≠ kolom data; beberapa kolom kosong/bergeser. Parse per-nama-kolom, jangan per-posisi.
5. **Format tanggal tidak seragam** (`1980-06-7`, `1966-08-5` tanpa zero-pad).
6. **Nomor telepon mengandung karakter Unicode tak terlihat** (non-breaking hyphen U+2011, LTR mark). Perlu normalisasi.
7. **Koordinat satu sel** `-8.410412, 115.601331` — perlu dipecah lat/lng.

### 6.2 `Alokasi Core` — ini justru mengisi gap terbesar kita

Tiga tab: *Monitoring PIU* (tautan ke sheet PIU per-OLT + catatan closure),
*OLT ALL area* (jumlah pelanggan per PON port untuk C600 Kecicang, C600 Abang,
C300 Pesagi), dan **`Alokasi Core 144`**.

Tab terakhir itu **splice matrix backbone yang dikerjakan manual di
spreadsheet** — persis yang di §2.1 saya sebut belum kita punya:

- Segment `Kecicang–Pesagi`, 144 core, 12 tube × 12 core
- Warna tube standar G.652: BLUE, ORANGE, GREEN, BROWN, GRAY, WHITE…
- Per core: `FO ID` (1–144), *From* → *Next Hop* (`To RK Jalur 11` → `To Belong` / `To Bebandem` / `To Abang` / `To Closure Kembang Remaja` → `To RK Sudirman`)
- *Usage* + *Service*: sebagian core menuju **port PON OLT langsung** (`C600 1/17/6`, `C600 1/1/12`), sebagian uplink (`Metro E Via TBG`, `PTP Gerobog`)

Pemetaan ke model yang perlu dibangun:

| Isi sheet | Model target |
|---|---|
| Segment Kecicang–Pesagi, 144 core | `FiberCableSegment` |
| TUBE n / CORE n / warna / FO ID | `FiberCore` |
| RK Jalur 11, Closure Kembang Remaja, RK Sudirman, Belong, Bebandem, Abang | `FiberClosure` / `NetworkNode` |
| From → Next Hop | `FiberSplice` |
| `C600 1/17/6` | `PonPort` (**sudah ada di kita**) |
| `Metro E Via TBG`, `PTP Gerobog` | `OpticalCircuit` |

Kesalahan yang sudah terlihat di sheet: **`TUBE 5 - CORE 5` muncul dua kali**
(FO ID 52 dan 53 — satunya seharusnya CORE 4), dan urutan `TUBE 6` melompat
(CORE 6 di posisi FO ID 64, CORE 5 di 65). Ini justru argumen terkuat untuk
memindahkannya ke database: nomor core ganda dalam satu tube seharusnya
ditolak constraint, bukan lolos begitu saja.

### 6.3 `Items` — katalog material

Kolom: `Item ID, Name, Description, Warehouse, Image, Category, Vendor,
Purchase Cost, Sale Price`. Gudang tunggal: Kecicang.

- **Kode sudah rapi berprefiks** — MOD, CAB, POL, NET, ELE, PAT, ACC, SPL, ODP, ADA, CLS, SER. Langsung jadi `Category` kita.
- Kolom `Description` sebenarnya berisi **kondisi** (`Available` / `Second`), bukan deskripsi → petakan ke kondisi barang, jangan ke `notes`.
- `Category` dan `Vendor` berisi **hash buram** (`5b39f169`, `caabcab7`) — ID dari aplikasi lama. Perlu tabel pemetaan sebelum impor, kalau tidak vendor & kategori hilang.
- Harga berupa teks (`Rp 250,000`) — perlu parsing. **`SPL-0001 NB Spliter PLC 1:16` tertulis Rp 102 / Rp 133**, hampir pasti kurang tiga angka nol.
- Sebagian besar `Sale Price` = `Purchase Cost` × 1,3 — margin 30%. Yang menyimpang (POL-0001 = 1,67×; CLS-0002 = 1,52×) perlu dikonfirmasi, bukan diperbaiki diam-diam.

### 6.4 Urutan impor yang disarankan

1. **`Items`** — paling bersih, tidak bergantung apa pun. Butuh peta kategori/vendor dulu.
2. **ODP** dari kolom `Distribution Point` di Master Data — normalisasi kode dulu, hasilkan daftar ambigu untuk direview manusia.
3. **Pelanggan + langganan** — setelah ODP ada, supaya `OdpPort` bisa langsung tertaut. Ini yang membuka blokir: 1.716 sesi PPPoE sudah tertarik, **0 tertaut** karena `Subscription` masih kosong.
4. **Alokasi core** — terakhir, dan hanya setelah model fiber dibangun (§5 prioritas 2).

Migrasi tetap mengikuti aturan yang sudah disepakati: data dipindahkan sendiri
oleh pemiliknya, bukan langsung lewat saya, dan tidak ada data existing yang
diubah.

## 7. Hubungan PDF `Alur Sistem Operasional` dengan PRD `.md`

**Berkesinambungan, tapi tidak sejajar** — keduanya lapisan berbeda dari
arsitektur yang sama.

| | PDF Alur | PRD `.md` |
|---|---|---|
| Versi | 1.0, Agustus 2026 | 3.1, 14-08-2026 |
| Panjang | 10 halaman, 15 bab | 1.127 baris, 27 bab |
| Sifat | **SOP / alur kerja tim** | **Requirement produk** |
| Pembaca | Sales, gudang, teknisi, approver | Engineering & QA |

Yang membuktikan keduanya satu garis: **nama entitasnya sama persis.** PDF §9
"Sumber Data Tunggal" menyebut `CustomerRegistration`, `CustomerSurvey`,
`RegistrationDocument`, `InternetPackage`, `InventoryBalance`, `StockLedger`,
`SerialNumber` + `SerialMovement`, `WorkOrder` + `WorkOrderIssue`, `ODP` +
`ODPPort`, `CustomerNetworkService`, `ApprovalRequest` +
`ApprovalRequestStep`, `SalesHierarchy`, `InstallationTeam` — semuanya ada di
schema Prisma aplikasi pembanding. Aturan kuncinya pun sama (PDF §15 vs PRD
§12): tidak ada perubahan stok tanpa ledger, tidak ada serial di dua pelanggan
aktif, tidak ada port ODP dipakai dua pelanggan, approval ≠ pergerakan stok,
otorisasi di server, KTP dimasking, berkas sensitif tidak pakai URL publik.

**Tapi PDF hanya menutup tulang punggung CRM → Gudang → Instalasi → Aktivasi**
(kira-kira PRD §7.1–7.3). Tidak ada Fiber Backbone, tidak ada Legal &
Compliance, tidak ada SUPERPOP. Wajar: ketiga domain itu masuk PRD baru pada
v3.0/v3.1 (14 Agu 2026), sesudah PDF v1.0.

Dua titik PDF lebih rinci daripada PRD:

- **§5 Branch & Stock Slot** — slot sistem `UNALLOCATED` saat barang masuk, alokasi ke `SL-ABG-INST` / `SL-ABG-MNT` / `SL-ABG-MKT`, lokasi fisik `BR-ABANG / SL-ABG-INST / A-R01-B02`, dan internal slot transfer yang tidak mengubah total stok tapi tetap wajib menulis ledger. PRD cuma menyebut "branch stock allocation" satu baris.
- **§7.2 Instalasi** — `Panjang Tarikan = Awal Kabel − Akhir Kabel` terhubung ke pemakaian material aktual, plus "Kode Husbel". Detail lapangan yang tidak ada di PRD.

Dua titik keduanya berselisih:

- PDF checklist D menyebut *"Customer signature & rating"*; PRD §18 menaruh **CSAT di luar scope**.
- PDF §8 bilang tanggal jatuh tempo dihasilkan **billing policy** setelah aktivasi; PRD §18 menaruh **billing di luar scope**. Jadi PDF mengandaikan modul yang PRD tidak bangun — dan itu kebetulan modul yang **sudah kita punya**.

Cara pakai keduanya: **PDF sebagai acuan proses, PRD sebagai acuan cakupan.**
