import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/constants";
import type { CurrentUser } from "@/lib/rbac";

// ── Project Engine (PRD §19, rule 8) ────────────────────────────
// Proyek tidak dapat ditutup sebelum:
//  - seluruh perangkat serialized yang dikeluarkan untuk proyek
//    dipertanggungjawabkan (terpasang / dikembalikan),
//  - seluruh cash advance proyek diselesaikan,
//  - tidak ada transaksi kas proyek yang menggantung (draft/menunggu approval),
//  - dokumentasi proyek diunggah.

type Result = { ok: true; id: string } | { ok: false; error: string };

export async function createProject(
  user: CurrentUser,
  data: {
    name: string;
    customerId?: string;
    areaId?: string;
    managerId: string;
    budget: bigint;
    startDate?: Date | null;
    endDate?: Date | null;
    notes?: string;
  }
): Promise<Result> {
  if (!data.name?.trim()) return { ok: false, error: "Nama proyek wajib diisi." };
  const manager = await db.user.findUnique({ where: { id: data.managerId } });
  if (!manager || !manager.isActive) {
    return { ok: false, error: "Project manager tidak valid." };
  }
  const year = new Date().getFullYear();
  const prefix = `PRJ-${year}`;
  const count = await db.project.count({
    where: { projectNumber: { startsWith: prefix } },
  });
  const project = await db.project.create({
    data: {
      projectNumber: `${prefix}-${String(count + 1).padStart(4, "0")}`,
      name: data.name,
      customerId: data.customerId ?? null,
      areaId: data.areaId ?? null,
      managerId: data.managerId,
      budget: data.budget,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      notes: data.notes ?? null,
      createdById: user.id,
    },
  });
  await logAudit({
    userId: user.id,
    action: "PROJECT_CREATE",
    module: "projects",
    entityType: "Project",
    entityId: project.id,
    description: `Membuat proyek ${project.projectNumber} — ${data.name}`,
  });
  return { ok: true, id: project.id };
}

export async function saveBomLine(
  user: CurrentUser,
  projectId: string,
  itemId: string,
  plannedQty: number
): Promise<Result> {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return { ok: false, error: "Proyek tidak ditemukan." };
  if (project.status !== "OPEN") return { ok: false, error: "Proyek sudah final." };
  if (plannedQty < 0) return { ok: false, error: "Qty tidak boleh negatif." };

  if (plannedQty === 0) {
    await db.projectBomLine.deleteMany({ where: { projectId, itemId } });
  } else {
    await db.projectBomLine.upsert({
      where: { projectId_itemId: { projectId, itemId } },
      update: { plannedQty },
      create: { projectId, itemId, plannedQty },
    });
  }
  await logAudit({
    userId: user.id,
    action: "PROJECT_BOM_UPDATE",
    module: "projects",
    entityType: "Project",
    entityId: projectId,
    description: `Update BoM ${project.projectNumber}`,
  });
  return { ok: true, id: projectId };
}

