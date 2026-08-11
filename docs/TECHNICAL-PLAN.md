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
| **1. Foundation** | Auth, user/role/permission, approval engine + matrix, audit log, master data (cost center, kategori, area, paket), app shell + dashboard | ✅ selesai |
| **2. Sales & CRM** | Campaign, lead, pipeline, activity, survey, quotation (versioned), customer, subscription | ✅ selesai (termasuk foto bukti survey + approval diskon quotation) |
| **3. Inventory & Operational** | Item master, warehouse, serialized device, GR, stock issue, custody, WO, instalasi, return, opname | ✅ selesai (ledger immutable + reversal, custody bulk & serialized, gerbang penutupan WO, opname ber-approval, write-off ber-approval) |
| **4. Finance & Project** | Cashbook, expense, reimbursement, cash advance, settlement, closing, project + rekonsiliasi | ✅ selesai (ledger kas immutable + approval matrix, advance overdue block, closing harian/bulanan dengan kunci periode, gerbang penutupan proyek) |
| **5. NOC** | Site/device/link inventory, IPAM, alarm, incident, outage, maintenance, change mgmt | ✅ selesai (IPAM anti-duplikat + wajib tertaut perangkat/layanan, incident lifecycle dengan timeline append-only & gerbang penutupan P1/P2 oleh NOC Manager + preventive action, maintenance ber-approval, change management dengan rollback plan wajib + post-review emergency + SoD reviewer≠eksekutor) |
| **6. IT/DevOps** | Server/app inventory, IT ticket, access request, deployment, backup, domain/SSL | ✅ selesai (service desk terbuka semua staff, akses production ber-approval + offboarding cabut semua akses, deployment production dengan gerbang §42 lengkap [change record, rollback plan, testing, backup terverifikasi, window] + SoD pengaju≠approver, backup production wajib terenkripsi + verifikasi backup kritikal, tracking expiry domain/SSL/license) |
| **7. Integrasi** | Notification engine, integration adapter layer, webhook monitoring, outage communication | ✅ selesai (notifikasi event-based di-hook ke approval engine + event kunci semua modul; registry integrasi §56 dengan secret via env var — bukan plaintext; webhook inbound `/api/integrations/[code]/webhook` → alarm otomatis dengan dedup anti-flooding §31 + auto-clear; halaman Status Gangguan §33 khusus info yang disetujui NOC). **Adapter eksternal live (billing, WhatsApp send, MikroTik API, GitHub, accounting, customer portal) menunggu keputusan PO & kredensial — registry sudah siap menampung konfigurasinya.** |

