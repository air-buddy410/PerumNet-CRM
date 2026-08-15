// Seed data Phase 1 — idempotent (aman dijalankan berulang).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const ROLES: { code: string; name: string; description: string }[] = [
  { code: "super_admin", name: "Super Admin", description: "Konfigurasi sistem, user, role, approval workflow, master data. Bukan untuk aktivitas harian." },
  { code: "management", name: "Management", description: "Dashboard perusahaan, approval transaksi bernilai tinggi & major change." },
  { code: "marketing", name: "Marketing", description: "Campaign, channel promosi, lead collection." },
  { code: "sales_manager", name: "Sales Manager", description: "Target sales, distribusi lead, approval diskon, komisi." },
  { code: "sales", name: "Sales", description: "Lead, follow-up, opportunity, survey, quotation, konversi pelanggan." },
  { code: "customer_service", name: "Customer Service", description: "Data pelanggan, keluhan, customer ticket, informasi gangguan." },
  { code: "finance", name: "Finance", description: "Petty cash, verifikasi pengeluaran, reimbursement, cash advance, closing." },
  { code: "warehouse", name: "Warehouse", description: "Penerimaan barang, serial number, stock issue, return, transfer, opname." },
  { code: "operational_coordinator", name: "Operational Coordinator", description: "Work order, penjadwalan, penugasan teknisi, verifikasi instalasi." },
  { code: "technician", name: "Technician", description: "Pelaksanaan work order, custody perangkat, foto & checklist." },
  { code: "project_manager", name: "Project Manager", description: "Proyek, BoM, material & biaya proyek, rekonsiliasi." },
  { code: "noc", name: "NOC", description: "Satu kesatuan NOC: monitoring, alarm, incident, maintenance, network change, FTTH & peta jaringan." },
  { code: "it_manager", name: "IT Manager / DevOps Lead", description: "Server & aplikasi, approval deployment production, backup & DR, akses." },
  { code: "developer", name: "Developer", description: "Pengembangan aplikasi, PR, testing, release note, migration." },
  { code: "devops_engineer", name: "DevOps Engineer", description: "CI/CD, deployment, container, monitoring aplikasi, backup, rollback." },
  { code: "it_support", name: "IT Support", description: "Perangkat kerja, akun internal, ticket IT, onboarding/offboarding." },
  { code: "hrd", name: "HRD", description: "Karyawan, shift & jadwal, absensi, approval izin/cuti/lembur." },
];

