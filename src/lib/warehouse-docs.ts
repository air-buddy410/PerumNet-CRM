import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/constants";
import { nextDocumentNumber, highestSuffix } from "@/lib/documents";
import { createDraftTransaction, postTransaction } from "@/lib/inventory";
import type { CurrentUser } from "@/lib/rbac";

// ── Dokumen Gudang (Fase 18) ────────────────────────────────────
// PRD-WAREHOUSE-ENHANCEMENT F5/F6/F8.
//
// Aturan yang ditegakkan DI SINI:
//  - Maksimal satu DO aktif (DRAFT/APPROVED) per transaksi.
//  - Pengeluaran barang hanya boleh lewat DO yang sudah APPROVED.
//  - Tanda tangan kedua pihak diambil SEBELUM transaksi database dijalankan.
//    Kalau posting gagal, IRF dan tanda tangannya ikut batal — tidak ada
//    dokumen yatim yang seolah mengesahkan serah-terima yang tidak terjadi.
//  - Satu IRF per sesi pengeluaran (txId unik).
//  - Pengembalian: pemegang barang mengajukan, admin memverifikasi. Barang
//    GOOD/USED kembali jadi stock siap pakai, DAMAGED/RMA masuk dimensi damaged.

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export const RETURN_CONDITIONS = ["GOOD", "USED", "DAMAGED", "RMA"] as const;
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number];

const DO_SOURCE_TYPES = new Set(["STOCK_ISSUE", "STOCK_TRANSFER"]);

async function docNumber(prisma: TxClient, docType: string, model: "deliveryOrder" | "inventoryRequestForm" | "returnRequest", field: string) {
  return nextDocumentNumber(prisma, {
    docType,
    period: "MONTHLY",
    backfill: async (periodKey) => {
      const rows = await (prisma[model] as unknown as {
        findMany: (args: unknown) => Promise<Record<string, string>[]>;
      }).findMany({
        where: { [field]: { startsWith: `${docType}-${periodKey}-` } },
        select: { [field]: true },
      });
      return highestSuffix(rows.map((r) => r[field]));
    },
  });
}

// ── Delivery Order (F5) ─────────────────────────────────────────

export async function createDeliveryOrder(
  user: CurrentUser,
  txId: string,
  notes?: string
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.STOCK_CREATE)) {
    return { ok: false, error: "Anda tidak memiliki izin membuat surat jalan." };
  }
  const tx = await db.stockTransaction.findUnique({
    where: { id: txId },
    include: { lines: true, deliveryOrders: true },
  });
  if (!tx) return { ok: false, error: "Transaksi tidak ditemukan." };
  if (!DO_SOURCE_TYPES.has(tx.type)) {
    return { ok: false, error: "Surat jalan hanya untuk pengeluaran atau transfer." };
  }
  if (tx.status !== "DRAFT") {
    return { ok: false, error: "Surat jalan dibuat sebelum transaksi diposting." };
  }
  const active = tx.deliveryOrders.find((d) => d.status === "DRAFT" || d.status === "APPROVED");
  if (active) {
    return { ok: false, error: `Sudah ada surat jalan aktif (${active.doNumber}).` };
  }

  let doId = "";
  let doNumber = "";
  try {
    await db.$transaction(async (prisma) => {
      doNumber = await docNumber(prisma, "DO", "deliveryOrder", "doNumber");
      const created = await prisma.deliveryOrder.create({
        data: {
          doNumber,
          txId: tx.id,
          notes: notes?.trim() || null,
          createdById: user.id,
          lines: {
            create: tx.lines.map((l) => ({ txLineId: l.id, itemId: l.itemId, qty: l.qty })),
          },
        },
      });
      doId = created.id;
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal membuat surat jalan." };
  }

  await logAudit({
    userId: user.id,
    action: "DO_CREATE",
    module: "inventory",
    entityType: "DeliveryOrder",
    entityId: doId,
    description: `Membuat surat jalan ${doNumber} untuk ${tx.txNumber}`,
  });
  return { ok: true, id: doId };
}

export async function approveDeliveryOrder(user: CurrentUser, doId: string): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.STOCK_POST)) {
    return { ok: false, error: "Anda tidak memiliki izin menyetujui surat jalan." };
  }
  const doc = await db.deliveryOrder.findUnique({ where: { id: doId } });
  if (!doc) return { ok: false, error: "Surat jalan tidak ditemukan." };
  if (doc.status !== "DRAFT") return { ok: false, error: "Hanya surat jalan draft yang bisa disetujui." };
  if (doc.createdById === user.id) {
    return { ok: false, error: "Pembuat surat jalan tidak boleh menyetujui surat jalannya sendiri." };
  }

  await db.deliveryOrder.update({
    where: { id: doId },
    data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date() },
  });
  await logAudit({
    userId: user.id,
    action: "DO_APPROVE",
    module: "inventory",
    entityType: "DeliveryOrder",
    entityId: doId,
    description: `Menyetujui surat jalan ${doc.doNumber}`,
  });
  return { ok: true, id: doId };
}

