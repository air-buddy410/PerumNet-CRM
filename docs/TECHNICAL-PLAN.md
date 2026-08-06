# Technical Plan — PerumNet CRM

**Sumber requirement:** `docs/PRD-PerumNet-CRM.md` v1.2
**Status:** Living document — diperbarui setiap fase.
**Tanggal:** 2026-08-06

---

## 1. Ringkasan Pemahaman PRD

PerumNet CRM adalah sistem operasi terpadu untuk ISP yang mencakup 7 domain besar:

1. **Sales & CRM** — campaign → lead → pipeline → survey → quotation → customer → subscription → ticket.
2. **Inventory & Device Tracking** — item master, serialized device, goods receipt, stock issue, technician custody, instalasi, return, opname. Stock hanya berubah lewat transaksi.
3. **Operational** — work order (instalasi, troubleshooting, maintenance) dengan checklist, foto, dan pertanggungjawaban material.
4. **Finance** — petty cash multi-cashbook, direct expense, reimbursement, cash advance, closing harian/bulanan. Saldo hanya berubah lewat transaksi.
5. **NOC** — network inventory (site, device, link), IPAM, alarm, incident/outage, maintenance, change management dengan approval + rollback plan.
6. **IT/DevOps** — server/application inventory, IT ticket, deployment dengan approval, backup + verifikasi, access governance, domain/SSL/license expiry.
7. **Cross-cutting** — approval matrix terkonfigurasi, audit log permanen, RBAC granular, notification, reporting, dashboard per divisi.

### Prinsip non-negotiable (dari PRD §7 & §53)

- **Transaction-based**: stock & saldo TIDAK PERNAH diedit langsung; hanya berubah via transaksi resmi yang diposting.
- **Immutable posted transaction**: transaksi posted tidak bisa diedit/dihapus; koreksi = reversal.
- **Segregation of duties**: pembuat transaksi tidak boleh approve transaksinya sendiri.
- **Mandatory evidence**: setiap pengeluaran/aktivitas sensitif punya bukti.
- **Change control**: network change & production deployment wajib approval + rollback plan.
- **Traceability**: setiap entitas punya tujuan, PIC, lokasi, referensi, status, riwayat.
- **Audit trail**: semua aktivitas sensitif tercatat, log tidak bisa dihapus dari aplikasi.

---

## 2. Rekomendasi Teknologi

| Layer | Pilihan | Alasan |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | Full-stack satu codebase, Server Components + Server Actions, mudah jadi PWA (kebutuhan mobile PRD §55), SSR cepat (<3 dtk PRD §57). |
| Database | **SQLite (dev) → PostgreSQL (production)** via **Prisma ORM** | Prisma portable antar keduanya; dev tanpa dependensi eksternal sehingga project selalu bisa dijalankan; production pakai PostgreSQL. |
| Auth | **Custom session: bcryptjs + JWT (jose) di httpOnly cookie** | Sederhana, auditable, tanpa dependensi vendor; 2FA bisa ditambah di atasnya. |
| Validasi | **Zod** | Validasi input server-side konsisten. |
| UI | **Tailwind CSS** + komponen internal | Ringan, konsisten, brand teal PerumNet. |
| Mobile | **PWA** (fase lanjut: manifest, offline shell, kamera/QR) | Sesuai PRD §55 tahap awal PWA. |

Keputusan penting: **amount disimpan sebagai integer rupiah (BigInt)** — tidak ada floating point untuk uang.

---

## 3. Arsitektur Sistem

```
┌────────────────────────── Next.js App ──────────────────────────┐
│  App Router (React Server Components)                           │
│  ├─ /login          — public                                    │
│  ├─ /(app)/*        — protected (middleware JWT guard)          │
│  │                                                              │
│  Server Actions / Route Handlers  ← satu-satunya jalur mutasi   │
│  ├─ lib/rbac      — requirePermission() di setiap mutasi        │
│  ├─ lib/approval  — approval engine (rule matching, SoD check)  │
│  ├─ lib/audit     — logAudit() dipanggil setiap aksi sensitif   │
│  └─ lib/session   — JWT httpOnly cookie                         │
│                                                                 │
│  Prisma ORM ── SQLite (dev) / PostgreSQL (prod)                 │
└─────────────────────────────────────────────────────────────────┘
```

- **Modular monolith**: satu aplikasi, satu database, modul dipisah per folder. Integrasi eksternal (MikroTik, RADIUS, monitoring, billing) masuk lewat adapter layer di Phase 7 — tidak mengubah core.
- **Semua mutasi** melewati: session check → permission check → business-rule check → transaksi DB → audit log. Tidak ada jalur "edit langsung" untuk nilai yang diturunkan dari transaksi (stock, saldo).
- **Immutability** ditegakkan di service layer: tidak ada endpoint update/delete untuk posted transaction & audit log.

