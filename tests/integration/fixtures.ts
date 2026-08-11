/**
 * Perkakas fixture untuk tes integrasi.
 *
 * Prinsipnya: setiap berkas tes membangun dunianya sendiri dari nol dan
 * membersihkannya setelah selesai. Tidak ada tes yang bergantung pada sisa
 * tes lain — kebergantungan seperti itu membuat kegagalan berpindah-pindah
 * dan orang berhenti mempercayai suite-nya.
 */
import { assertTestDatabase } from "./db";

// Dijalankan SEBELUM modul apa pun yang menyentuh Prisma di-import.
assertTestDatabase(process.env.DATABASE_URL);

import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/constants";
import type { CurrentUser } from "@/lib/rbac";

/** Semua permission — dipakai bila tes ingin menguji aturan bisnis, bukan RBAC. */
export const ALL_PERMISSIONS = new Set<string>(Object.values(PERMISSIONS));

export function actor(
  id: string,
  name: string,
  opts: { divisionId?: string | null; permissions?: Set<string>; roles?: CurrentUser["roles"] } = {}
): CurrentUser {
  return {
    id,
    username: name,
    email: `${name}@test.local`,
    name,
    level: "STAFF",
    divisionId: opts.divisionId ?? null,
    divisionName: null,
    mustChangePassword: false,
    roles: opts.roles ?? [],
    permissions: opts.permissions ?? ALL_PERMISSIONS,
  };
}

/**
 * Menyiapkan master data minimal yang dibutuhkan hampir semua tes.
 * Idempoten: aman dipanggil berulang kali.
 */
export async function ensureMasterData() {
  const division = await db.division.upsert({
    where: { code: "TST" },
    update: {},
    create: { code: "TST", name: "Divisi Uji" },
  });
  const role = await db.role.upsert({
    where: { code: "management" },
    update: {},
    create: { code: "management", name: "Management" },
  });
  const warehouse = await db.warehouse.upsert({
    where: { code: "WH-TEST" },
    update: { isActive: true },
    create: { code: "WH-TEST", name: "Gudang Uji", isActive: true },
  });
  const category = await db.category.upsert({
    where: { code: "CAT-TEST" },
    update: {},
    create: { code: "CAT-TEST", name: "Kategori Uji", type: "ITEM" },
  });
  const item = await db.item.upsert({
    where: { code: "ITM-TEST-ONT" },
    update: {},
    create: {
      code: "ITM-TEST-ONT",
      name: "ONT Uji",
      unit: "unit",
      trackingType: "SERIALIZED",
      categoryId: category.id,
    },
  });
  const pkg = await db.package.upsert({
    where: { code: "PKG-TEST" },
    update: {},
    create: {
      code: "PKG-TEST",
      name: "Paket Uji",
      downloadMbps: 20,
      uploadMbps: 10,
      monthlyPrice: BigInt(250_000),
    },
  });
  // Kebijakan SLA dipakai modul recovery; dikunci ke nilai yang diketahui
  // supaya tes tidak ikut berubah bila default seed diubah.
  const setting = await db.deviceRecoverySetting.findFirst({ where: { name: "Uji" } });
  if (setting) {
    await db.deviceRecoverySetting.updateMany({ where: {}, data: { isActive: false } });
    await db.deviceRecoverySetting.update({
      where: { id: setting.id },
      data: { slaDays: 7, minAttempts: 3, isActive: true },
    });
  } else {
    await db.deviceRecoverySetting.updateMany({ where: {}, data: { isActive: false } });
    await db.deviceRecoverySetting.create({
      data: { name: "Uji", slaDays: 7, minAttempts: 3, isActive: true },
    });
  }

  return { division, role, warehouse, item, pkg, category };
}

