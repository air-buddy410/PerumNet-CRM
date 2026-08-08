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

**Phase 2 — Sales & CRM** 🚧 sedang berjalan

- Schema lengkap: campaign, lead, aktivitas, opportunity, survey, quotation
  (versioned), customer, subscription, attachment
- Service layer `src/lib/crm.ts` dengan business rules PRD (owner wajib,
  alasan Lost, quotation accepted immutable, approval diskon, aktivasi bukan Sales)
- UI selesai: Marketing Campaign, Lead (daftar, buat, detail: assign, status,
  aktivitas, opportunity, konversi)
- UI menyusul: Pipeline board, Survey, Quotation, Customer, Subscription

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