| **8. Billing & Invoice** | Addon service, billing profile, invoice run bulanan idempoten, invoice/lines, void, aging piutang | ✅ selesai (lihat `DESIGN-PHASE-8-BILLING-AND-BEYOND.md` — menutup gap G1/G4/G5/G13/G23; PPN snapshot per invoice, void + alasan tanpa hapus, generator aman dijalankan ulang via kunci unik subscription+period+type; jurnal GL menyusul Fase 11, kolom `journalEntryId` sudah disiapkan) |
| **9. Payment & Merchant/Kolektor** | Payment + alokasi multi-invoice, merchant/kolektor + fee, bundle gateway + webhook | ✅ selesai (alokasi eksplisit wajib = nominal, posting/reversal satu-satunya jalur ubah piutang, fee kolektor per pembayaran → basis Hutang Fee GL Fase 11, webhook gateway via `/api/integrations/[code]/webhook` dengan dispatch kategori; asumsi §11: merchant = entitas baru, komisi persen per merchant; **gateway live & payment URL menunggu kredensial provider §11.7**) |
| **10. Isolir & Dunning + MikroTik** | Kebijakan dua ambang, isolir/pemulihan sebagai event, antrian job router, auto-restore saat lunas | ✅ selesai (keputusan §11.4 diselesaikan konfiguratif: ambang hari lewat tempo DAN jumlah tunggakan — mana yang lebih dulu; gerbang tanggal isolir per langganan; isolir tidak pernah langsung ke router — lewat NetworkAccessJob yang auditable & retryable; sync failures = state, bukan log; **adapter MikroTik live menunggu kredensial §11.7 — executor pluggable sudah siap**) |
| **11. General Ledger** | CoA berjenjang, jurnal append-only, PostingRule, auto-posting billing/payment, laporan | ✅ selesai (debit=kredit divalidasi di engine; GL aktif via konfigurasi PostingRule — saat aktif, invoice/pembayaran WAJIB berjurnal atau operasi gagal (§0.2); jurnal kas petty cash menyusul — butuh pemetaan kategori→akun; laporan: buku besar, neraca saldo, neraca, laba rugi — arus kas/perubahan modal/rasio menyusul) |
| **12. Helpdesk Pelanggan & Dispatch** | CustomerTicket + workflow per kategori, pause/MTTR, sub-tiket, member, dispatch board | ✅ selesai (MTTR bersih dari jeda pause — nilai tambah vs sistem lama; workflow menggerbang solve; sub-tiket 1 tingkat menggerbang close parent; tiket tertaut WorkOrder sehingga material gudang tercatat; dispatch board = view tanpa model baru; notifikasi pelanggan multi-channel menyusul Fase 15) |
| **13. FTTH Port Management** | OLT → PON → ODP kaskade → OdpPort per-port, penelusuran pelanggan, tools teknis | ✅ selesai (perbaikan atas sistem lama: port bernomor tahu dipakai pelanggan mana; portUsed = turunan yang direkap engine + fungsi rekonsiliasi; kredensial OLT = nama env var (rule 31); IP & burst calculator. **Monitoring probe/PPPoE realtime (G9) menunggu kredensial OLT/router — sama seperti adapter MikroTik §11.7**) |
| **14. HRD & Absensi** | Karyawan (menempel User), shift & jadwal, absensi ber-geofence, izin/cuti & lembur, rekap bulanan | ✅ selesai (karyawan = profil di atas `User` yang sudah ada, bukan tabel orang paralel; hierarki atasan dijaga bebas siklus dan menjadi sumber step `SUPERVISOR`; geofence ditegakkan di service layer via haversine — clock-in di luar radius ditolak engine; izin/cuti & lembur memakai approval engine yang sama, berjenjang atasan → HRD (§8), keputusan disinkronkan balik ke catatan absensi; **payroll di luar lingkup**) |
| **15. Kanal Pelanggan** | Template pesan, preferensi notifikasi, antrian pesan keluar + rate limit & retry, blast, pengumuman/promo | ✅ selesai (menutup gap G11/G12; preferensi pelanggan ditegakkan di engine — `NONE` ditolak sejak antrian, begitu pula kanal tanpa kontak; antrian auditable & retryable meniru NetworkAccessJob Fase 10 dengan status/attempts/lastError + rate limit per eksekusi; blast menghormati preferensi per pelanggan dan melaporkan alasan yang dilewati; **adapter WhatsApp/SMTP live menunggu kredensial §11.7 — executor pluggable sudah siap, pengirim default menggagalkan job dengan pesan jelas**; *portal self-service pelanggan menunggu keputusan PO soal autentikasi pelanggan*) |

| **16. Saldo Berdimensi & Reservasi** | `StockLevel` onHand/reserved/damaged/inTransit, reservasi via draft, `DocumentSequence` atomik | ✅ selesai (PRD-WAREHOUSE-ENHANCEMENT F1/F2/F4; `available = onHand − reserved` selalu turunan; draft STOCK_ISSUE/STOCK_TRANSFER menahan stock sehingga dua draft tidak bisa menjanjikan unit yang sama; penomoran pindah dari `count()+1` ke sequence atomik — sekaligus menutup celah konkurensi nomor invoice DECISIONS-PHASE-8 §5; `inTransit` disiapkan tapi baru dipakai Fase 17) |