let seq = 0;
/** Penanda unik per pemanggilan — mencegah tabrakan unique antar tes. */
export function tag(prefix: string): string {
  seq += 1;
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

export async function makeUser(
  username: string,
  name: string,
  opts: { divisionId?: string; roleId?: string } = {}
) {
  return db.user.create({
    data: {
      username,
      email: `${username}@test.local`,
      name,
      // Hash yang sengaja tidak sah: user tes tidak pernah dipakai login.
      passwordHash: "!integration-test-no-login",
      level: "STAFF",
      divisionId: opts.divisionId ?? null,
      ...(opts.roleId ? { roles: { create: { roleId: opts.roleId } } } : {}),
    },
  });
}

export async function makeCustomerWithService(
  createdById: string,
  packageId: string,
  label: string
) {
  const customer = await db.customer.create({
    data: {
      customerNumber: `CST-${label}`,
      name: `Pelanggan ${label}`,
      phone: "0800000000",
      address: `Jl. Uji ${label}`,
      latitude: -8.65,
      longitude: 115.21,
      createdById,
    },
  });
  const subscription = await db.subscription.create({
    data: {
      serviceNumber: `SVC-${label}`,
      customerId: customer.id,
      packageId,
      monthlyPrice: BigInt(250_000),
      downloadMbps: 20,
      uploadMbps: 10,
      status: "ACTIVE",
      pppoeUsername: `user-${label}`,
      createdById,
    },
  });
  return { customer, subscription };
}

export async function makeDevice(
  itemId: string,
  serial: string,
  opts: { ownership?: string; subscriptionId?: string; customerId?: string; status?: string } = {}
) {
  return db.serializedDevice.create({
    data: {
      serialNumber: serial,
      itemId,
      status: opts.status ?? "INSTALLED",
      ownership: opts.ownership ?? "COMPANY",
      subscriptionId: opts.subscriptionId ?? null,
      customerId: opts.customerId ?? null,
    },
  });
}

/** Menyiapkan aturan approval satu langkah untuk modul tertentu. */
export async function ensureApprovalRule(module: string, roleId: string) {
  const existing = await db.approvalRule.findFirst({ where: { module } });
  if (existing) {
    await db.approvalRuleStep.deleteMany({ where: { ruleId: existing.id } });
    await db.approvalRule.update({
      where: { id: existing.id },
      data: { steps: { create: [{ stepOrder: 1, approverType: "ROLE", roleId }] } },
    });
    return existing;
  }
  return db.approvalRule.create({
    data: {
      module,
      subtype: null,
      name: `${module} (uji)`,
      minAmount: BigInt(0),
      maxAmount: null,
      steps: { create: [{ stepOrder: 1, approverType: "ROLE", roleId }] },
    },
  });
}

/**
 * Mengosongkan seluruh data transaksional.
 *
 * Urutannya mengikuti arah foreign key — anak lebih dulu. Master data
 * (item, gudang, paket, role, divisi) sengaja DIPERTAHANKAN supaya
 * `ensureMasterData()` tetap murah.
 */
export async function resetTransactionalData() {
  await db.deviceInspection.deleteMany({});
  await db.deviceRecoveryAttempt.deleteMany({});
  await db.deviceRecoveryItem.deleteMany({});
  await db.deviceRecoveryIssue.deleteMany({});
  await db.customerTermination.deleteMany({});
  await db.documentSignature.deleteMany({});
  await db.attachment.deleteMany({});
  // Topologi FTTH yang dibuat tes ikut dibersihkan. Tanpa ini, kode ODP
  // tersisa dari jalankan sebelumnya dan tes gagal karena unique constraint
  // pada jalankan KEDUA — kegagalan yang menyesatkan karena kodenya benar.
  await db.odpPort.deleteMany({});
  await db.odp.deleteMany({});
  await db.deviceMovement.deleteMany({});
  await db.stockTransactionLine.deleteMany({});
  await db.stockTransaction.deleteMany({});
  await db.stockLevel.deleteMany({});
  await db.custodyLevel.deleteMany({});
  await db.serializedDevice.deleteMany({});
  await db.materialUsage.deleteMany({});
  await db.workOrder.deleteMany({});
  await db.notification.deleteMany({});
  await db.approvalStep.deleteMany({});
  await db.approvalRequest.deleteMany({});
  await db.auditLog.deleteMany({});
  await db.documentSequence.deleteMany({});
  await db.subscription.deleteMany({});
  await db.customer.deleteMany({});
  await db.userRole.deleteMany({});
  await db.user.deleteMany({});
}

export { db };

// ── Skenario siap pakai ─────────────────────────────────────────
// Membangun terminasi yang sudah disetujui beserta surat penarikannya.
// Dipakai banyak tes; ditaruh di sini supaya setiap tes bisa langsung
// menyatakan hal yang ingin dijaganya, bukan mengulang 30 baris persiapan.

import { createTermination, submitTermination, syncTerminationDecision } from "@/lib/termination";
import { actOnApproval } from "@/lib/approval";

export interface Scenario {
  cs: CurrentUser;
  manager: CurrentUser;
  customerId: string;
  subscriptionId: string;
  warehouseId: string;
  itemId: string;
  terminationId: string;
  recoveryId: string;
  itemRows: { id: string; deviceId: string; snapshotSerial: string }[];
}

export async function approvedTermination(opts?: {
  devices?: { serial: string; ownership?: string }[];
  label?: string;
}): Promise<Scenario> {
  const master = await ensureMasterData();
  await ensureApprovalRule("termination", master.role.id);

  const label = opts?.label ?? tag("T");
  const csRow = await makeUser(`cs-${label}`, `CS ${label}`, { divisionId: master.division.id });
  const mgrRow = await makeUser(`mgr-${label}`, `Manager ${label}`, {
    divisionId: master.division.id,
    roleId: master.role.id,
  });
  const cs = actor(csRow.id, `CS ${label}`, { divisionId: master.division.id });
  const manager = actor(mgrRow.id, `Manager ${label}`, {
    divisionId: master.division.id,
    roles: [{ id: master.role.id, code: "management", name: "Management" }],
  });

  const { customer, subscription } = await makeCustomerWithService(csRow.id, master.pkg.id, label);
  for (const d of opts?.devices ?? [{ serial: `SN-${label}-1` }]) {
    await makeDevice(master.item.id, d.serial, {
      ownership: d.ownership ?? "COMPANY",
      subscriptionId: subscription.id,
      customerId: customer.id,
    });
  }

  const created = await createTermination(cs, {
    subscriptionId: subscription.id,
    reason: "uji integrasi",
    reasonCategory: "OTHER",
    effectiveDate: new Date(),
    warehouseToId: master.warehouse.id,
  });
  if (!created.ok) throw new Error(`gagal membuat terminasi: ${created.error}`);
  const submitted = await submitTermination(cs, created.id);
  if (!submitted.ok) throw new Error(`gagal mengajukan: ${submitted.error}`);

  const trm = await db.customerTermination.findUnique({ where: { id: created.id } });
  const acted = await actOnApproval({
    user: manager,
    requestId: trm!.approvalRequestId!,
    action: "APPROVE",
    note: "disetujui (uji)",
  });
  if (!acted.ok) throw new Error(`gagal menyetujui: ${acted.error}`);

  const synced = await syncTerminationDecision(manager, created.id);
  if (!synced.ok) throw new Error(`gagal menerapkan keputusan: ${synced.error}`);

  const rows = await db.deviceRecoveryItem.findMany({
    where: { recoveryId: synced.id },
    select: { id: true, deviceId: true, snapshotSerial: true },
    orderBy: { snapshotSerial: "asc" },
  });

  return {
    cs,
    manager,
    customerId: customer.id,
    subscriptionId: subscription.id,
    warehouseId: master.warehouse.id,
    itemId: master.item.id,
    terminationId: created.id,
    recoveryId: synced.id,
    itemRows: rows,
  };
}

/** Saldo fisik item di gudang — 0 bila belum pernah ada pergerakan. */
export async function onHandOf(itemId: string, warehouseId: string): Promise<number> {
  const level = await db.stockLevel.findUnique({
    where: { itemId_warehouseId: { itemId, warehouseId } },
  });
  return level?.onHand ?? 0;
}
