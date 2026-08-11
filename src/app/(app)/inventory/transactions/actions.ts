"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, TX_TYPES } from "@/lib/constants";
import {
  createDraftTransaction,
  postTransaction,
  cancelDraftTransaction,
  reverseTransaction,
  receiveTransfer,
  type DraftLineInput,
  type ReceiveLineInput,
} from "@/lib/inventory";
import {
  createDeliveryOrder,
  approveDeliveryOrder,
  issueMaterial,
} from "@/lib/warehouse-docs";

const MAX_BULK_ROWS = 5;
const MAX_SERIAL_ROWS = 3;

export async function createTransactionAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.STOCK_CREATE);
  const type = String(formData.get("type") ?? "");
  if (!Object.values(TX_TYPES).includes(type as never) || type === "STOCK_ADJUSTMENT") {
    redirect("/inventory/transactions?error=" + encodeURIComponent("Tipe transaksi tidak valid."));
  }
  const backUrl = `/inventory/transactions/new?type=${type}`;

  const lines: DraftLineInput[] = [];

  // Baris bulk: bulkItemN + bulkQtyN
  for (let i = 1; i <= MAX_BULK_ROWS; i++) {
    const itemId = String(formData.get(`bulkItem${i}`) ?? "");
    const qty = parseInt(String(formData.get(`bulkQty${i}`) ?? ""), 10);
    if (itemId && qty > 0) lines.push({ itemId, qty });
  }

  if (type === "GOODS_RECEIPT") {
    // Baris serialized: serialItemN + serialSnsN (satu SN per baris teks)
    for (let i = 1; i <= MAX_SERIAL_ROWS; i++) {
      const itemId = String(formData.get(`serialItem${i}`) ?? "");
      const snsRaw = String(formData.get(`serialSns${i}`) ?? "");
      const sns = snsRaw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      if (itemId && sns.length) {
        lines.push({ itemId, qty: sns.length, serialNumbers: sns });
      }
    }
  } else {
    // Perangkat dipilih dari multi-select; dikelompokkan per item di server.
    const deviceIds = formData.getAll("deviceIds").map(String).filter(Boolean);
    if (deviceIds.length) {
      const { db } = await import("@/lib/db");
      const devices = await db.serializedDevice.findMany({
        where: { id: { in: deviceIds } },
      });
      const byItem = new Map<string, string[]>();
      for (const d of devices) {
        byItem.set(d.itemId, [...(byItem.get(d.itemId) ?? []), d.id]);
      }
      for (const [itemId, ids] of byItem) {
        lines.push({ itemId, qty: ids.length, deviceIds: ids });
      }
    }
  }

  const result = await createDraftTransaction(
    user,
    type,
    {
      warehouseFromId: String(formData.get("warehouseFromId") ?? "") || undefined,
      warehouseToId: String(formData.get("warehouseToId") ?? "") || undefined,
      custodianId: String(formData.get("custodianId") ?? "") || undefined,
      workOrderId: String(formData.get("workOrderId") ?? "") || undefined,
      projectId: String(formData.get("projectId") ?? "") || undefined,
      purpose: String(formData.get("purpose") ?? ""),
      referenceNote: String(formData.get("referenceNote") ?? "") || undefined,
      notes: String(formData.get("notes") ?? "") || undefined,
    },
    lines
  );
  if (!result.ok) {
    redirect(backUrl + "&error=" + encodeURIComponent(result.error));
  }
  revalidatePath("/inventory/transactions");
  redirect(
    `/inventory/transactions/${result.id}?ok=` +
      encodeURIComponent("Draft dibuat. Posting untuk mengubah saldo.")
  );
}

export async function postTransactionAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.STOCK_POST);
  const txId = String(formData.get("txId") ?? "");
  const result = await postTransaction(user, txId);
  revalidatePath("/inventory/transactions");
  redirect(
    `/inventory/transactions/${txId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("Transaksi diposting — saldo diperbarui.")
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function cancelTransactionAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.STOCK_CREATE);
  const txId = String(formData.get("txId") ?? "");
  const result = await cancelDraftTransaction(user, txId);
  revalidatePath("/inventory/transactions");
  redirect(
    `/inventory/transactions/${txId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("Draft dibatalkan.")
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function reverseTransactionAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.STOCK_REVERSE);
  const txId = String(formData.get("txId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const result = await reverseTransaction(user, txId, reason);
  revalidatePath("/inventory/transactions");
  if (!result.ok) {
    redirect(`/inventory/transactions/${txId}?error=` + encodeURIComponent(result.error));
  }
  redirect(
    `/inventory/transactions/${result.id}?ok=` +
      encodeURIComponent("Reversal diposting sebagai transaksi baru.")
  );
}

// Fase 17: menerima transfer antar gudang. Qty per baris boleh sebagian —
// transfer tetap terbuka sampai seluruh kiriman diterima.
export async function receiveTransferAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.STOCK_RECEIVE);
  const txId = String(formData.get("txId") ?? "");
  const notes = String(formData.get("notes") ?? "");

  const lines: ReceiveLineInput[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("qty_")) continue;
    const qty = Number(value);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    lines.push({ txLineId: key.slice(4), qty: Math.floor(qty) });
  }

  const result = await receiveTransfer(user, txId, lines, notes);
  revalidatePath("/inventory/transactions");
  revalidatePath("/inventory/stock");
  redirect(
    `/inventory/transactions/${txId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("Penerimaan dicatat — stock gudang tujuan bertambah.")
        : "error=" + encodeURIComponent(result.error))
  );
}

// ── Fase 18: surat jalan & pengeluaran bertanda tangan ───────────

export async function createDeliveryOrderAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.STOCK_CREATE);
  const txId = String(formData.get("txId") ?? "");
  const result = await createDeliveryOrder(user, txId, String(formData.get("notes") ?? ""));
  revalidatePath(`/inventory/transactions/${txId}`);
  redirect(
    `/inventory/transactions/${txId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("Surat jalan dibuat — menunggu persetujuan.")
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function approveDeliveryOrderAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.STOCK_POST);
  const txId = String(formData.get("txId") ?? "");
  const result = await approveDeliveryOrder(user, String(formData.get("doId") ?? ""));
  revalidatePath(`/inventory/transactions/${txId}`);
  redirect(
    `/inventory/transactions/${txId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("Surat jalan disetujui.")
        : "error=" + encodeURIComponent(result.error))
  );
}

// Pengeluaran barang: tanda tangan kedua pihak diambil di sini, lalu posting
// dan penerbitan IRF berjalan dalam satu transaksi.
export async function issueMaterialAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.STOCK_POST);
  const txId = String(formData.get("txId") ?? "");
  const result = await issueMaterial(user, txId, [
    { role: "REQUESTOR", signerName: String(formData.get("receiverName") ?? "") },
    {
      role: "WAREHOUSE_ADMIN",
      signerName: String(formData.get("adminName") ?? ""),
      signerUserId: user.id,
    },
  ]);
  revalidatePath("/inventory/transactions");
  revalidatePath("/inventory/stock");
  redirect(
    `/inventory/transactions/${txId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("Barang diserahkan — IRF terbit dengan dua tanda tangan.")
        : "error=" + encodeURIComponent(result.error))
  );
}