---

## 4. Modul MVP vs Lanjutan

**MVP** (PRD §58): Authentication; User/Role/Permission; Audit log; Campaign dasar; Lead; Sales activity & pipeline; Survey; Quotation; Customer; Subscription; Customer ticket; Work order; Item master; Warehouse; Serialized device; Goods receipt; Stock issue; Technician custody; Installation; Return; Stock transfer/adjustment/opname; Project dasar; Petty cash; Reimbursement; Cash advance; Approval workflow; Network site/device inventory; Basic IPAM; Manual alarm & incident; Outage; Network maintenance; Network change; Server/App inventory; IT ticket; Deployment record; Backup record; Dashboard; Reporting; Notification.

**Lanjutan (post-MVP)**: monitoring otomatis (SNMP/Zabbix/LibreNMS), auto-alarm→incident, CI/CD integration, WhatsApp/billing/payment gateway, customer portal, capacity trending, komisi otomatis, NOC shift management penuh.

---

## 5. Rancangan Database

### 5.1 Phase 1 (diimplementasikan sekarang)

```
User ──< UserRole >── Role ──< RolePermission >── Permission
User ──< AuditLog                       (append-only, tanpa update/delete)
Role ──< ApprovalRuleStep >── ApprovalRule (module, subtype, min/max amount)
User ──< ApprovalRequest ──< ApprovalStep (per-step: role wajib, actor, aksi)
CostCenter | Category | Area | Package  (master data, soft-deactivate)
```

- `ApprovalRule` = approval matrix terkonfigurasi (PRD §48): per modul, subtipe (mis. jenis change), dan rentang nilai; berisi urutan step role approver.
- `ApprovalRequest` generik: modul lain (petty cash, change, deployment) cukup menyimpan `entityType` + `entityId`.
- SoD ditegakkan di engine: `requestedBy` tidak pernah bisa approve; satu user tidak bisa approve dua step pada request yang sama.

### 5.2 ERD keseluruhan (ringkas, fase berikutnya)

```
Campaign ──< Lead ──< SalesActivity          Lead → (convert) → Customer
Lead ──< Survey                              Customer ──< Subscription ──< CustomerTicket
Survey → Quotation (versioned) → SalesOrder → WorkOrder

Item ──< StockLevel >── Warehouse            Item ──< SerializedDevice
StockTransaction (GR/Issue/Return/Transfer/Adjustment; immutable, reversal-only)
SerializedDevice → DeviceMovement (riwayat lokasi + custodian; satu lokasi & custodian aktif)
WorkOrder ──< MaterialUsage                  Technician custody = agregasi DeviceMovement

Cashbook ──< CashTransaction (immutable; topup/expense/advance/settlement/reversal)
CashTransaction → CostCenter + Category + referensi (WO/Project/Incident/…) + Evidence

Site ──< NetworkDevice ──< Link              Subnet ──< IPAddress (unique)
Alarm >── Incident ──< IncidentTimeline      Incident → ChangeRequest (rollback plan wajib)
Server ──< Application ──< Deployment        Application ──< BackupRecord
```

---

## 6. Struktur Folder

```
PerumNet-CRM/
├── docs/                       # PRD + technical plan
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                 # roles, permissions, admin, master data, approval matrix
├── public/
├── src/
│   ├── middleware.ts           # JWT guard semua route (app)
│   ├── lib/
│   │   ├── db.ts               # Prisma singleton
│   │   ├── session.ts          # JWT cookie
│   │   ├── auth.ts             # login/logout
│   │   ├── rbac.ts             # getCurrentUser, requirePermission
│   │   ├── audit.ts            # logAudit (append-only)
│   │   ├── approval.ts         # approval engine
│   │   └── constants.ts        # module, action, role codes
│   ├── components/             # Logo, AppShell, UI kecil
│   └── app/
│       ├── login/
│       ├── (app)/
│       │   ├── dashboard/
│       │   ├── approvals/      # daftar, detail, pengajuan, konfigurasi matrix
│       │   ├── audit-log/
│       │   ├── profile/
│       │   └── settings/
│       │       ├── users/  roles/
│       │       └── master/ (cost-centers, categories, areas, packages)
│       └── icon.svg            # favicon (logo PerumNet)
```

Fase berikutnya menambah folder per modul di `(app)/` (sales, crm, inventory, finance, noc, itops) + service di `lib/modules/`.

---

## 7. Halaman, Role & Permission (Phase 1)

