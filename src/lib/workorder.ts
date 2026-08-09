import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS, WO_TYPES, statusLabel } from "@/lib/constants";
import type { CurrentUser } from "@/lib/rbac";

// ── Work Order Engine (PRD §18) ─────────────────────────────────
// WO tidak dapat ditutup jika (PRD §18):
//  - masih ada perangkat yang dikeluarkan untuk WO ini dan belum
//    dipertanggungjawabkan (terpasang / dikembalikan),
//  - belum ada foto bukti,
//  - pelanggan belum memberikan konfirmasi,
//  - hasil pekerjaan belum diisi.
// Verifikator penutupan bukan teknisi pelaksana (segregation of duties).

type Result = { ok: true; id: string } | { ok: false; error: string };

function monthPrefix(base: string): string {
  const now = new Date();
  return `${base}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function createWorkOrder(
  user: CurrentUser,
  data: {
    type: string;
    customerId?: string;
    subscriptionId?: string;
    address: string;
    description: string;
    scheduledAt?: Date | null;
    technicianId?: string;
  }
): Promise<Result> {
  if (!WO_TYPES.some(([code]) => code === data.type)) {
    return { ok: false, error: "Jenis work order tidak dikenal." };
  }
  if (!data.address?.trim() || !data.description?.trim()) {
    return { ok: false, error: "Alamat dan deskripsi pekerjaan wajib diisi." };
  }
  const prefix = monthPrefix("WO");
  const count = await db.workOrder.count({
    where: { woNumber: { startsWith: prefix } },
  });
  const wo = await db.workOrder.create({
    data: {
      woNumber: `${prefix}-${String(count + 1).padStart(4, "0")}`,
      type: data.type,
      customerId: data.customerId ?? null,
      subscriptionId: data.subscriptionId ?? null,
      address: data.address,
      description: data.description,
      scheduledAt: data.scheduledAt ?? null,
      technicianId: data.technicianId ?? null,
      status: data.technicianId ? "ASSIGNED" : "OPEN",
      createdById: user.id,
    },
  });
  await logAudit({
    userId: user.id,
    action: "WO_CREATE",
    module: "work_orders",
    entityType: "WorkOrder",
    entityId: wo.id,
    description: `Membuat ${wo.woNumber} (${statusLabel(data.type)})`,
  });
  return { ok: true, id: wo.id };
}

export async function assignWorkOrder(
  user: CurrentUser,
  woId: string,
  technicianId: string,
  scheduledAt?: Date | null
): Promise<Result> {
  const wo = await db.workOrder.findUnique({ where: { id: woId } });
  if (!wo) return { ok: false, error: "Work order tidak ditemukan." };
  if (!["OPEN", "ASSIGNED"].includes(wo.status)) {
    return { ok: false, error: "WO sudah berjalan/selesai — tidak bisa di-assign ulang." };
  }
  const technician = await db.user.findUnique({ where: { id: technicianId } });
  if (!technician || !technician.isActive) {
    return { ok: false, error: "Teknisi tidak valid." };
  }
  await db.workOrder.update({
    where: { id: woId },
    data: {
      technicianId,
      scheduledAt: scheduledAt !== undefined ? scheduledAt : wo.scheduledAt,
      status: "ASSIGNED",
    },
  });
  await logAudit({
    userId: user.id,
    action: "WO_ASSIGN",
    module: "work_orders",
    entityType: "WorkOrder",
    entityId: woId,
    description: `Menugaskan ${wo.woNumber} ke ${technician.name}`,
  });
  return { ok: true, id: woId };
}

export async function startWorkOrder(user: CurrentUser, woId: string): Promise<Result> {
  const wo = await db.workOrder.findUnique({ where: { id: woId } });
  if (!wo) return { ok: false, error: "Work order tidak ditemukan." };
  if (wo.status !== "ASSIGNED") {
    return { ok: false, error: "WO harus berstatus Ter-assign untuk dimulai." };
  }
  const isTechnician = wo.technicianId === user.id;
  const isCoordinator = user.permissions.has(PERMISSIONS.WORK_ORDERS_CLOSE);
  if (!isTechnician && !isCoordinator) {
    return { ok: false, error: "Hanya teknisi yang ditugaskan yang dapat memulai WO ini." };
  }
  await db.workOrder.update({ where: { id: woId }, data: { status: "IN_PROGRESS" } });
  await logAudit({
    userId: user.id,
    action: "WO_START",
    module: "work_orders",
    entityType: "WorkOrder",
    entityId: woId,
    description: `Memulai ${wo.woNumber}`,
  });
  return { ok: true, id: woId };
}

// Instalasi perangkat: custody teknisi → terpasang di pelanggan (PRD §16.3).
export async function installDevice(
  user: CurrentUser,
  woId: string,
  deviceId: string,
  subscriptionId: string
): Promise<Result> {
  const wo = await db.workOrder.findUnique({ where: { id: woId } });
  if (!wo) return { ok: false, error: "Work order tidak ditemukan." };
  if (!["ASSIGNED", "IN_PROGRESS"].includes(wo.status)) {
    return { ok: false, error: "WO tidak dalam status pengerjaan." };
  }
  if (!wo.technicianId) return { ok: false, error: "WO belum memiliki teknisi." };

  const device = await db.serializedDevice.findUnique({
    where: { id: deviceId },
    include: { item: true },
  });
  if (!device) return { ok: false, error: "Perangkat tidak ditemukan." };
  if (device.status !== "IN_CUSTODY" || device.custodianId !== wo.technicianId) {
    return {
      ok: false,
      error: "Perangkat harus berada dalam custody teknisi WO ini (keluarkan lewat transaksi Stock Issue).",
    };
  }
  const subscription = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: { customer: true },
  });
  if (!subscription) return { ok: false, error: "Subscription tidak ditemukan." };
  if (wo.customerId && subscription.customerId !== wo.customerId) {
    return { ok: false, error: "Subscription bukan milik customer WO ini." };
  }

  await db.serializedDevice.update({
    where: { id: deviceId },
    data: {
      status: "INSTALLED",
      custodianId: null,
      warehouseId: null,
      subscriptionId: subscription.id,
      customerId: subscription.customerId,
    },
  });
  await db.deviceMovement.create({
    data: {
      deviceId,
      action: "INSTALLED",
      fromNote: "Custody teknisi",
      toNote: `${subscription.customer.name} (${subscription.serviceNumber})`,
      workOrderId: woId,
      byUserId: user.id,
    },
  });
  await logAudit({
    userId: user.id,
    action: "WO_INSTALL_DEVICE",
    module: "work_orders",
    entityType: "SerializedDevice",
    entityId: deviceId,
    description: `${wo.woNumber}: pasang ${device.item.name} SN ${device.serialNumber} di ${subscription.serviceNumber}`,
  });
  return { ok: true, id: deviceId };
}

// Penarikan perangkat terpasang → kembali ke custody teknisi.
export async function uninstallDevice(
  user: CurrentUser,
  woId: string,
  deviceId: string
): Promise<Result> {
  const wo = await db.workOrder.findUnique({ where: { id: woId } });
  if (!wo) return { ok: false, error: "Work order tidak ditemukan." };
  if (!["ASSIGNED", "IN_PROGRESS"].includes(wo.status)) {
    return { ok: false, error: "WO tidak dalam status pengerjaan." };
  }
  if (!wo.technicianId) return { ok: false, error: "WO belum memiliki teknisi." };

  const device = await db.serializedDevice.findUnique({
    where: { id: deviceId },
    include: { item: true },
  });
  if (!device || device.status !== "INSTALLED") {
    return { ok: false, error: "Perangkat tidak berstatus terpasang." };
  }
  if (wo.customerId && device.customerId !== wo.customerId) {
    return { ok: false, error: "Perangkat tidak terpasang pada customer WO ini." };
  }

  await db.serializedDevice.update({
    where: { id: deviceId },
    data: {
      status: "IN_CUSTODY",
      custodianId: wo.technicianId,
      subscriptionId: null,
      customerId: null,
    },
  });
  await db.deviceMovement.create({
    data: {
      deviceId,
      action: "RETURNED",
      fromNote: "Terpasang di pelanggan",
      toNote: "Custody teknisi (penarikan)",
      workOrderId: woId,
      byUserId: user.id,
    },
  });
  await logAudit({
    userId: user.id,
    action: "WO_UNINSTALL_DEVICE",
    module: "work_orders",
    entityType: "SerializedDevice",
    entityId: deviceId,
    description: `${wo.woNumber}: tarik ${device.item.name} SN ${device.serialNumber} ke custody teknisi`,
  });
  return { ok: true, id: deviceId };
}

// Pemakaian material bulk — mengurangi custody teknisi, tercatat per WO.
export async function recordMaterialUsage(
  user: CurrentUser,
  woId: string,
  itemId: string,
  qty: number,
  note?: string
): Promise<Result> {
  const wo = await db.workOrder.findUnique({ where: { id: woId } });
  if (!wo) return { ok: false, error: "Work order tidak ditemukan." };
  if (!["ASSIGNED", "IN_PROGRESS"].includes(wo.status)) {
    return { ok: false, error: "WO tidak dalam status pengerjaan." };
  }
  if (!wo.technicianId) return { ok: false, error: "WO belum memiliki teknisi." };
  if (qty <= 0) return { ok: false, error: "Qty harus > 0." };

  const item = await db.item.findUnique({ where: { id: itemId } });
  if (!item || item.trackingType !== "BULK") {
    return { ok: false, error: "Pemakaian material hanya untuk item bulk." };
  }
  const custody = await db.custodyLevel.findUnique({
    where: { custodianId_itemId: { custodianId: wo.technicianId, itemId } },
  });
  if ((custody?.qty ?? 0) < qty) {
    return {
      ok: false,
      error: `Custody teknisi tidak cukup (sisa ${custody?.qty ?? 0} ${item.unit}).`,
    };
  }
  await db.$transaction([
    db.custodyLevel.update({
      where: { custodianId_itemId: { custodianId: wo.technicianId, itemId } },
      data: { qty: (custody?.qty ?? 0) - qty },
    }),
    db.materialUsage.create({
      data: { workOrderId: woId, itemId, qty, note, byUserId: user.id },
    }),
  ]);
  await logAudit({
    userId: user.id,
    action: "WO_MATERIAL_USAGE",
    module: "work_orders",
    entityType: "WorkOrder",
    entityId: woId,
    description: `${wo.woNumber}: pakai ${qty} ${item.unit} ${item.name}`,
  });
  return { ok: true, id: woId };
}

export async function completeWorkOrder(
  user: CurrentUser,
  woId: string,
  resultNotes: string,
  customerConfirmation: string
): Promise<Result> {
  const wo = await db.workOrder.findUnique({ where: { id: woId } });
  if (!wo) return { ok: false, error: "Work order tidak ditemukan." };
  if (wo.status !== "IN_PROGRESS") {
    return { ok: false, error: "WO harus berstatus Berjalan untuk diselesaikan." };
  }
  if (!resultNotes?.trim()) {
    return { ok: false, error: "Hasil pekerjaan wajib diisi." };
  }
  if (!customerConfirmation?.trim()) {
    return { ok: false, error: "Konfirmasi pelanggan wajib diisi (PRD §18)." };
  }
  const isTechnician = wo.technicianId === user.id;
  const isCoordinator = user.permissions.has(PERMISSIONS.WORK_ORDERS_CLOSE);
  if (!isTechnician && !isCoordinator) {
    return { ok: false, error: "Hanya teknisi yang ditugaskan yang dapat menyelesaikan WO ini." };
  }
  await db.workOrder.update({
    where: { id: woId },
    data: { status: "COMPLETED", resultNotes, customerConfirmation },
  });
  await logAudit({
    userId: user.id,
    action: "WO_COMPLETE",
    module: "work_orders",
    entityType: "WorkOrder",
    entityId: woId,
    description: `${wo.woNumber} selesai dikerjakan (konfirmasi: ${customerConfirmation})`,
  });
  return { ok: true, id: woId };
}

// Daftar perangkat yang dikeluarkan untuk WO ini dan masih di custody.
export async function outstandingDevices(woId: string) {
  const lines = await db.stockTransactionLine.findMany({
    where: {
      deviceId: { not: null },
      tx: { workOrderId: woId, type: "STOCK_ISSUE", status: "POSTED", reversedById: null },
    },
    include: { device: { include: { item: true } } },
  });
  return lines
    .map((l) => l.device!)
    .filter((d) => d.status === "IN_CUSTODY");
}

export async function closeWorkOrder(user: CurrentUser, woId: string): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.WORK_ORDERS_CLOSE)) {
    return { ok: false, error: "Anda tidak memiliki izin menutup WO." };
  }
  const wo = await db.workOrder.findUnique({ where: { id: woId } });
  if (!wo) return { ok: false, error: "Work order tidak ditemukan." };
  if (wo.status !== "COMPLETED") {
    return { ok: false, error: "WO harus diselesaikan teknisi terlebih dahulu." };
  }
  if (wo.technicianId === user.id) {
    return {
      ok: false,
      error: "Verifikasi penutupan tidak boleh dilakukan teknisi pelaksana (segregation of duties).",
    };
  }
  if (!wo.customerConfirmation?.trim() || !wo.resultNotes?.trim()) {
    return { ok: false, error: "Konfirmasi pelanggan dan hasil pekerjaan wajib terisi." };
  }
  const photos = await db.attachment.count({
    where: { entityType: "WorkOrder", entityId: woId },
  });
  if (photos === 0) {
    return { ok: false, error: "WO tidak dapat ditutup tanpa foto bukti (PRD §18)." };
  }
  const outstanding = await outstandingDevices(woId);
  if (outstanding.length) {
    return {
      ok: false,
      error: `Masih ada ${outstanding.length} perangkat WO ini di custody teknisi (${outstanding
        .map((d) => d.serialNumber)
        .join(", ")}). Pasang atau kembalikan dulu.`,
    };
  }
  await db.workOrder.update({
    where: { id: woId },
    data: { status: "CLOSED", closedById: user.id, closedAt: new Date() },
  });
  await logAudit({
    userId: user.id,
    action: "WO_CLOSE",
    module: "work_orders",
    entityType: "WorkOrder",
    entityId: woId,
    description: `Menutup ${wo.woNumber}`,
  });
  return { ok: true, id: woId };
}

export async function cancelWorkOrder(
  user: CurrentUser,
  woId: string,
  reason: string
): Promise<Result> {
  if (!reason?.trim()) return { ok: false, error: "Alasan pembatalan wajib diisi." };
  const wo = await db.workOrder.findUnique({ where: { id: woId } });
  if (!wo) return { ok: false, error: "Work order tidak ditemukan." };
  if (["CLOSED", "CANCELLED"].includes(wo.status)) {
    return { ok: false, error: "WO sudah final." };
  }
  await db.workOrder.update({
    where: { id: woId },
    data: {
      status: "CANCELLED",
      resultNotes: `${wo.resultNotes ? wo.resultNotes + "\n" : ""}[Dibatalkan] ${reason}`,
    },
  });
  await logAudit({
    userId: user.id,
    action: "WO_CANCEL",
    module: "work_orders",
    entityType: "WorkOrder",
    entityId: woId,
    description: `Membatalkan ${wo.woNumber}`,
    metadata: { reason },
  });
  return { ok: true, id: woId };
}