const PERMISSIONS: { code: string; module: string; action: string; description: string }[] = [
  { code: "dashboard.view", module: "dashboard", action: "view", description: "Melihat dashboard" },
  { code: "users.view", module: "users", action: "view", description: "Melihat daftar user" },
  { code: "users.create", module: "users", action: "create", description: "Membuat user baru" },
  { code: "users.edit", module: "users", action: "edit", description: "Mengubah user, role assignment, aktif/nonaktif" },
  { code: "roles.view", module: "roles", action: "view", description: "Melihat role & permission" },
  { code: "roles.manage", module: "roles", action: "manage", description: "Mengubah permission role" },
  { code: "master_data.view", module: "master_data", action: "view", description: "Melihat master data" },
  { code: "master_data.manage", module: "master_data", action: "manage", description: "Mengelola master data" },
  { code: "approvals.view", module: "approvals", action: "view", description: "Melihat approval request" },
  { code: "approvals.create", module: "approvals", action: "create", description: "Mengajukan approval request" },
  { code: "approvals.act", module: "approvals", action: "act", description: "Menyetujui / menolak approval request" },
  { code: "approvals.configure", module: "approvals", action: "configure", description: "Mengelola approval matrix" },
  { code: "audit_log.view", module: "audit_log", action: "view", description: "Melihat audit log" },
  // Phase 2 — Sales & CRM
  { code: "campaigns.view", module: "campaigns", action: "view", description: "Melihat campaign" },
  { code: "campaigns.manage", module: "campaigns", action: "manage", description: "Mengelola campaign" },
  { code: "leads.view", module: "leads", action: "view", description: "Melihat lead" },
  { code: "leads.create", module: "leads", action: "create", description: "Membuat lead" },
  { code: "leads.edit", module: "leads", action: "edit", description: "Mengubah lead, status, dan aktivitas" },
  { code: "leads.assign", module: "leads", action: "assign", description: "Meng-assign Sales owner" },
  { code: "opportunities.view", module: "opportunities", action: "view", description: "Melihat pipeline" },
  { code: "opportunities.manage", module: "opportunities", action: "manage", description: "Mengelola opportunity & stage" },
  { code: "surveys.view", module: "surveys", action: "view", description: "Melihat survey" },
  { code: "surveys.create", module: "surveys", action: "create", description: "Mengajukan survey" },
  { code: "surveys.manage", module: "surveys", action: "manage", description: "Menjadwalkan & menugaskan survey" },
  { code: "surveys.execute", module: "surveys", action: "execute", description: "Mengisi hasil survey" },
  { code: "quotations.view", module: "quotations", action: "view", description: "Melihat quotation" },
  { code: "quotations.create", module: "quotations", action: "create", description: "Membuat quotation" },
  { code: "quotations.manage", module: "quotations", action: "manage", description: "Kirim/terima/tolak/revisi quotation" },
  { code: "customers.view", module: "customers", action: "view", description: "Melihat customer" },
  { code: "customers.create", module: "customers", action: "create", description: "Membuat customer / konversi lead" },
  { code: "customers.edit", module: "customers", action: "edit", description: "Mengubah data customer" },
  { code: "subscriptions.view", module: "subscriptions", action: "view", description: "Melihat subscription" },
  { code: "subscriptions.create", module: "subscriptions", action: "create", description: "Membuat subscription" },
  { code: "subscriptions.edit", module: "subscriptions", action: "edit", description: "Mengubah data teknis & status subscription" },
  { code: "subscriptions.activate", module: "subscriptions", action: "activate", description: "Mengaktifkan layanan (bukan Sales — rule 17)" },
  // Phase 3 — Inventory & Operational
  { code: "inventory.view", module: "inventory", action: "view", description: "Melihat item, stock, perangkat, transaksi, custody, opname" },
  { code: "items.manage", module: "inventory", action: "manage", description: "Mengelola item master & gudang" },
  { code: "stock.create", module: "stock", action: "create", description: "Membuat draft transaksi stock" },
  { code: "stock.post", module: "stock", action: "post", description: "Posting transaksi stock (mengubah saldo)" },
  { code: "stock.reverse", module: "stock", action: "reverse", description: "Reversal transaksi posted" },
  { code: "stock.receive", module: "stock", action: "receive", description: "Menerima transfer antar gudang (Fase 17)" },
  { code: "slot.approve", module: "stock", action: "approve", description: "Menyetujui perpindahan alokasi slot di atas ambang (Fase 20)" },
  { code: "devices.ownership", module: "inventory", action: "manage", description: "Mengoreksi kepemilikan perangkat (COMPANY/CUSTOMER) — ber-audit" },
  { code: "termination.create", module: "termination", action: "create", description: "Mengajukan terminasi pelanggan" },
  { code: "termination.view", module: "termination", action: "view", description: "Melihat daftar & detail terminasi" },
  { code: "termination.approve", module: "termination", action: "approve", description: "Menyetujui atau menolak terminasi" },
  { code: "termination.cancel", module: "termination", action: "cancel", description: "Membatalkan terminasi sebelum efektif" },
  { code: "device_recovery.assign", module: "device_recovery", action: "assign", description: "Menugaskan teknisi & jadwal penarikan" },
  { code: "device_recovery.pickup", module: "device_recovery", action: "pickup", description: "Mencatat percobaan & penarikan perangkat" },
  { code: "device_recovery.receive", module: "device_recovery", action: "receive", description: "Menerima perangkat ke karantina" },
  { code: "device_recovery.inspect", module: "device_recovery", action: "inspect", description: "Inspeksi & keputusan akhir perangkat" },
  { code: "device_recovery.dispose", module: "device_recovery", action: "dispose", description: "Menetapkan scrap perangkat" },
  { code: "device_recovery.escalate", module: "device_recovery", action: "escalate", description: "Eskalasi & keputusan perangkat tidak kembali" },
  { code: "devices.writeoff", module: "inventory", action: "writeoff", description: "Mengajukan & memfinalisasi write-off perangkat" },
  { code: "custody.view", module: "inventory", action: "custody", description: "Melihat custody teknisi" },
  { code: "work_orders.view", module: "work_orders", action: "view", description: "Melihat work order" },
  { code: "work_orders.create", module: "work_orders", action: "create", description: "Membuat work order" },
  { code: "work_orders.assign", module: "work_orders", action: "assign", description: "Menugaskan teknisi" },
  { code: "work_orders.execute", module: "work_orders", action: "execute", description: "Melaksanakan WO (teknisi)" },
  { code: "work_orders.close", module: "work_orders", action: "close", description: "Memverifikasi & menutup WO" },
  { code: "opname.manage", module: "inventory", action: "opname", description: "Mengelola sesi stock opname" },
  // Phase 4 — Finance & Project
  { code: "finance.view", module: "finance", action: "view", description: "Melihat cashbook, transaksi kas, dan closing" },
  { code: "cash.create", module: "finance", action: "create", description: "Membuat draft pengajuan kas (expense/reimbursement/advance)" },
  { code: "cash.post", module: "finance", action: "post", description: "Posting transaksi kas (mengubah saldo)" },
  { code: "cash.reverse", module: "finance", action: "reverse", description: "Reversal transaksi kas posted" },
  { code: "cash.manage", module: "finance", action: "manage", description: "Top-up, transfer antar kas, master cashbook" },
  { code: "closings.manage", module: "finance", action: "closing", description: "Closing harian & bulanan" },
  { code: "projects.view", module: "projects", action: "view", description: "Melihat proyek" },
  { code: "projects.manage", module: "projects", action: "manage", description: "Membuat & mengelola proyek + BoM" },
  { code: "projects.close", module: "projects", action: "close", description: "Menutup proyek (setelah rekonsiliasi)" },
  // Phase 5 — NOC
  { code: "noc.view", module: "noc", action: "view", description: "Melihat network inventory, IPAM, alarm, incident, maintenance, change" },
  { code: "noc_map.view", module: "noc", action: "view", description: "Melihat peta jaringan beserta titik pelanggan (Fase 23)" },
  { code: "net_inventory.manage", module: "noc", action: "inventory", description: "Mengelola site, perangkat jaringan, dan link" },
  { code: "ipam.manage", module: "noc", action: "ipam", description: "Mengelola subnet & alokasi IP" },
  { code: "alarms.manage", module: "noc", action: "alarm", description: "Membuat, acknowledge, dan clear alarm" },
  { code: "incidents.create", module: "noc", action: "incident_create", description: "Membuat incident ticket" },
  { code: "incidents.manage", module: "noc", action: "incident_manage", description: "Acknowledge, update, resolve, tutup incident kecil" },
  { code: "incidents.close", module: "noc", action: "incident_close", description: "Menutup incident besar P1/P2 (NOC Manager)" },
  { code: "maintenance.manage", module: "noc", action: "maintenance", description: "Mengelola network maintenance" },
  { code: "changes.create", module: "noc", action: "change_create", description: "Membuat change request" },
  { code: "changes.implement", module: "noc", action: "change_implement", description: "Mengeksekusi change yang disetujui" },
  { code: "changes.review", module: "noc", action: "change_review", description: "Post-review emergency change (NOC Manager)" },
  // Phase 6 — IT/DevOps
  { code: "it.view", module: "itops", action: "view", description: "Melihat modul IT/DevOps (server, aplikasi, deployment, backup, aset)" },
  { code: "it_inventory.manage", module: "itops", action: "inventory", description: "Mengelola server & application inventory" },
  { code: "it_tickets.create", module: "itops", action: "ticket_create", description: "Membuat tiket IT service desk" },
  { code: "it_tickets.manage", module: "itops", action: "ticket_manage", description: "Assign, update status, resolve, dan tutup tiket IT" },
  { code: "access.request", module: "itops", action: "access_request", description: "Membuat permintaan akses sistem" },
  { code: "access.manage", module: "itops", action: "access_manage", description: "Memberikan/mencabut akses & offboarding (rule 28–30)" },
  { code: "deployments.create", module: "itops", action: "deploy_create", description: "Membuat & mengajukan deployment record" },
  { code: "deployments.execute", module: "itops", action: "deploy_execute", description: "Mengeksekusi deployment yang disetujui & rollback" },
  { code: "backups.manage", module: "itops", action: "backup", description: "Mencatat, memverifikasi, dan restore test backup" },
  { code: "it_assets.manage", module: "itops", action: "asset", description: "Mengelola domain, SSL, license, dan subscription" },
  // Phase 7 — Integrasi
  { code: "integrations.manage", module: "integrations", action: "manage", description: "Registry integrasi eksternal, webhook token, log event" },
  { code: "outages.view", module: "noc", action: "outage_view", description: "Melihat status gangguan yang disetujui untuk komunikasi (§33)" },
  // Phase 8 — Billing & Invoice
  { code: "billing.view", module: "billing", action: "view", description: "Melihat invoice, invoice run, addon, aging piutang" },
  { code: "billing.manage", module: "billing", action: "manage", description: "Mengelola addon service & billing profile langganan" },
  { code: "invoices.create", module: "billing", action: "invoice_create", description: "Membuat invoice manual & invoice run bulanan" },
  { code: "invoices.post", module: "billing", action: "invoice_post", description: "Posting invoice run & void invoice" },
  // Phase 9 — Payment & Merchant
  { code: "merchants.manage", module: "billing", action: "merchant", description: "Mengelola merchant/mitra kolektor & fee" },
  { code: "payments.create", module: "billing", action: "payment_create", description: "Mencatat pembayaran & membuat bundle gateway" },
  { code: "payments.post", module: "billing", action: "payment_post", description: "Posting pembayaran (mengubah piutang invoice)" },
  { code: "payments.reverse", module: "billing", action: "payment_reverse", description: "Reversal pembayaran posted" },
  // Phase 10 — Isolir & Dunning
  { code: "dunning.manage", module: "billing", action: "dunning", description: "Kebijakan dunning, evaluasi isolir, isolir/pemulihan manual" },
  // Phase 11 — General Ledger
  { code: "gl.view", module: "gl", action: "view", description: "Melihat jurnal, buku besar, dan laporan keuangan" },
  { code: "gl.manage", module: "gl", action: "manage", description: "Mengelola Chart of Accounts & posting rules" },
  { code: "gl.post", module: "gl", action: "post", description: "Jurnal manual & reversal jurnal" },
  // Phase 12 — Helpdesk Pelanggan
  { code: "ctickets.view", module: "helpdesk", action: "view", description: "Melihat tiket pelanggan & dispatch board" },
  { code: "ctickets.create", module: "helpdesk", action: "create", description: "Membuat tiket pelanggan" },
  { code: "ctickets.manage", module: "helpdesk", action: "manage", description: "Assign, kategori, workflow, pause, solve, close tiket pelanggan" },
  // Phase 13 — FTTH Port Management
  { code: "ftth.manage", module: "noc", action: "ftth", description: "Mengelola OLT, PON port, ODP, dan alokasi port pelanggan" },
  // Phase 14 — HRD & Absensi
  { code: "hrd.view", module: "hrd", action: "view", description: "Melihat data karyawan, jadwal, absensi, dan rekap" },
  { code: "hrd.manage", module: "hrd", action: "manage", description: "Mengelola karyawan, shift, lokasi absen, jadwal" },
  { code: "attendance.self", module: "hrd", action: "self", description: "Absen mandiri & mengajukan izin/lembur" },
  // Phase 15 — Kanal Pelanggan
  { code: "channels.view", module: "channels", action: "view", description: "Melihat template pesan, antrian kirim, dan pengumuman" },
  { code: "channels.manage", module: "channels", action: "manage", description: "Mengelola template, blast pesan, pengumuman, dan antrian" },
  // Phase 66 — Data pribadi pelanggan
  { code: "customers.pii_view", module: "crm", action: "view", description: "Melihat NIK, telepon, email, dan tanggal lahir pelanggan tanpa samaran" },
  // Phase 47 — Arsip terpadu
  { code: "archive.view", module: "archive", action: "view", description: "Melihat arsip lintas modul beserta alasan pengarsipannya" },
  { code: "archive.restore", module: "archive", action: "restore", description: "Memulihkan baris yang sudah diarsipkan" },
];