**Halaman:** `/login`, `/dashboard`, `/approvals` (+ `/new`, `/[id]`, `/rules`), `/audit-log`, `/profile`, `/settings/users` (+ new/detail), `/settings/roles` (+ detail), `/settings/master/{cost-centers,categories,areas,packages}`.

**Mutasi (server actions):** login, logout, ganti password; user create/update/deactivate/assign-role/reset-password; role permission update; master data create/update/toggle; approval submit/approve/reject/cancel.

**Role (17, dari PRD §6):** super_admin, management, marketing, sales_manager, sales, customer_service, finance, warehouse, operational_coordinator, technician, project_manager, noc_manager, noc_engineer, it_manager, developer, devops_engineer, it_support.

**Permission Phase 1:** `dashboard.view`, `users.view|create|edit`, `roles.view|manage`, `master_data.view|manage`, `approvals.view|create|act|configure`, `audit_log.view`. Fase berikutnya menambah permission per modul mengikuti daftar aksi PRD §54 (view/create/submit/approve/post/reverse/close/export/…).

---

## 8. Roadmap (mengikuti PRD §59)

| Fase | Lingkup | Status |
|---|---|---|
| **1. Foundation** | Auth, user/role/permission, approval engine + matrix, audit log, master data (cost center, kategori, area, paket), app shell + dashboard | **← sekarang** |
| 2. Sales & CRM | Campaign, lead, pipeline, activity, survey, quotation (versioned), customer, subscription | |
| 3. Inventory & Operational | Item master, warehouse, serialized device, GR, stock issue, custody, WO, instalasi, return, opname | |
| 4. Finance & Project | Cashbook, expense, reimbursement, cash advance, settlement, closing, project + rekonsiliasi | |
| 5. NOC | Site/device/link inventory, IPAM, alarm, incident, outage, maintenance, change mgmt, NOC dashboard | |
| 6. IT/DevOps | Server/app inventory, IT ticket, access request, deployment, backup, domain/SSL, dashboard | |
| 7. Integrasi | Billing, MikroTik, RADIUS, monitoring, WhatsApp, GitHub, accounting, customer portal | |

Setiap fase: schema → service (business rules) → UI → seed → verifikasi build & jalan.

---

## 9. Risiko Teknis & Keputusan yang Perlu Ditentukan

### Ambiguitas requirement (butuh keputusan Product Owner)

1. ~~**"Supervisor" pada approval matrix petty cash**~~ — **DIPUTUSKAN (2026-08-06):** struktur organisasi `staff → supervisor → owner`; staff & supervisor melekat per divisi; owner = super admin penuh. Implementasi: entitas `Division`, field `User.level` (STAFF/SUPERVISOR/OWNER) + `User.divisionId`, dan step approval bertipe `ROLE` / `SUPERVISOR` (supervisor divisi pengaju, di-resolve saat submit) / `OWNER`. Owner dapat memutus semua jenis step, tetap terikat SoD (tidak bisa memutus request sendiri, tidak bisa memutus dua step pada satu request).
2. **Billing & pembayaran** — PRD menyebut verifikasi pembayaran & MRR tetapi billing ada di "integrasi potensial". Apakah invoice/billing dibangun internal atau integrasi sistem eksisting?
3. **Batas diskon per level** (§6.4 "sesuai limit") — nilai limit belum didefinisikan.
4. **SLA konkret** (follow-up lead, incident per severity) — angka target belum ada; dibuat konfigurasi.
5. **Komisi Sales** — formula belum didefinisikan (persen? flat? per paket?).
6. **Perhitungan harga rata-rata inventory** (moving average vs FIFO) memengaruhi inventory valuation.
7. **Multi-warehouse & lokasi fisik** — hierarki lokasi (gudang → rak?) belum jelas.
8. **Retensi & storage bukti foto** — lokal vs object storage (S3/R2)? Berapa besar kuota?
9. **2FA** — role mana yang wajib, metode (TOTP?).

### Risiko teknis

- **Scope sangat besar** (40 modul) → mitigasi: fase ketat, foundation kuat, approval/audit generik dipakai ulang semua modul.
- **Konsistensi transaksi stock/saldo** → semua posting dalam DB transaction + guard saldo/stock negatif di service layer, bukan di UI.
- **Migrasi SQLite → PostgreSQL** → jaga schema portable (tanpa fitur khusus SQLite), gunakan Prisma migrate sejak awal produksi.
- **Notifikasi real-time & monitoring** → fase 7; desain event-based (tabel Notification) agar channel (in-app → WhatsApp/email) bisa ditambah.
- **Audit log 5 tahun** → volume besar; index per modul+tanggal, arsip berkala ke cold storage.
