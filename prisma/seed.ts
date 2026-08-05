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
];

// Pemetaan permission per role (Phase 1).
const ALL = PERMISSIONS.map((p) => p.code);
const BASE = ["dashboard.view", "approvals.view", "approvals.create"];
const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ALL,
  management: [...BASE, "approvals.act", "audit_log.view", "users.view", "roles.view", "master_data.view"],
  finance: [...BASE, "approvals.act", "master_data.view"],
  sales_manager: [...BASE, "approvals.act"],
  noc_manager: [...BASE, "approvals.act"],
  it_manager: [...BASE, "approvals.act"],
  operational_coordinator: [...BASE, "approvals.act"],
  project_manager: [...BASE, "approvals.act"],
  marketing: BASE,
  sales: BASE,
  customer_service: BASE,
  warehouse: BASE,
  technician: BASE,
  noc_engineer: BASE,
  developer: BASE,
  devops_engineer: BASE,
  it_support: BASE,
};

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

// Approval matrix (PRD §48). Catatan: step "Supervisor" pada PRD dipetakan
// sementara ke role yang tersedia — lihat docs/TECHNICAL-PLAN.md §9.
const APPROVAL_RULES: {
  module: string; subtype: string | null; name: string;
  min: number; max: number | null; steps: string[];
}[] = [
  { module: "petty_cash", subtype: null, name: "Petty Cash ≤ Rp500.000", min: 0, max: 500_000, steps: ["finance"] },
  { module: "petty_cash", subtype: null, name: "Petty Cash Rp500.001–Rp2.000.000", min: 500_001, max: 2_000_000, steps: ["finance", "management"] },
  { module: "petty_cash", subtype: null, name: "Petty Cash > Rp2.000.000", min: 2_000_001, max: null, steps: ["finance", "management"] },
  { module: "network_change", subtype: "standard", name: "Standard Change", min: 0, max: null, steps: ["noc_manager"] },
  { module: "network_change", subtype: "normal", name: "Normal Change", min: 0, max: null, steps: ["noc_manager", "management"] },
  { module: "network_change", subtype: "major", name: "Major Change", min: 0, max: null, steps: ["noc_manager", "it_manager", "management"] },
  { module: "network_change", subtype: "emergency", name: "Emergency Change (post-review wajib)", min: 0, max: null, steps: ["noc_manager"] },
  { module: "deployment", subtype: "staging", name: "Deployment Staging", min: 0, max: null, steps: ["it_manager"] },
  { module: "deployment", subtype: "production_minor", name: "Production Minor", min: 0, max: null, steps: ["it_manager"] },
  { module: "deployment", subtype: "production_major", name: "Production Major", min: 0, max: null, steps: ["it_manager", "management"] },
  { module: "general", subtype: null, name: "Pengajuan Umum", min: 0, max: null, steps: ["management"] },
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

  console.log("Seeding admin user...");
  const adminHash = await bcrypt.hash("Admin#12345", 12);
  const admin = await db.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      email: "admin@perumnet.id",
      name: "Super Admin",
      passwordHash: adminHash,
      mustChangePassword: true,
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

  console.log("Seeding approval matrix...");
  for (const rule of APPROVAL_RULES) {
    const existing = await db.approvalRule.findFirst({
      where: { module: rule.module, subtype: rule.subtype, name: rule.name },
    });
    if (existing) continue;
    await db.approvalRule.create({
      data: {
        module: rule.module,
        subtype: rule.subtype,
        name: rule.name,
        minAmount: BigInt(rule.min),
        maxAmount: rule.max === null ? null : BigInt(rule.max),
        steps: {
          create: rule.steps.map((roleCode, i) => ({
            stepOrder: i + 1,
            roleId: roleMap.get(roleCode)!,
          })),
        },
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