export async function cancelDeliveryOrder(user: CurrentUser, doId: string): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.STOCK_CREATE)) {
    return { ok: false, error: "Anda tidak memiliki izin membatalkan surat jalan." };
  }
  const doc = await db.deliveryOrder.findUnique({ where: { id: doId } });
  if (!doc) return { ok: false, error: "Surat jalan tidak ditemukan." };
  if (doc.status === "CANCELLED") return { ok: false, error: "Surat jalan sudah dibatalkan." };

  await db.deliveryOrder.update({ where: { id: doId }, data: { status: "CANCELLED" } });
  await logAudit({
    userId: user.id,
    action: "DO_CANCEL",
    module: "inventory",
    entityType: "DeliveryOrder",
    entityId: doId,
    description: `Membatalkan surat jalan ${doc.doNumber}`,
  });
  return { ok: true, id: doId };
}

// ── Pengeluaran bertanda tangan + IRF (F6) ──────────────────────

export interface SignatureInput {
  role: "REQUESTOR" | "WAREHOUSE_ADMIN";
  signerName: string;
  signerUserId?: string | null;
  attachmentId?: string | null;
}

/**
 * Mengeluarkan barang: memvalidasi surat jalan, memposting transaksi, dan
 * menerbitkan IRF beserta dua tanda tangan — semuanya dalam satu transaksi.
 */
export async function issueMaterial(
  user: CurrentUser,
  txId: string,
  signatures: SignatureInput[]
): Promise<Result> {
  const tx = await db.stockTransaction.findUnique({
    where: { id: txId },
    include: { deliveryOrders: true, irf: true },
  });
  if (!tx) return { ok: false, error: "Transaksi tidak ditemukan." };
  if (tx.type !== "STOCK_ISSUE") {
    return { ok: false, error: "Hanya pengeluaran ke teknisi yang memakai IRF." };
  }
  if (tx.irf) return { ok: false, error: "IRF untuk transaksi ini sudah terbit." };

  const approvedDo = tx.deliveryOrders.find((d) => d.status === "APPROVED");
  if (!approvedDo) {
    return { ok: false, error: "Butuh surat jalan berstatus disetujui sebelum barang dikeluarkan." };
  }

  const requestor = signatures.find((s) => s.role === "REQUESTOR");
  const admin = signatures.find((s) => s.role === "WAREHOUSE_ADMIN");
  if (!requestor?.signerName?.trim() || !admin?.signerName?.trim()) {
    return {
      ok: false,
      error: "Dua tanda tangan wajib: penerima barang dan admin gudang.",
    };
  }

  let irfNumber = "";
  const result = await postTransaction(user, txId, {
    afterPost: async (prisma, posted) => {
      irfNumber = await docNumber(prisma, "IRF", "inventoryRequestForm", "irfNumber");
      const irf = await prisma.inventoryRequestForm.create({
        data: {
          irfNumber,
          txId: posted.id,
          status: "SIGNED",
          createdById: user.id,
        },
      });
      for (const sig of [requestor, admin]) {
        await prisma.documentSignature.create({
          data: {
            docType: "IRF",
            docId: irf.id,
            role: sig.role,
            signerName: sig.signerName.trim(),
            signerUserId: sig.signerUserId ?? null,
            attachmentId: sig.attachmentId ?? null,
          },
        });
      }
    },
  });
  if (!result.ok) return result;

  await logAudit({
    userId: user.id,
    action: "IRF_ISSUE",
    module: "inventory",
    entityType: "InventoryRequestForm",
    entityId: result.id,
    description: `Pengeluaran ${tx.txNumber} diserahkan — IRF ${irfNumber}, ditandatangani ${requestor.signerName} & ${admin.signerName}`,
  });
  return { ok: true, id: result.id };
}

// ── Pengembalian material dua jalur (F8) ────────────────────────

export interface ReturnLineInput {
  itemId: string;
  qty: number;
  deviceId?: string | null;
  condition: ReturnCondition;
}

