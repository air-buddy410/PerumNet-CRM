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
  { code: "noc_manager", name: "NOC Manager", description: "Kesehatan jaringan, SLA incident, approval network change, maintenance." },
  { code: "noc_engineer", name: "NOC Engineer", description: "Monitoring, alarm, incident ticket, troubleshooting, eskalasi." },
  { code: "it_manager", name: "IT Manager / DevOps Lead", description: "Server & aplikasi, approval deployment production, backup & DR, akses." },
  { code: "developer", name: "Developer", description: "Pengembangan aplikasi, PR, testing, release note, migration." },
  { code: "devops_engineer", name: "DevOps Engineer", description: "CI/CD, deployment, container, monitoring aplikasi, backup, rollback." },
  { code: "it_support", name: "IT Support", description: "Perangkat kerja, akun internal, ticket IT, onboarding/offboarding." },
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
];

// Pemetaan permission per role.
const ALL = PERMISSIONS.map((p) => p.code);
// cash.create untuk semua role: seluruh divisi dapat mengajukan expense (PRD §22).
// it_tickets.create & access.request untuk semua role: service desk terbuka
// bagi seluruh staff (PRD §39–40). outages.view: seluruh staff boleh melihat
// status gangguan yang telah disetujui untuk komunikasi (§33).
const BASE = ["dashboard.view", "approvals.view", "approvals.create", "cash.create", "it_tickets.create", "access.request", "outages.view"];
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
  management: [...BASE, "approvals.act", "audit_log.view", "users.view", "roles.view", "master_data.view", ...CRM_VIEW, ...INV_VIEW, "finance.view", "projects.view", "noc.view", "it.view", "billing.view"],
  finance: [...BASE, "approvals.act", "master_data.view", ...CRM_VIEW, "inventory.view", "finance.view", "cash.post", "cash.reverse", "cash.manage", "closings.manage", "projects.view", "billing.view", "billing.manage", "invoices.create", "invoices.post"],
  sales_manager: [...BASE, "approvals.act", ...SALES_CORE, "leads.assign"],
  noc_manager: [...BASE, "approvals.act", ...CRM_VIEW, "noc.view", "net_inventory.manage", "ipam.manage", "alarms.manage", "incidents.create", "incidents.manage", "incidents.close", "maintenance.manage", "changes.create", "changes.implement", "changes.review", "integrations.manage"],
  it_manager: [...BASE, "approvals.act", "it.view", "it_inventory.manage", "it_tickets.manage", "access.manage", "deployments.create", "deployments.execute", "backups.manage", "it_assets.manage", "integrations.manage"],
  operational_coordinator: [...BASE, "approvals.act", ...CRM_VIEW, "surveys.manage", "surveys.execute", "subscriptions.edit", "subscriptions.activate", ...INV_VIEW, "stock.create", "work_orders.create", "work_orders.assign", "work_orders.close"],
  project_manager: [...BASE, "approvals.act", ...INV_VIEW, "projects.view", "projects.manage", "projects.close"],
  marketing: [...BASE, "campaigns.view", "campaigns.manage", "leads.view", "leads.create", "leads.assign"],
  sales: [...BASE, ...SALES_CORE],
  customer_service: [...BASE, "customers.view", "customers.edit", "subscriptions.view", "subscriptions.edit", "leads.view", "leads.create", "work_orders.view", "billing.view"],
  warehouse: [...BASE, ...INV_VIEW, "items.manage", "stock.create", "stock.post", "stock.reverse", "devices.writeoff", "opname.manage"],
  technician: [...BASE, "work_orders.view", "work_orders.execute", "custody.view", "inventory.view"],
  noc_engineer: [...BASE, "noc.view", "net_inventory.manage", "ipam.manage", "alarms.manage", "incidents.create", "incidents.manage", "maintenance.manage", "changes.create", "changes.implement"],
  developer: [...BASE, "it.view", "deployments.create"],
  devops_engineer: [...BASE, "it.view", "it_inventory.manage", "deployments.create", "deployments.execute", "backups.manage"],
  it_support: [...BASE, "it.view", "it_tickets.manage", "access.manage", "it_assets.manage"],
};