| **17. Transfer Tiga Langkah** | Posting transfer = pengiriman, `inTransit` gudang tujuan, dokumen penerimaan bertahap | ✅ selesai (PRD-WAREHOUSE-ENHANCEMENT F3; barang selalu terlihat di salah satu dari tiga tempat — gudang asal, perjalanan, gudang tujuan; `TransferReceipt` mendukung penerimaan bertahap sehingga transfer tetap PARTIAL sampai lengkap; reversal ditolak begitu ada yang diterima — koreksinya lewat transfer balik; perbaikan: rekonsiliasi kini membalik tanda untuk transaksi reversal, sebelumnya terhitung ganda) |

| **18. Surat Jalan, IRF & Return** | DeliveryOrder, InventoryRequestForm + tanda tangan dua pihak, pengembalian dua jalur | ✅ selesai (PRD-WAREHOUSE-ENHANCEMENT F5/F6/F8; maks satu DO aktif per transaksi, pembuat DO tidak boleh menyetujui sendiri; IRF + dua tanda tangan terbit di dalam transaksi posting yang sama sehingga tidak ada dokumen yatim; pengembalian diajukan pemegang barang & diverifikasi orang lain, kondisi DAMAGED/RMA masuk dimensi `damaged` bukan stock siap pakai) |

| **19. Portal Permintaan Material** | MaterialRequest dari lapangan, keputusan admin membuat draft pengeluaran + reservasi | ✅ selesai (PRD-WAREHOUSE-ENHANCEMENT F7; teknisi/vendor mengajukan sendiri lewat /portal, pengaju tidak boleh memutuskan sendiri, penolakan wajib beralasan; persetujuan langsung mereservasi stock sehingga ketersediaan divalidasi saat keputusan, bukan saat serah terima; katalog portal tanpa data harga internal) |

| **20. Slot, Lokasi Fisik & Opname Ketat** | StockSlot + ledger alokasi, Rack→Bin, tipe & koordinat gudang, gerbang snapshot opname | ✅ selesai (PRD-WAREHOUSE-ENHANCEMENT F9/F10/F11; sisa belum dialokasikan adalah TURUNAN onHand − alokasi bernama sehingga tidak bisa menyimpang dari saldo; ledger slot append-only; perpindahan di atas ambang butuh izin khusus; slot sistem & slot berisi tidak bisa dinonaktifkan; opname menolak diposting bila saldo berubah sejak snapshot) |

| **21. Pendukung Gudang** | Barcode item, scope gudang per user, kategori FTTH dua tingkat, satuan baku | ✅ selesai (PRD-WAREHOUSE-ENHANCEMENT F12; 19 kategori FTTH dengan materialType; scope gudang bertahap — user tanpa baris scope tidak dibatasi, yang punya scope ditolak menyentuh gudang lain sejak pembuatan draft; satuan dikunci ke daftar baku, tidak seperti sistem pembanding yang mencampur unit/PC/pcs/ROL/M) |

Fase 8–15 sudah ter-merge ke `main` lewat PR #2–#9 (2026-08-10). Asalnya dari riset banding terhadap sistem helpdesk lama — lihat `FEATURE-GAP-ANALYSIS-HELPDESK-V2.md` (gap G1–G23) dan `DESIGN-PHASE-8-BILLING-AND-BEYOND.md`. Keputusan desain §11 yang diambil selama implementasi tercatat di `DECISIONS-PHASE-8.md`, termasuk satu yang masih menunggu pemilik proyek: **retensi data identitas (foto selfie & jejak lokasi absensi)**.

| **22. NOC Satu Kesatuan** | Peleburan noc_manager + noc_engineer → peran tunggal `noc` | ✅ selesai (PRD-NOC-TOOLS §0/N5; migrasi memindahkan penugasan user & langkah approval ke peran baru sebelum peran lama dihapus, jadi database berisi tidak kehilangan akses; **SoD tidak hilang** — post-review change tetap menolak eksekutornya sendiri karena ditegakkan per-record, bukan per-peran) |
| **23. Peta Jaringan Terpadu** | ODP berwarna okupansi + titik pelanggan + kaskade ODP + denah port | ✅ selesai (PRD-NOC-TOOLS N1; tanpa dependensi baru dan tanpa server ubin eksternal — SVG mandiri, jalan di jaringan tertutup; okupansi dihitung dari OdpPort nyata bukan kolom turunan; pelanggan tanpa koordinat sendiri digambar di titik ODP-nya dan dihitung terbuka) |