// Pemetaan permission per role.
const ALL = PERMISSIONS.map((p) => p.code);
// cash.create untuk semua role: seluruh divisi dapat mengajukan expense (PRD §22).
// it_tickets.create & access.request untuk semua role: service desk terbuka
// bagi seluruh staff (PRD §39–40). outages.view: seluruh staff boleh melihat
// status gangguan yang telah disetujui untuk komunikasi (§33).
const BASE = ["dashboard.view", "approvals.view", "approvals.create", "cash.create", "it_tickets.create", "access.request", "outages.view", "attendance.self"];
const CRM_VIEW = [
  "campaigns.view", "leads.view", "opportunities.view", "surveys.view",
  "quotations.view", "customers.view", "subscriptions.view",
];
const SALES_CORE = [
  ...CRM_VIEW,
  "leads.create", "leads.edit",
  "opportunities.manage",
  "surveys.create",
  "quotations.create", "quotations.manage",
  "customers.create", "customers.edit",
  "subscriptions.create",
  // sengaja TANPA subscriptions.activate (rule 17) & leads.assign
];
const INV_VIEW = ["inventory.view", "custody.view", "work_orders.view"];
const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ALL,
  // customers.pii_view sengaja TIDAK masuk CRM_VIEW: seluruh divisi yang
  // melihat daftar pelanggan tidak perlu melihat NIK-nya. Sales menutup
  // penjualan tanpa itu, teknisi memasang tanpa itu. Yang butuh nomor utuh
  // hanya yang menangani sengketa identitas — dan itu keputusan sadar,
  // bukan efek samping punya akses CRM.
  management: [...BASE, "approvals.act", "audit_log.view", "users.view", "roles.view", "master_data.view", "customers.pii_view", ...CRM_VIEW, ...INV_VIEW, "finance.view", "projects.view", "noc.view", "it.view", "billing.view", "gl.view", "ctickets.view", "hrd.view", "channels.view", "termination.view", "termination.approve", "device_recovery.dispose", "device_recovery.escalate", "archive.view", "archive.restore"],
  finance: [...BASE, "approvals.act", "master_data.view", ...CRM_VIEW, "inventory.view", "finance.view", "cash.post", "cash.reverse", "cash.manage", "closings.manage", "projects.view", "billing.view", "billing.manage", "invoices.create", "invoices.post", "merchants.manage", "payments.create", "payments.post", "payments.reverse", "dunning.manage", "gl.view", "gl.manage", "gl.post"],
  sales_manager: [...BASE, "approvals.act", ...SALES_CORE, "leads.assign"],
  // Fase 22: noc_manager + noc_engineer dilebur. Permission = gabungan keduanya.
  // Segregation of duties TIDAK hilang — post-review change tetap menolak
  // eksekutornya sendiri (ditegakkan per-record di lib/noc.ts, bukan per-peran).
  noc: [...BASE, "approvals.act", ...CRM_VIEW, "noc.view", "net_inventory.manage", "ipam.manage", "alarms.manage", "incidents.create", "incidents.manage", "incidents.close", "maintenance.manage", "changes.create", "changes.implement", "changes.review", "integrations.manage", "billing.view", "dunning.manage", "ftth.manage", "noc_map.view"],
  it_manager: [...BASE, "approvals.act", "it.view", "it_inventory.manage", "it_tickets.manage", "access.manage", "deployments.create", "deployments.execute", "backups.manage", "it_assets.manage", "integrations.manage"],
  operational_coordinator: [...BASE, "approvals.act", ...CRM_VIEW, "surveys.manage", "surveys.execute", "subscriptions.edit", "subscriptions.activate", ...INV_VIEW, "stock.create", "work_orders.create", "work_orders.assign", "work_orders.close", "ctickets.view", "ctickets.create", "ctickets.manage", "termination.view", "device_recovery.assign"],
  project_manager: [...BASE, "approvals.act", ...INV_VIEW, "projects.view", "projects.manage", "projects.close"],
  marketing: [...BASE, "campaigns.view", "campaigns.manage", "leads.view", "leads.create", "leads.assign", "channels.view", "channels.manage"],
  sales: [...BASE, ...SALES_CORE],
  customer_service: [...BASE, "customers.view", "customers.edit", "subscriptions.view", "subscriptions.edit", "leads.view", "leads.create", "work_orders.view", "billing.view", "payments.create", "ctickets.view", "ctickets.create", "ctickets.manage", "channels.view", "channels.manage", "termination.create", "termination.view", "termination.cancel"],
  warehouse: [...BASE, ...INV_VIEW, "items.manage", "stock.create", "stock.post", "stock.reverse", "stock.receive", "slot.approve", "devices.writeoff", "devices.ownership", "opname.manage", "termination.view", "device_recovery.assign", "device_recovery.receive", "device_recovery.inspect"],
  technician: [...BASE, "work_orders.view", "work_orders.execute", "custody.view", "inventory.view", "ctickets.view", "termination.view", "device_recovery.pickup"],
  developer: [...BASE, "it.view", "deployments.create"],
  devops_engineer: [...BASE, "it.view", "it_inventory.manage", "deployments.create", "deployments.execute", "backups.manage"],
  it_support: [...BASE, "it.view", "it_tickets.manage", "access.manage", "it_assets.manage"],
  // Arsip sengaja TIDAK dibagikan luas: memulihkan baris yang sudah
  // dikeluarkan dari peredaran adalah kewenangan yang harus sedikit
  // pemegangnya. HRD boleh melihat karena akun karyawan yang dibekukan
  // berakhir di sana, tetapi memulihkannya tetap keputusan management.
  hrd: [...BASE, "approvals.act", "hrd.view", "hrd.manage", "users.view", "archive.view"],
};

