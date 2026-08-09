# PerumNet CRM

CRM & Operations Management System untuk ISP PerumNet.

- Requirement utama: [docs/PRD-PerumNet-CRM.md](docs/PRD-PerumNet-CRM.md)
- Rencana teknis & roadmap: [docs/TECHNICAL-PLAN.md](docs/TECHNICAL-PLAN.md)

## Status

**Phase 1 — Foundation** ✅

- Authentication (session JWT httpOnly, bcrypt, wajib ganti password awal)
- User management (tanpa hard-delete — nonaktifkan saja)
- 17 role standar + permission granular (RBAC)
- Struktur organisasi: **staff → supervisor → owner**, staff/supervisor per divisi
- Approval engine + approval matrix terkonfigurasi (PRD §48) dengan step dinamis
  (Supervisor divisi pengaju / Owner / role fungsional), segregation of duties
- Audit log append-only (PRD §51)
- Master data: divisi, cost center, kategori pengeluaran, area, paket internet
- App shell + dashboard

**Phase 2 — Sales & CRM** ✅

- Marketing Campaign (cost per lead), Lead (assign, status, aktivitas,
  follow-up overdue), Pipeline board per stage
- Survey: pengajuan → penjadwalan teknisi → hasil feasibility + foto bukti
- Quotation versioned (accepted = immutable, revisi = versi baru) dengan
  approval diskon otomatis via approval engine
- Konversi lead → customer + subscription draft (wajib quotation Accepted)
- Subscription lifecycle: Draft → Menunggu Instalasi → Aktif → Isolir/Suspend/
  Terminasi; aktivasi butuh izin khusus (bukan Sales — rule 17)
- Service layer `src/lib/crm.ts` menegakkan seluruh business rules di server

**Phase 3 — Inventory & Operational** ✅

- Item master (serialized/bulk), multi-gudang, posisi stock dengan flag low-stock
- Ledger transaksi stock **immutable**: GR (input SN, duplikat ditolak), issue ke
  teknisi, return, transfer, adjustment — saldo hanya berubah saat posting;
  koreksi via reversal (`src/lib/inventory.ts`)
- Perangkat serialized: satu lokasi & satu custodian aktif, riwayat pergerakan
  lengkap, write-off Lost/Damaged dengan kronologi + approval (Supervisor → Owner)
- Technician custody (perangkat + material bulk) dengan flag overdue
- Work order: assign → mulai → pasang/tarik perangkat → pemakaian material →
  selesai (konfirmasi pelanggan) → tutup dengan gerbang PRD §18 (material
  dipertanggungjawabkan, foto bukti, verifikator ≠ teknisi)
- Stock opname: cut-off snapshot, variance wajib alasan, approval, posting
  adjustment otomatis

**Phase 4 — Finance & Project** ✅

- Petty cash multi-cashbook (7 kas per divisi, PRD §22) — saldo **hanya**
  berubah lewat posting; saldo negatif ditolak (`src/lib/finance.ts`)
- Expense & reimbursement: kategori + cost center + bukti wajib, approval
  matrix petty cash, nota terdeteksi duplikat (§23–24)
- Cash advance: due date wajib, **overdue memblokir pengajuan baru** (rule 13),
  settlement = pertanggungjawaban belanja + pengembalian kas (§25)
- Reversal + closing harian (variance wajib alasan) & bulanan (kunci periode —
  transaksi periode terkunci tidak bisa di-reverse) (§27)
- Project: BoM vs realisasi material, biaya proyek tertaut, **gerbang
  penutupan** — perangkat dipertanggungjawabkan, advance selesai, tidak ada
  transaksi menggantung, dokumentasi ada (§19, rule 8)

**Phase 5 — NOC (Network Operations)** ✅

- Network inventory: site (POP/tower/ODC…), perangkat jaringan (hostname unik,
  criticality, PIC), link antar site (§28)
- IPAM: subnet wajib tujuan, **IP duplikat ditolak** (rule 18), IP teralokasi
  wajib tertaut perangkat/subscription (reserved wajib keterangan), validasi
  IP-dalam-subnet; release → boleh dipakai ulang dengan riwayat di audit log (§29)
- Alarm manual: severity, acknowledge, clear, eskalasi satu klik → incident (§31)
- Incident: **wajib severity P1–P4** (rule 19), acknowledge menetapkan PIC,
  timeline **append-only** (terkunci setelah resolved), pelanggan terdampak,
  resolve wajib resolusi + verifikasi pemulihan, **penutupan** wajib root cause;
  incident besar P1/P2 hanya ditutup NOC Manager + preventive action
  (rule 20, §6.13, §32) — durasi outage tercatat otomatis
- Maintenance terjadwal: tujuan + risiko wajib, **approval sebelum eksekusi**,
  start diblokir sampai disetujui (§34)
- Change management: rollback plan wajib kecuali Standard (rule 21), **tidak
  bisa dieksekusi tanpa approval** (rule 22) mengikuti matrix per jenis change
  (§48), emergency wajib **post-review** oleh reviewer ≠ eksekutor (rule 23, §35)
- Service layer `src/lib/noc.ts`; engine diuji 66 skenario positif + negatif

## Stack

Next.js 15 (App Router, TypeScript) · Prisma ORM · SQLite (dev) / PostgreSQL (prod) · Tailwind CSS · Zod · jose · bcryptjs

## Menjalankan (development)

```bash
npm install
npm run db:setup   # buat schema + seed data awal
npm run dev
```

Buka http://localhost:3000 — login awal:

| Username | Password |
|---|---|
| `admin` | `Admin#12345` |

Admin wajib mengganti password saat pertama login.

## Prinsip sistem (tidak boleh dilanggar)

1. Stock & saldo tidak pernah diedit langsung — hanya lewat transaksi resmi.
2. Transaksi posted immutable; koreksi via reversal.
3. Pembuat transaksi tidak dapat menyetujui transaksinya sendiri.
4. Semua aktivitas sensitif tercatat di audit log (append-only).
5. Master data & user tidak dihapus — hanya dinonaktifkan.
