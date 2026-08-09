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

**Phase 6 — IT/DevOps** ✅

- Server & application inventory: environment, owner, tujuan wajib, criticality,
  expiry kontrak (§38)
- IT Service Desk **terbuka untuk seluruh staff**: 13 jenis tiket, prioritas,
  alur New → Assigned → In Progress/Waiting → Resolved → Closed; resolve wajib
  resolusi, tutup hanya setelah resolved; staff non-IT hanya melihat tiketnya
  sendiri (§39)
- Access management: alasan wajib, **akses production wajib approval IT
  Manager** (rule 28), akses sementara wajib expiry (rule 29), **offboarding
  mencabut seluruh akses aktif** sekali jalan (rule 30), tidak ada kolom
  password/secret (rule 31) (§40)
- Deployment management: development/testing tanpa approval; staging &
  production lewat approval matrix (§48); **production diblokir** tanpa hasil
  testing, change record (rule 24), rollback plan (rule 25), maintenance
  window, dan backup sukses **yang sudah diverifikasi** (§42);
  pengaju tidak bisa menyetujui deployment sendiri (rule 26); hasil eksekusi
  & rollback tercatat
- Backup & DR: lokasi + retention wajib, backup production wajib terenkripsi,
  backup gagal wajib kronologi (tercatat sebagai BACKUP_FAILED di audit log),
  verifikasi backup kritikal (rule 27) + restore test berkala (§44)
- Domain, SSL, license & subscription: expiry tracking dengan reminder
  per-aset, biaya BigInt rupiah (§45)
- Service layer `src/lib/itops.ts`; engine diuji 73 skenario positif + negatif

**Phase 7 — Integrasi** ✅

- **Notification engine** (§50): event-based di `src/lib/notify.ts` — approval
  masuk → approver step aktif dinotifikasi, keputusan → pengaju dinotifikasi
  (berlaku otomatis untuk semua modul ber-approval); plus event kunci:
  incident besar, alarm critical, backup gagal, deployment gagal, akses
  diberikan, tiket di-assign/selesai, info gangguan. Halaman `/notifications`
  + badge unread di sidebar. Kolom channel disiapkan untuk WhatsApp/email.
- **Integration adapter layer** (§56): registry integrasi per kategori/provider
  di `/settings/integrations` — secret TIDAK disimpan di database, kolom
  credential hanya menerima *nama environment variable* (NFR §57, rule 31);
  webhook token per-integrasi dengan rotasi; log event masuk/keluar.
- **Webhook monitoring inbound** (§30–31): `POST
  /api/integrations/[kode]/webhook` menerima alert generik
  (Zabbix/LibreNMS/Prometheus/MikroTik) → alarm otomatis tertaut
  device/site, severity dipetakan (Disaster→Critical dll), **duplikat
  dikelompokkan** (anti alarm-flooding), alert RESOLVED **auto-clear** alarm,
  alarm Critical/Major menotifikasi tim NOC.
- **Outage communication** (§33): NOC menyetujui info per-incident untuk
  komunikasi eksternal (catatan publik + estimasi pemulihan); halaman
  `/outages` untuk seluruh staff **hanya menampilkan yang disetujui**;
  publikasi & pemulihan menotifikasi CS/Sales/Management.
- Engine diuji 39 skenario + uji webhook end-to-end via HTTP.
- *Adapter live (billing, WhatsApp send, MikroTik API, GitHub, accounting,
  customer portal) menunggu keputusan Product Owner & kredensial — lihat
  `docs/TECHNICAL-PLAN.md` §9.*

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