// Struktur organisasi: staff -> supervisor -> owner; staff & supervisor per divisi.
/// Divisi PerumNet yang SEBENARNYA, mengikuti berkas kepegawaian dari HRD
/// (Fase 52). Sebelumnya daftar ini berisi sepuluh nama tebakan awal:
/// IT/DevOps, Project, dan Warehouse tidak ada orangnya sama sekali,
/// sedangkan dua kelompok terbesar — Accounting dan Network Operation Field —
/// tidak punya tempat.
///
/// Ini bukan sekadar penamaan: divisi menentukan grup Authentik dan tag kotak
/// surat, jadi daftar yang tidak mencerminkan organisasi akan terus terasa
/// janggal di kedua sistem itu.
///
/// Penggabungan yang disengaja: Accounting + Finance + Finance & Accounting
/// menjadi satu fungsi keuangan; Manajement (salah ketik di berkas) + Owner
/// menjadi Management.
const DIVISIONS: [string, string][] = [
  ["MGT", "Management"],
  ["MKT", "Marketing"],
  ["SLS", "Sales"],
  ["FIN", "Finance & Accounting"],
  ["NOC", "Network Operation Center"],
  ["NOF", "Network Operation Field"],
  ["OAC", "Operation Access & Customer"],
];

/// Divisi lama yang tidak dipakai lagi. DINONAKTIFKAN, bukan dihapus —
/// menonaktifkan bisa dibatalkan sedetik, menghapus tidak. Dan kalau suatu
/// saat ada baris yang terlanjur menunjuk salah satunya, penghapusan akan
/// ditolak foreign key di tengah seed.
const RETIRED_DIVISIONS = ["CS", "WH", "OPS", "PRJ", "IT"];

const COST_CENTERS: [string, string][] = [
  ["GA", "General and Administration"],
  ["OPS", "Operational"],
  ["NOC", "Network Operation Center"],
  ["NETMAINT", "Network Maintenance"],
  ["BACKBONE", "Backbone"],
  ["POP", "POP Operation"],
  ["CUSTINST", "Customer Installation"],
  ["CUSTMAINT", "Customer Maintenance"],
  ["PROJECT", "Project"],
  ["MKT", "Marketing"],
  ["SALES", "Sales"],
  ["WH", "Warehouse"],
  ["IT", "IT"],
  ["SWDEV", "Software Development"],
  ["DEVOPS", "DevOps"],
  ["CLOUD", "Cloud Infrastructure"],
  ["SEC", "Security"],
  ["MGMT", "Management"],
];

const EXPENSE_CATEGORIES: [string, string][] = [
  ["EXP-TRANSPORT", "Transportasi & BBM"],
  ["EXP-MATERIAL", "Material & Sparepart"],
  ["EXP-KONSUMSI", "Konsumsi & Entertainment"],
  ["EXP-LISTRIK", "Listrik & Utilitas"],
  ["EXP-SEWA", "Sewa & Kolokasi"],
  ["EXP-ATK", "ATK & Perlengkapan Kantor"],
  ["EXP-PROMOSI", "Promosi & Iklan"],
  ["EXP-LAIN", "Lain-lain"],
];

const AREAS: [string, string][] = [
  ["AREA-01", "Area Kota"],
  ["AREA-02", "Area Perumahan Utara"],
  ["AREA-03", "Area Perumahan Selatan"],
];