// Struktur organisasi: staff -> supervisor -> owner; staff & supervisor per divisi.
const DIVISIONS: [string, string][] = [
  ["MGT", "Management"],
  ["MKT", "Marketing"],
  ["SLS", "Sales"],
  ["CS", "Customer Service"],
  ["FIN", "Finance"],
  ["WH", "Warehouse"],
  ["OPS", "Operational"],
  ["PRJ", "Project"],
  ["NOC", "NOC"],
  ["IT", "IT/DevOps"],
];

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
  code: string; name: string; down: number; up: number; price: number; install: number;
}[] = [
  { code: "HOME-10", name: "Home 10 Mbps", down: 10, up: 5, price: 150_000, install: 250_000 },
  { code: "HOME-20", name: "Home 20 Mbps", down: 20, up: 10, price: 200_000, install: 250_000 },
  { code: "HOME-50", name: "Home 50 Mbps", down: 50, up: 25, price: 300_000, install: 250_000 },
  { code: "BIZ-100", name: "Business 100 Mbps", down: 100, up: 50, price: 1_000_000, install: 500_000 },
];

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
  { module: "network_change", subtype: "standard", name: "Standard Change", min: 0, max: null, steps: [R("noc_manager")] },
  { module: "network_change", subtype: "normal", name: "Normal Change", min: 0, max: null, steps: [R("noc_manager"), OWN] },
  { module: "network_change", subtype: "major", name: "Major Change", min: 0, max: null, steps: [R("noc_manager"), R("it_manager"), OWN] },
  { module: "network_change", subtype: "emergency", name: "Emergency Change (post-review wajib)", min: 0, max: null, steps: [R("noc_manager")] },
  { module: "deployment", subtype: "staging", name: "Deployment Staging", min: 0, max: null, steps: [R("it_manager")] },
  { module: "deployment", subtype: "production_minor", name: "Production Minor", min: 0, max: null, steps: [R("it_manager")] },
  { module: "deployment", subtype: "production_major", name: "Production Major", min: 0, max: null, steps: [R("it_manager"), OWN] },
  { module: "general", subtype: null, name: "Pengajuan Umum", min: 0, max: null, steps: [SUP, OWN] },
  { module: "quotation_discount", subtype: null, name: "Diskon Quotation ≤ Rp500.000", min: 0, max: 500_000, steps: [R("sales_manager")] },
  { module: "quotation_discount", subtype: null, name: "Diskon Quotation > Rp500.000", min: 500_001, max: null, steps: [R("sales_manager"), OWN] },
  { module: "stock_opname", subtype: null, name: "Adjustment Stock Opname", min: 0, max: null, steps: [SUP, OWN] },
  { module: "device_writeoff", subtype: null, name: "Write-off Perangkat (Lost/Damaged)", min: 0, max: null, steps: [SUP, OWN] },
  { module: "network_maintenance", subtype: null, name: "Network Maintenance", min: 0, max: null, steps: [R("noc_manager")] },
  // Phase 6: akses production wajib approval IT Manager (rule 28).
  { module: "access_request", subtype: "production", name: "Akses Production", min: 0, max: null, steps: [R("it_manager")] },
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
    await db.division.upsert({ where: { code }, update: { name }, create: { code, name } });
  }
  const divisionMap = new Map(
    (await db.division.findMany()).map((d) => [d.code, d.id])
  );

  console.log("Seeding admin user (owner)...");
  const adminHash = await bcrypt.hash("Admin#12345", 12);
  const admin = await db.user.upsert({
    where: { username: "admin" },
    update: { level: "OWNER", divisionId: divisionMap.get("MGT") },
    create: {
      username: "admin",
      email: "admin@perumnet.id",
      name: "Owner PerumNet",
      passwordHash: adminHash,
      mustChangePassword: true,
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
      },
    });
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

  console.log("Seed selesai. Login awal: admin / Admin#12345 (wajib ganti password).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