// Status rekonsiliasi proyek — dasar gerbang penutupan & laporan.
export async function projectReconciliation(projectId: string) {
  const [issueLines, returnLines, outstandingDeviceLines, cashTxs, docs] = await Promise.all([
    db.stockTransactionLine.findMany({
      where: {
        tx: { projectId, type: "STOCK_ISSUE", status: "POSTED", reversedById: null },
      },
      include: { item: true, device: true },
    }),
    db.stockTransactionLine.findMany({
      where: {
        tx: { projectId, type: "STOCK_RETURN", status: "POSTED", reversedById: null },
      },
      include: { item: true },
    }),
    db.stockTransactionLine.findMany({
      where: {
        deviceId: { not: null },
        tx: { projectId, type: "STOCK_ISSUE", status: "POSTED", reversedById: null },
      },
      include: { device: { include: { item: true } } },
    }),
    db.cashTransaction.findMany({
      where: { projectId, status: { notIn: ["CANCELLED", "REJECTED"] } },
      include: { category: true },
      orderBy: { createdAt: "desc" },
    }),
    db.attachment.count({ where: { entityType: "Project", entityId: projectId } }),
  ]);

  // Ringkasan material per item: issued − returned.
  const materialMap = new Map<
    string,
    { itemId: string; name: string; unit: string; issued: number; returned: number }
  >();
  for (const line of issueLines) {
    const entry = materialMap.get(line.itemId) ?? {
      itemId: line.itemId,
      name: line.item.name,
      unit: line.item.unit,
      issued: 0,
      returned: 0,
    };
    entry.issued += line.qty;
    materialMap.set(line.itemId, entry);
  }
  for (const line of returnLines) {
    const entry = materialMap.get(line.itemId) ?? {
      itemId: line.itemId,
      name: line.item.name,
      unit: line.item.unit,
      issued: 0,
      returned: 0,
    };
    entry.returned += line.qty;
    materialMap.set(line.itemId, entry);
  }

  const outstandingDevices = outstandingDeviceLines
    .map((l) => l.device!)
    .filter((d) => d.status === "IN_CUSTODY");

  const postedExpense = cashTxs
    .filter(
      (t) =>
        t.status === "POSTED" &&
        !t.reversedById &&
        !t.reversalOfId &&
        ["EXPENSE", "REIMBURSEMENT"].includes(t.type)
    )
    .reduce((s, t) => s + t.amount, BigInt(0));
  const settlementExpense = cashTxs
    .filter(
      (t) =>
        t.status === "POSTED" &&
        !t.reversedById &&
        !t.reversalOfId &&
        t.type === "ADVANCE_SETTLEMENT"
    )
    .reduce((s, t) => s + t.amount, BigInt(0));
  const unsettledAdvances = cashTxs.filter(
    (t) =>
      t.type === "CASH_ADVANCE" &&
      t.status === "POSTED" &&
      !t.reversedById &&
      !t.settledAt
  );
  const pendingCash = cashTxs.filter((t) =>
    ["DRAFT", "WAITING_APPROVAL"].includes(t.status)
  );

  return {
    materials: Array.from(materialMap.values()),
    outstandingDevices,
    cashTxs,
    totalActualCost: postedExpense + settlementExpense,
    unsettledAdvances,
    pendingCash,
    docsCount: docs,
  };
}

export async function closeProject(user: CurrentUser, projectId: string): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.PROJECTS_CLOSE)) {
    return { ok: false, error: "Anda tidak memiliki izin menutup proyek." };
  }
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return { ok: false, error: "Proyek tidak ditemukan." };
  if (project.status !== "OPEN") return { ok: false, error: "Proyek sudah final." };

  const recon = await projectReconciliation(projectId);
  const blockers: string[] = [];
  if (recon.outstandingDevices.length) {
    blockers.push(
      `${recon.outstandingDevices.length} perangkat proyek masih di custody (${recon.outstandingDevices.map((d) => d.serialNumber).join(", ")})`
    );
  }
  if (recon.unsettledAdvances.length) {
    blockers.push(
      `${recon.unsettledAdvances.length} cash advance belum diselesaikan (${recon.unsettledAdvances.map((a) => a.txNumber).join(", ")})`
    );
  }
  if (recon.pendingCash.length) {
    blockers.push(`${recon.pendingCash.length} transaksi kas proyek masih menggantung`);
  }
  if (recon.docsCount === 0) {
    blockers.push("dokumentasi proyek belum diunggah");
  }
  if (blockers.length) {
    return {
      ok: false,
      error: `Proyek belum bisa ditutup (PRD §19): ${blockers.join("; ")}.`,
    };
  }

  await db.project.update({
    where: { id: projectId },
    data: { status: "CLOSED", closedById: user.id, closedAt: new Date() },
  });
  await logAudit({
    userId: user.id,
    action: "PROJECT_CLOSE",
    module: "projects",
    entityType: "Project",
    entityId: projectId,
    description: `Menutup proyek ${project.projectNumber} — rekonsiliasi lengkap`,
  });
  return { ok: true, id: projectId };
}

export async function cancelProject(
  user: CurrentUser,
  projectId: string,
  reason: string
): Promise<Result> {
  if (!reason?.trim()) return { ok: false, error: "Alasan pembatalan wajib diisi." };
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return { ok: false, error: "Proyek tidak ditemukan." };
  if (project.status !== "OPEN") return { ok: false, error: "Proyek sudah final." };

  await db.project.update({
    where: { id: projectId },
    data: {
      status: "CANCELLED",
      notes: `${project.notes ? project.notes + "\n" : ""}[Dibatalkan] ${reason}`,
    },
  });
  await logAudit({
    userId: user.id,
    action: "PROJECT_CANCEL",
    module: "projects",
    entityType: "Project",
    entityId: projectId,
    description: `Membatalkan proyek ${project.projectNumber}`,
    metadata: { reason },
  });
  return { ok: true, id: projectId };
}