const PACKAGES: {
  code: string; name: string; down: number; up: number; price: number; install: number; desc: string;
}[] = [
  // Fase 67 — paket SEBENARNYA, disalin dari https://perumnet.id (15 Agustus
  // 2026). Sebelumnya di sini ada empat paket karangan (HOME-10 … BIZ-100)
  // yang tidak pernah dijual; lihat NONAKTIFKAN_PAKET_LAMA di bawah.
  //
  // Kecepatan SIMETRIS — dikonfirmasi pemilik produk, bukan disimpulkan dari
  // situs yang hanya menyebut satu angka.
  //
  // Paket Personal punya biaya registrasi Rp50.000. Kewajiban bayar tiga
  // bulan di muka yang tertulis di situs BUKAN sifat paketnya — itu promo
  // bundling, dan promo berubah tanpa paketnya berubah. Menaruhnya di sini
  // akan membuat setiap langganan Personal di masa depan mewarisi syarat yang
  // barangkali sudah berakhir. Ia menunggu modul promo; sampai itu ada,
  // penegakannya di penagihan.
  { code: "PERSONAL", name: "Personal", down: 27, up: 27, price: 175_000, install: 50_000,
    desc: "Registrasi Rp50.000." },
  { code: "BERDUA", name: "Berdua", down: 47, up: 47, price: 225_000, install: 0,
    desc: "Registrasi gratis. Paket paling populer." },
  { code: "KELUARGA", name: "Keluarga", down: 77, up: 77, price: 275_000, install: 0,
    desc: "Registrasi gratis." },
  { code: "NATAH", name: "Natah", down: 107, up: 107, price: 325_000, install: 0,
    desc: "Registrasi gratis." },
  { code: "BANJAR", name: "Banjar", down: 177, up: 177, price: 500_000, install: 0,
    desc: "Registrasi gratis." },
];

/**
 * Paket karangan dari seed awal — dihapus.
 *
 * Penghapusan tetap DIJAGA: hanya terjadi bila paketnya belum pernah dipakai
 * satu langganan, quotation, survey, atau lead pun. Master yang sudah
 * tersambung ke transaksi tidak akan dihapus meski namanya ada di daftar ini,
 * sebab menghapusnya memutus riwayat harga pelanggan lama dan itu tidak bisa
 * dibatalkan. Daftar ini pun sengaja tidak dikosongkan setelah dipakai: seed
 * harus tetap idempoten pada basis data yang belum pernah dijalankan.
 */
const HAPUS_PAKET_LAMA = ["HOME-10", "HOME-20", "HOME-50", "BIZ-100"];

// Approval matrix (PRD §48) dengan struktur organisasi staff -> supervisor -> owner:
// SUPERVISOR = supervisor divisi pengaju (dinamis), OWNER = pemilik,
// ROLE:<code> = role fungsional tertentu.
type SeedStep =
  | { type: "SUPERVISOR" }
  | { type: "OWNER" }
  | { type: "ROLE"; role: string };

const SUP: SeedStep = { type: "SUPERVISOR" };
const OWN: SeedStep = { type: "OWNER" };
const R = (role: string): SeedStep => ({ type: "ROLE", role });

const APPROVAL_RULES: {
  module: string; subtype: string | null; name: string;
  min: number; max: number | null; steps: SeedStep[];
}[] = [
  { module: "petty_cash", subtype: null, name: "Petty Cash ≤ Rp500.000", min: 0, max: 500_000, steps: [SUP] },
  { module: "petty_cash", subtype: null, name: "Petty Cash Rp500.001–Rp2.000.000", min: 500_001, max: 2_000_000, steps: [SUP, R("finance")] },
  { module: "petty_cash", subtype: null, name: "Petty Cash > Rp2.000.000", min: 2_000_001, max: null, steps: [SUP, R("finance"), OWN] },
  { module: "network_change", subtype: "standard", name: "Standard Change", min: 0, max: null, steps: [R("noc")] },
  { module: "network_change", subtype: "normal", name: "Normal Change", min: 0, max: null, steps: [R("noc"), OWN] },
  { module: "network_change", subtype: "major", name: "Major Change", min: 0, max: null, steps: [R("noc"), R("it_manager"), OWN] },
  { module: "network_change", subtype: "emergency", name: "Emergency Change (post-review wajib)", min: 0, max: null, steps: [R("noc")] },
  { module: "deployment", subtype: "staging", name: "Deployment Staging", min: 0, max: null, steps: [R("it_manager")] },
  { module: "deployment", subtype: "production_minor", name: "Production Minor", min: 0, max: null, steps: [R("it_manager")] },
  { module: "deployment", subtype: "production_major", name: "Production Major", min: 0, max: null, steps: [R("it_manager"), OWN] },
  { module: "general", subtype: null, name: "Pengajuan Umum", min: 0, max: null, steps: [SUP, OWN] },
  { module: "quotation_discount", subtype: null, name: "Diskon Quotation ≤ Rp500.000", min: 0, max: 500_000, steps: [R("sales_manager")] },
  { module: "quotation_discount", subtype: null, name: "Diskon Quotation > Rp500.000", min: 500_001, max: null, steps: [R("sales_manager"), OWN] },
  { module: "stock_opname", subtype: null, name: "Adjustment Stock Opname", min: 0, max: null, steps: [SUP, OWN] },
  { module: "device_writeoff", subtype: null, name: "Write-off Perangkat (Lost/Damaged)", min: 0, max: null, steps: [SUP, OWN] },
  { module: "network_maintenance", subtype: null, name: "Network Maintenance", min: 0, max: null, steps: [R("noc")] },
  // Phase 6: akses production wajib approval IT Manager (rule 28).
  { module: "access_request", subtype: "production", name: "Akses Production", min: 0, max: null, steps: [R("it_manager")] },
  // Phase 14: berjenjang — atasan (supervisor divisi pengaju) lalu HRD.
  { module: "leave_request", subtype: null, name: "Izin / Cuti Karyawan", min: 0, max: null, steps: [SUP, R("hrd")] },
  { module: "overtime_request", subtype: null, name: "Lembur Karyawan", min: 0, max: null, steps: [SUP] },
  // Fase 29: terminasi pelanggan — satu langkah ke Management. Segregation of
  // duties tetap berlaku: pengaju tidak bisa menyetujui pengajuannya sendiri.
  { module: "termination", subtype: null, name: "Terminasi Pelanggan", min: 0, max: null, steps: [R("management")] },
];

