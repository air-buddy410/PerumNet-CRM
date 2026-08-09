"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, CASH_TX_TYPES } from "@/lib/constants";
import {
  createCashDraft,
  submitCashForApproval,
  postCashTransaction,
  cancelCashDraft,
  reverseCashTransaction,
} from "@/lib/finance";
import { saveAttachment } from "@/lib/files";

function parseRp(v: FormDataEntryValue | null): bigint {
  const digits = String(v ?? "").replace(/[^\d]/g, "");
  return digits ? BigInt(digits) : BigInt(0);
}

export async function createCashAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CASH_CREATE);
  const type = String(formData.get("type") ?? "");
  const backUrl = `/finance/transactions/new?type=${type}`;

  // Top-up & transfer hanya untuk pemegang cash.manage.
  if (
    (type === CASH_TX_TYPES.TOP_UP || type === CASH_TX_TYPES.CASH_TRANSFER) &&
    !user.permissions.has(PERMISSIONS.CASH_MANAGE)
  ) {
    redirect(backUrl + "&error=" + encodeURIComponent("Top-up/transfer hanya untuk Finance."));
  }

  const dueDateRaw = String(formData.get("dueDate") ?? "");
  const result = await createCashDraft(user, type, {
    cashbookId: String(formData.get("cashbookId") ?? ""),
    cashbookToId: String(formData.get("cashbookToId") ?? "") || undefined,
    amount: parseRp(formData.get("amount")),
    cashReturnAmount: parseRp(formData.get("cashReturnAmount")),
    categoryId: String(formData.get("categoryId") ?? "") || undefined,
    costCenterId: String(formData.get("costCenterId") ?? "") || undefined,
    recipient: String(formData.get("recipient") ?? "") || undefined,
    purpose: String(formData.get("purpose") ?? ""),
    receiptRef: String(formData.get("receiptRef") ?? "") || undefined,
    referenceNote: String(formData.get("referenceNote") ?? "") || undefined,
    workOrderId: String(formData.get("workOrderId") ?? "") || undefined,
    projectId: String(formData.get("projectId") ?? "") || undefined,
    advanceId: String(formData.get("advanceId") ?? "") || undefined,
    dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
  });
  if (!result.ok) {
    redirect(backUrl + "&error=" + encodeURIComponent(result.error));
  }
  revalidatePath("/finance/transactions");
  redirect(
    `/finance/transactions/${result.id}?ok=` +
      encodeURIComponent("Draft dibuat. Unggah bukti lalu ajukan/posting.")
  );
}

function back(txId: string, result: { ok: boolean; error?: string }, okMsg: string): never {
  redirect(
    `/finance/transactions/${txId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent(okMsg)
        : "error=" + encodeURIComponent(result.error ?? "Gagal."))
  );
}

export async function submitCashAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CASH_CREATE);
  const txId = String(formData.get("txId") ?? "");
  const result = await submitCashForApproval(user, txId);
  revalidatePath("/finance/transactions");
  back(txId, result, "Diajukan — menunggu approval sesuai matrix.");
}

export async function postCashAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CASH_POST);
  const txId = String(formData.get("txId") ?? "");
  const result = await postCashTransaction(user, txId);
  revalidatePath("/finance/transactions");
  revalidatePath("/finance/cashbooks");
  back(txId, result, "Diposting — saldo diperbarui.");
}

export async function cancelCashAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CASH_CREATE);
  const txId = String(formData.get("txId") ?? "");
  const result = await cancelCashDraft(user, txId);
  revalidatePath("/finance/transactions");
  back(txId, result, "Draft dibatalkan.");
}

export async function reverseCashAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CASH_REVERSE);
  const txId = String(formData.get("txId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const result = await reverseCashTransaction(user, txId, reason);
  revalidatePath("/finance/transactions");
  revalidatePath("/finance/cashbooks");
  if (!result.ok) {
    redirect(`/finance/transactions/${txId}?error=` + encodeURIComponent(result.error));
  }
  redirect(
    `/finance/transactions/${result.id}?ok=` +
      encodeURIComponent("Reversal diposting sebagai transaksi baru.")
  );
}

export async function uploadCashEvidenceAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CASH_CREATE);
  const txId = String(formData.get("txId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    back(txId, { ok: false, error: "Pilih file bukti terlebih dahulu." }, "");
  }
  const result = await saveAttachment(file as File, "CashTransaction", txId, user.id);
  back(
    txId,
    result.ok ? { ok: true } : { ok: false, error: result.ok === false ? result.error : "" },
    "Bukti terunggah."
  );
}