export async function createReturnRequest(
  user: CurrentUser,
  data: { warehouseToId: string; note?: string; lines: ReturnLineInput[] }
): Promise<Result> {
  if (!data.warehouseToId) return { ok: false, error: "Gudang tujuan wajib dipilih." };
  const rows = data.lines.filter((l) => l.qty > 0);
  if (!rows.length) return { ok: false, error: "Minimal satu baris barang." };
  for (const line of rows) {
    if (!RETURN_CONDITIONS.includes(line.condition)) {
      return { ok: false, error: `Kondisi "${line.condition}" tidak dikenal.` };
    }
    if (line.deviceId) {
      const device = await db.serializedDevice.findUnique({ where: { id: line.deviceId } });
      if (!device) return { ok: false, error: "Perangkat tidak ditemukan." };
      // Perangkat serial hanya boleh dikembalikan oleh pemegangnya.
      if (device.custodianId !== user.id) {
        return {
          ok: false,
          error: `Perangkat ${device.serialNumber} tidak tercatat dipegang oleh Anda.`,
        };
      }
    }
  }

  let requestId = "";
  let returnNumber = "";
  try {
    await db.$transaction(async (prisma) => {
      returnNumber = await docNumber(prisma, "RET", "returnRequest", "returnNumber");
      const created = await prisma.returnRequest.create({
        data: {
          returnNumber,
          requesterId: user.id,
          warehouseToId: data.warehouseToId,
          note: data.note?.trim() || null,
          lines: {
            create: rows.map((l) => ({
              itemId: l.itemId,
              qty: l.qty,
              deviceId: l.deviceId ?? null,
              condition: l.condition,
            })),
          },
        },
      });
      requestId = created.id;
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal membuat pengajuan." };
  }

  await logAudit({
    userId: user.id,
    action: "RETURN_REQUEST",
    module: "inventory",
    entityType: "ReturnRequest",
    entityId: requestId,
    description: `Pengajuan pengembalian ${returnNumber}`,
  });
  return { ok: true, id: requestId };
}

export async function verifyReturnRequest(
  user: CurrentUser,
  requestId: string,
  accept: boolean,
  verifyNote?: string
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.STOCK_POST)) {
    return { ok: false, error: "Anda tidak memiliki izin memverifikasi pengembalian." };
  }
  const request = await db.returnRequest.findUnique({
    where: { id: requestId },
    include: { lines: { include: { item: true } } },
  });
  if (!request) return { ok: false, error: "Pengajuan tidak ditemukan." };
  if (request.status !== "PENDING") {
    return { ok: false, error: "Pengajuan ini sudah diverifikasi." };
  }
  if (request.requesterId === user.id) {
    return { ok: false, error: "Pengaju tidak boleh memverifikasi pengajuannya sendiri." };
  }

  if (!accept) {
    if (!verifyNote?.trim()) {
      return { ok: false, error: "Alasan penolakan wajib diisi." };
    }
    await db.returnRequest.update({
      where: { id: requestId },
      data: {
        status: "REJECTED",
        verifiedById: user.id,
        verifiedAt: new Date(),
        verifyNote: verifyNote.trim(),
      },
    });
    await logAudit({
      userId: user.id,
      action: "RETURN_REJECT",
      module: "inventory",
      entityType: "ReturnRequest",
      entityId: requestId,
      description: `Menolak pengembalian ${request.returnNumber}: ${verifyNote.trim()}`,
    });
    return { ok: true, id: requestId };
  }

  // Diterima → stock kembali lewat transaksi resmi, bukan tulis saldo langsung.
  const draft = await createDraftTransaction(
    user,
    "STOCK_RETURN",
    {
      warehouseToId: request.warehouseToId,
      custodianId: request.requesterId,
      purpose: `Pengembalian ${request.returnNumber}`,
      referenceNote: request.returnNumber,
    },
    request.lines.map((l) => ({
      itemId: l.itemId,
      qty: l.qty,
      deviceIds: l.deviceId ? [l.deviceId] : undefined,
    }))
  );
  if (!draft.ok) return draft;

  // Kondisi barang menempel ke baris transaksi agar posting tahu tujuan dimensinya.
  for (const line of request.lines) {
    await db.stockTransactionLine.updateMany({
      where: {
        txId: draft.id,
        itemId: line.itemId,
        ...(line.deviceId ? { deviceId: line.deviceId } : {}),
      },
      data: { condition: line.condition },
    });
  }

  const posted = await postTransaction(user, draft.id);
  if (!posted.ok) return posted;

  await db.returnRequest.update({
    where: { id: requestId },
    data: {
      status: "ACCEPTED",
      verifiedById: user.id,
      verifiedAt: new Date(),
      verifyNote: verifyNote?.trim() || null,
      txId: draft.id,
    },
  });
  await logAudit({
    userId: user.id,
    action: "RETURN_ACCEPT",
    module: "inventory",
    entityType: "ReturnRequest",
    entityId: requestId,
    description: `Menerima pengembalian ${request.returnNumber} — stock dikembalikan lewat transaksi`,
  });
  return { ok: true, id: requestId };
}