async function main() {
  console.log("Seeding roles...");
  for (const r of ROLES) {
    await db.role.upsert({
      where: { code: r.code },
      update: { name: r.name, description: r.description },
      create: { ...r, isSystem: true },
    });
  }

  console.log("Seeding permissions...");
  for (const p of PERMISSIONS) {
    await db.permission.upsert({
      where: { code: p.code },
      update: { module: p.module, action: p.action, description: p.description },
      create: p,
    });
  }

  // ── Fase 22: migrasi peran NOC lama → peran tunggal `noc` ──────
  // Dijalankan setelah peran di-seed dan sebelum permission dipetakan, agar
  // database yang sudah berisi user tidak kehilangan aksesnya saat upgrade.
  const legacyNocRoles = await db.role.findMany({
    where: { code: { in: ["noc_manager", "noc_engineer"] } },
    select: { id: true, code: true },
  });
  if (legacyNocRoles.length) {
    console.log("Migrasi peran NOC lama → peran tunggal `noc`...");
    const unified = await db.role.findUnique({ where: { code: "noc" } });
    if (unified) {
      const legacyIds = legacyNocRoles.map((r) => r.id);
      const holders = await db.userRole.findMany({
        where: { roleId: { in: legacyIds } },
        select: { userId: true },
      });
      for (const { userId } of holders) {
        await db.userRole.upsert({
          where: { userId_roleId: { userId, roleId: unified.id } },
          update: {},
          create: { userId, roleId: unified.id },
        });
      }
      await db.userRole.deleteMany({ where: { roleId: { in: legacyIds } } });
      await db.rolePermission.deleteMany({ where: { roleId: { in: legacyIds } } });
      // Step approval yang masih menunjuk peran lama dialihkan, bukan dihapus —
      // request yang sedang berjalan tidak boleh kehilangan approvernya.
      await db.approvalRuleStep.updateMany({
        where: { roleId: { in: legacyIds } },
        data: { roleId: unified.id },
      });
      await db.role.deleteMany({ where: { id: { in: legacyIds } } });
      console.log(`  ${holders.length} penugasan user dialihkan ke peran \`noc\`.`);
    }
  }

  console.log("Mapping role permissions...");
  const roleMap = new Map(
    (await db.role.findMany()).map((r) => [r.code, r.id])
  );
  const permMap = new Map(
    (await db.permission.findMany()).map((p) => [p.code, p.id])
  );
  for (const [roleCode, permCodes] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleMap.get(roleCode)!;
    for (const code of permCodes) {
      const permissionId = permMap.get(code)!;
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        update: {},
        create: { roleId, permissionId },
      });
    }
  }

  console.log("Seeding divisions...");
  for (const [code, name] of DIVISIONS) {
    await db.division.upsert({
      where: { code },
      update: { name, isActive: true },
      create: { code, name, isActive: true },
    });
  }
  // Yang lama dimatikan, bukan dihapus — dan hanya BILA sudah ada. Seed pada
  // database kosong tidak membuatnya lebih dulu supaya bisa dimatikan.
  await db.division.updateMany({
    where: { code: { in: RETIRED_DIVISIONS } },
    data: { isActive: false },
  });
  const divisionMap = new Map(
    (await db.division.findMany()).map((d) => [d.code, d.id])
  );

  console.log("Seeding admin user (owner)...");
  const adminHash = await bcrypt.hash("Admin#12345", 12);
  // allowLocalLogin WAJIB sejak seed — bukan disetel belakangan.
  //
  // Pemasangan baru mana pun dengan AUTH_PROVIDER=MAILSERVER akan TERKUNCI
  // TOTAL tanpa ini: login admin dialihkan ke mailserver, sementara alamat
  // mailserver-nya hanya bisa didaftarkan lewat halaman yang butuh login.
  // Buntu di kedua ujung, dan satu-satunya jalan keluar adalah menyunting
  // database langsung.
  //
  // Itu benar-benar terjadi pada pemasangan pertama di server (2026-08-13):
  // "Login gagal untuk admin (mailserver tidak terjawab: Mailserver belum
  // didaftarkan)". Di laptop tidak pernah kelihatan karena nilainya kebetulan
  // sudah disetel manual sejak Fase 45.
  //
  // Akun ini memang pintu darurat, dan pintu darurat harus ada sejak menit
  // pertama — bukan dipasang setelah rumahnya terkunci.
  const admin = await db.user.upsert({
    where: { username: "admin" },
    update: { level: "OWNER", divisionId: divisionMap.get("MGT"), allowLocalLogin: true },
    create: {
      username: "admin",
      email: "admin@perumnet.id",
      name: "Owner PerumNet",
      passwordHash: adminHash,
      mustChangePassword: true,
      allowLocalLogin: true,
      level: "OWNER",
      divisionId: divisionMap.get("MGT"),
    },
  });
  await db.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: roleMap.get("super_admin")! } },
    update: {},
    create: { userId: admin.id, roleId: roleMap.get("super_admin")! },
  });

  console.log("Seeding master data...");
  for (const [code, name] of COST_CENTERS) {
    await db.costCenter.upsert({ where: { code }, update: { name }, create: { code, name } });
  }
  for (const [code, name] of EXPENSE_CATEGORIES) {
    await db.category.upsert({
      where: { code },
      update: { name },
      create: { code, name, type: "EXPENSE" },
    });
  }
  for (const [code, name] of AREAS) {
    await db.area.upsert({ where: { code }, update: { name }, create: { code, name } });
  }
  for (const p of PACKAGES) {
    await db.package.upsert({
      where: { code: p.code },
      update: {},
      create: {
        code: p.code,
        name: p.name,
        downloadMbps: p.down,
        uploadMbps: p.up,
        monthlyPrice: BigInt(p.price),
        installationFee: BigInt(p.install),
        description: p.desc,
      },
    });
  }

  // Paket karangan dari seed awal dihapus — tetapi hanya yang benar-benar
  // belum tersentuh transaksi apa pun. Seluruh relasi diperiksa, bukan hanya
  // langganan: sebuah quotation lama yang menunjuk paket terhapus akan
  // meledak saat dibuka, dan itu baru ketahuan berbulan-bulan kemudian.
  for (const code of HAPUS_PAKET_LAMA) {
    const lama = await db.package.findUnique({
      where: { code },
      select: {
        id: true,
        _count: { select: { subscriptions: true, quotations: true, surveys: true, interestedLeads: true } },
      },
    });
    if (!lama) continue;
    const dipakai = Object.entries(lama._count).filter(([, n]) => n > 0);
    if (dipakai.length) {
      console.log(`  ! Paket ${code} masih dipakai (${dipakai.map(([k, n]) => `${k}=${n}`).join(", ")}) — tidak dihapus.`);
      continue;
    }
    await db.package.delete({ where: { id: lama.id } });
    console.log(`  - Paket contoh ${code} dihapus (tidak pernah dipakai).`);
  }

  console.log("Seeding inventory master...");
  const wh = await db.warehouse.upsert({
    where: { code: "WH-01" },
    update: {},
    create: { code: "WH-01", name: "Gudang Utama", address: "Kantor PerumNet" },
  });
  void wh;
  const ITEM_CATEGORIES: [string, string][] = [
    ["ITM-CPE", "Perangkat Pelanggan (CPE)"],
    ["ITM-KABEL", "Kabel & Aksesori"],
    ["ITM-JARINGAN", "Perangkat Jaringan"],
  ];
  for (const [code, name] of ITEM_CATEGORIES) {
    await db.category.upsert({
      where: { code },
      update: { name },
      create: { code, name, type: "ITEM" },
    });
  }
  const catMap = new Map(
    (await db.category.findMany({ where: { type: "ITEM" } })).map((c) => [c.code, c.id])
  );
  const ITEMS: {
    code: string; name: string; cat: string; unit: string; tracking: string; brand?: string; minStock: number;
  }[] = [
    { code: "ONT-F609", name: "ONT ZTE F609", cat: "ITM-CPE", unit: "pcs", tracking: "SERIALIZED", brand: "ZTE", minStock: 5 },
    { code: "RTR-AX2", name: "Router WiFi AX2", cat: "ITM-CPE", unit: "pcs", tracking: "SERIALIZED", brand: "Huawei", minStock: 3 },
    { code: "KBL-DROP1C", name: "Kabel Drop Core 1 Core", cat: "ITM-KABEL", unit: "meter", tracking: "BULK", minStock: 500 },
    { code: "KLM-S", name: "Klem S", cat: "ITM-KABEL", unit: "pcs", tracking: "BULK", minStock: 100 },
    { code: "KON-SC", name: "Konektor SC Fast Connector", cat: "ITM-KABEL", unit: "pcs", tracking: "BULK", minStock: 50 },
  ];
  for (const it of ITEMS) {
    await db.item.upsert({
      where: { code: it.code },
      update: { name: it.name, minStock: it.minStock },
      create: {
        code: it.code,
        name: it.name,
        categoryId: catMap.get(it.cat),
        unit: it.unit,
        trackingType: it.tracking,
        brand: it.brand,
        minStock: it.minStock,
      },
    });
  }

  console.log("Seeding cashbooks...");
  const CASHBOOKS: [string, string][] = [
    ["KAS-KANTOR", "Petty Cash Kantor"],
    ["KAS-OPS", "Petty Cash Operational"],
    ["KAS-PRJ", "Petty Cash Project"],
    ["KAS-SLS", "Petty Cash Sales"],
    ["KAS-MKT", "Petty Cash Marketing"],
    ["KAS-NOC", "Petty Cash NOC"],
    ["KAS-IT", "Petty Cash IT/DevOps"],
  ];
  for (const [code, name] of CASHBOOKS) {
    await db.cashbook.upsert({ where: { code }, update: { name }, create: { code, name } });
  }

  console.log("Seeding approval matrix...");
  for (const rule of APPROVAL_RULES) {
    const stepsData = rule.steps.map((s, i) => ({
      stepOrder: i + 1,
      approverType: s.type,
      roleId: s.type === "ROLE" ? roleMap.get(s.role)! : null,
    }));

    const existing = await db.approvalRule.findFirst({
      where: { module: rule.module, subtype: rule.subtype, name: rule.name },
    });
    if (existing) {
      // Sinkronkan definisi step rule (request lama tidak terpengaruh —
      // step request di-snapshot saat submit).
      await db.approvalRuleStep.deleteMany({ where: { ruleId: existing.id } });
      await db.approvalRule.update({
        where: { id: existing.id },
        data: { steps: { create: stepsData } },
      });
      continue;
    }
    await db.approvalRule.create({
      data: {
        module: rule.module,
        subtype: rule.subtype,
        name: rule.name,
        minAmount: BigInt(rule.min),
        maxAmount: rule.max === null ? null : BigInt(rule.max),
        steps: { create: stepsData },
      },
    });
  }

  // Phase 11 — Chart of Accounts default (gaya penomoran §7.1; kode bisa
  // disesuaikan PO — saat migrasi, kode akun lama dipertahankan §10).
  console.log("Seeding chart of accounts...");
  const COA: { code: string; name: string; category: string; normalSide: string; parent?: string; isTax?: boolean; taxPercent?: number }[] = [
    { code: "1-10000", name: "Kas Tunai", category: "KAS_BANK", normalSide: "DEBIT" },
    { code: "1-10050", name: "Bank", category: "KAS_BANK", normalSide: "DEBIT" },
    { code: "1-10100", name: "Piutang Usaha", category: "PIUTANG", normalSide: "DEBIT" },
    { code: "1-10200", name: "Persediaan", category: "PERSEDIAAN", normalSide: "DEBIT" },
    { code: "2-20100", name: "Hutang Usaha", category: "HUTANG", normalSide: "CREDIT" },
    { code: "2-20101", name: "Hutang Fee Mitra", category: "HUTANG", normalSide: "CREDIT" },
    { code: "2-20500", name: "PPN Keluaran", category: "KEWAJIBAN_LANCAR_LAIN", normalSide: "CREDIT", isTax: true, taxPercent: 11 },
    { code: "3-30000", name: "Modal", category: "EKUITAS", normalSide: "CREDIT" },
    { code: "4-40000", name: "Pendapatan Jasa Internet", category: "PENDAPATAN", normalSide: "CREDIT" },
    { code: "4-40100", name: "Pendapatan Instalasi", category: "PENDAPATAN", normalSide: "CREDIT" },
    { code: "5-50000", name: "Beban Operasional", category: "BEBAN", normalSide: "DEBIT" },
    { code: "5-50100", name: "Beban Fee Kolektor", category: "BEBAN", normalSide: "DEBIT" },
    { code: "5-50200", name: "Beban Biaya Gateway", category: "BEBAN", normalSide: "DEBIT" },
  ];
  const accountMap = new Map<string, string>();
  for (const a of COA) {
    const row = await db.account.upsert({
      where: { code: a.code },
      update: { name: a.name, category: a.category, normalSide: a.normalSide },
      create: {
        code: a.code, name: a.name, category: a.category, normalSide: a.normalSide,
        isTaxAccount: a.isTax ?? false, taxPercent: a.taxPercent ?? null,
      },
    });
    accountMap.set(a.code, row.id);
  }
  // Posting rules default — GL aktif karena INVOICE_POSTED ada (§5).
  const RULES: { event: string; debit?: string; credit?: string }[] = [
    { event: "INVOICE_POSTED", debit: "1-10100", credit: "4-40000" },
    { event: "INVOICE_TAX", credit: "2-20500" },
    { event: "PAYMENT_RECEIVED", debit: "1-10000", credit: "1-10100" },
    { event: "COLLECTOR_FEE", debit: "5-50100", credit: "2-20101" },
    { event: "GATEWAY_FEE", debit: "5-50200" },
  ];
  for (const r of RULES) {
    await db.postingRule.upsert({
      where: { event: r.event },
      update: {},
      create: {
        event: r.event,
        debitAccountId: r.debit ? accountMap.get(r.debit)! : null,
        creditAccountId: r.credit ? accountMap.get(r.credit)! : null,
      },
    });
  }

  // Phase 12 — kategori tiket pelanggan + workflow contoh
  console.log("Seeding helpdesk categories...");
  const wfInstall = await db.workflowTemplate.upsert({
    where: { name: "Instalasi Pelanggan Baru" },
    update: {},
    create: { kind: "TICKET", name: "Instalasi Pelanggan Baru" },
  });
  const WF_STEPS: [number, string, boolean][] = [
    [1, "Survey lokasi & cek jalur", true],
    [2, "Tarik kabel & pasang perangkat", true],
    [3, "Aktivasi & tes kecepatan", true],
    [4, "Edukasi pelanggan", false],
  ];
  for (const [order, name, isRequired] of WF_STEPS) {
    await db.workflowStep.upsert({
      where: { templateId_order: { templateId: wfInstall.id, order } },
      update: { name, isRequired },
      create: { templateId: wfInstall.id, order, name, isRequired },
    });
  }
  const TICKET_CATS: { name: string; slaHours?: number; workflowId?: string }[] = [
    { name: "Router Problem", slaHours: 12 },
    { name: "Weak Signal", slaHours: 24 },
    { name: "Fiber Problem", slaHours: 24 },
    { name: "Billing", slaHours: 48 },
    { name: "New Client Installation", slaHours: 72, workflowId: wfInstall.id },
    { name: "Change Wifi Password", slaHours: 6 },
    { name: "Customer Relocation", slaHours: 72 },
    { name: "Complaint Non-Teknis", slaHours: 48 },
  ];
  for (const c of TICKET_CATS) {
    await db.ticketCategory.upsert({
      where: { name: c.name },
      update: { slaHours: c.slaHours ?? null, workflowId: c.workflowId ?? null },
      create: { name: c.name, slaHours: c.slaHours ?? null, workflowId: c.workflowId ?? null },
    });
  }

  console.log("Seeding message templates...");
  const TEMPLATES: { code: string; name: string; channel: string; subject?: string; body: string }[] = [
    {
      code: "INVOICE_TERBIT", name: "Tagihan Terbit", channel: "WHATSAPP",
      body: "Halo {{nama}}, tagihan {{periode}} sebesar {{jumlah}} telah terbit dan jatuh tempo {{jatuh_tempo}}. Terima kasih.",
    },
    {
      code: "TAGIHAN_JATUH_TEMPO", name: "Pengingat Jatuh Tempo", channel: "WHATSAPP",
      body: "Halo {{nama}}, tagihan {{nomor_invoice}} sebesar {{jumlah}} jatuh tempo {{jatuh_tempo}}. Mohon segera diselesaikan.",
    },
    {
      code: "GANGGUAN_INFO", name: "Info Gangguan", channel: "WHATSAPP",
      body: "Pelanggan yth {{nama}}, saat ini terjadi gangguan di area Anda. {{keterangan}} Estimasi pemulihan {{eta}}. Mohon maaf atas ketidaknyamanannya.",
    },
    {
      code: "TIKET_SELESAI", name: "Tiket Selesai", channel: "WHATSAPP",
      body: "Halo {{nama}}, laporan Anda ({{nomor_tiket}}) telah kami selesaikan. {{resolusi}} Terima kasih.",
    },
  ];
  for (const t of TEMPLATES) {
    await db.messageTemplate.upsert({
      where: { code: t.code },
      update: { name: t.name, channel: t.channel, body: t.body, subject: t.subject ?? null },
      create: { code: t.code, name: t.name, channel: t.channel, body: t.body, subject: t.subject ?? null },
    });
  }

  console.log("Seeding kategori material FTTH...");
  const FTTH_CATEGORIES: [string, string, string][] = [
    ["ADP", "Adapter", "Connector"],
    ["CLS", "Closure", "Passive Device"],
    ["CSM", "Consumable", "Consumable"],
    ["DRP", "Dropcore", "Cable"],
    ["FOC", "Kabel Fiber Optic", "Cable"],
    ["FSC", "Fast Connector", "Connector"],
    ["ODC", "ODC", "Passive Device"],
    ["ODP", "ODP", "Passive Device"],
    ["OLT", "OLT", "Network Device"],
    ["ONT", "ONU / ONT", "Network Device"],
    ["PCH", "Patchcord", "Cable"],
    ["PGT", "Pigtail", "Cable"],
    ["PWR", "Power Supply", "Power"],
    ["RTR", "Router", "Network Device"],
    ["SFP", "SFP", "Network Device"],
    ["SPL", "Splitter", "Passive Device"],
    ["SWT", "Switch", "Network Device"],
    ["TLS", "Tools", "Tools"],
    ["OTH", "Lainnya", "Other"],
  ];
  for (const [code, name, materialType] of FTTH_CATEGORIES) {
    await db.category.upsert({
      where: { code },
      update: { name, materialType },
      create: { code, name, materialType, type: "ITEM" },
    });
  }

  console.log("Seeding tipe slot stock...");
  const SLOT_TYPES = [
    ["UNALLOC", "Belum Dialokasikan", true],
    ["INST", "Instalasi", false],
    ["MNT", "Maintenance", false],
    ["MKT", "Marketing", false],
    ["PRJ", "Proyek", false],
    ["EMG", "Emergency", false],
    ["SPR", "Cadangan", false],
    ["RMA", "RMA", false],
    ["DEMO", "Demo", false],
    ["OTHER", "Lainnya", false],
    // Fase 28 (PRD terminasi) — perangkat hasil penarikan SELALU masuk
    // QUARANTINE dulu; hanya yang lulus inspeksi pindah ke SECOND.
    ["QUARANTINE", "Karantina", true],
    ["SECOND", "Layak Pakai Ulang", false],
  ] as const;
  for (const [code, name, isSystem] of SLOT_TYPES) {
    await db.stockSlotType.upsert({
      where: { code },
      update: { name, isSystem },
      create: { code, name, isSystem },
    });
  }
  console.log("Seeding kebijakan SLA recovery perangkat...");
  await db.deviceRecoverySetting.upsert({
    where: { id: "default-recovery-setting" },
    update: {},
    create: { id: "default-recovery-setting", name: "Default", slaDays: 7, minAttempts: 3 },
  });

  await db.slotTransferPolicy.upsert({
    where: { id: "default-slot-policy" },
    update: {},
    create: { id: "default-slot-policy", name: "Ambang default", maxQty: 50 },
  });

  console.log("Seed selesai. Login awal: admin / Admin#12345 (wajib ganti password).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