| **24. Monitor PPPoE (MikroTik)** | Adapter RouterOS v7 REST read-only, poller, Total/Aktif/Offline/Disable | ✅ selesai (PRD-NOC-TOOLS N2; v7 REST di atas HTTPS jadi **tanpa dependensi baru** — cukup fetch bawaan; adapter READ-ONLY, perintah yang mengubah layanan tetap lewat NetworkAccessJob Fase 10; kredensial lewat nama env var (`credentialRef`) bukan nilai, mengikuti pola Fase 13; username dicocokkan ke `Subscription.pppoeUsername` yang sudah ada; kegagalan polling jadi state terlihat di PppoePollRun, bukan log tenggelam) |

| **25. Probe Monitoring Realtime** | ProbeTarget + ProbeResult, alarm berambang, auto-clear saat pulih | ✅ selesai (PRD-NOC-TOOLS N3; metode TCP connect karena ICMP butuh raw socket/root yang tidak tersedia di proses aplikasi — konsekuensinya port per target dapat dikonfigurasi; DOWN tidak langsung membangunkan orang, alarm baru naik setelah gagal beruntun mencapai ambang lalu ditutup sendiri saat pulih, memakai NetworkAlarm + dedupKey yang sudah ada; halaman menandai target yang lama tidak diperiksa agar worker mati tidak lolos perhatian) |

| **26. Impor/Ekspor KML** | Ambil titik ODP dari survei lapangan, keluarkan peta ODP untuk Google Earth | ✅ selesai (PRD-NOC-TOOLS N4; parser ditulis tanpa dependensi XML; impor WAJIB dua tahap — pratinjau menampilkan cocok/baru/ganda/ditolak beserta pergeseran koordinat dalam meter sebelum apa pun disimpan; impor hanya menyentuh koordinat, kapasitas & relasi ODP tidak pernah diubah berkas peta; placemark rusak dilaporkan, tidak dibuang diam-diam; ODP baru dibuat berstatus PLANNED; KMZ sengaja tidak didukung — diminta ekstrak dulu) |

Setiap fase: schema → service (business rules) → UI → seed → verifikasi build & jalan.

**Tes:** `npm test` — test runner bawaan Node (`node:test`) lewat `tsx`, tanpa dependensi baru. Saat ini 41 tes unit atas fungsi murni (KML, klasifikasi PPPoE, okupansi & proyeksi peta, penomoran dokumen, pembulatan PPN). Tes integrasi berbasis database belum ada dan butuh database tersendiri — lihat `tests/README.md`.

---

## 9. Risiko Teknis & Keputusan yang Perlu Ditentukan

### Ambiguitas requirement (butuh keputusan Product Owner)

1. ~~**"Supervisor" pada approval matrix petty cash**~~ — **DIPUTUSKAN (2026-08-06):** struktur organisasi `staff → supervisor → owner`; staff & supervisor melekat per divisi; owner = super admin penuh. Implementasi: entitas `Division`, field `User.level` (STAFF/SUPERVISOR/OWNER) + `User.divisionId`, dan step approval bertipe `ROLE` / `SUPERVISOR` (supervisor divisi pengaju, di-resolve saat submit) / `OWNER`. Owner dapat memutus semua jenis step, tetap terikat SoD (tidak bisa memutus request sendiri, tidak bisa memutus dua step pada satu request).
2. ~~**Billing & pembayaran**~~ — **DIPUTUSKAN (2026-08-10):** dibangun **internal**, bukan integrasi ke sistem eksisting. Alasan: isolir otomatis menuntut billing dan status layanan berada di satu sistem; riset banding menunjukkan sistem sejenis juga membangunnya internal dan menjahitnya ke GL. Implementasi di Fase 8–11.
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
