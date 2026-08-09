import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { submitApprovalRequest } from "@/lib/approval";
import {
  PERMISSIONS,
  CASH_TX_TYPES,
  CASH_TX_PREFIX,
  CASH_TX_LABELS,
  CASH_TYPES_NEED_APPROVAL,
  CASH_TYPES_NEED_EVIDENCE,
  formatRupiah,
} from "@/lib/constants";
import type { CurrentUser } from "@/lib/rbac";

// ── Finance Engine (PRD §22–27, §53) ────────────────────────────
// Aturan yang ditegakkan DI SINI, bukan di UI:
//  - Saldo cashbook HANYA berubah di postCashTransaction / reverseCashTransaction.
//  - Saldo tidak boleh negatif (rule 2).
//  - Expense & reimbursement wajib kategori + cost center (rule 9) + bukti (§7.4).
//  - Expense/reimbursement/advance wajib approval matrix petty_cash (§48)
//    sebelum posting; pembuat tidak bisa menyetujui sendiri (engine approval).
//  - Nota (receiptRef) tidak dapat dipakai dua kali (§24).
//  - Cash advance wajib due date; advance overdue memblokir pengajuan baru (rule 13).
//  - Transaksi posted immutable; koreksi = reversal (rule 10–11).
//  - Monthly closing mengunci periode: reversal transaksi pada periode
//    terkunci ditolak (§27).

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

function monthPrefix(base: string): string {
  const now = new Date();
  return `${base}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function nextCashNumber(type: string): Promise<string> {
  const prefix = monthPrefix(CASH_TX_PREFIX[type] ?? "CSH");
  const count = await db.cashTransaction.count({
    where: { txNumber: { startsWith: prefix } },
  });
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

// Advance overdue milik user yang belum selesai dipertanggungjawabkan.
export async function overdueAdvances(userId: string) {
  return db.cashTransaction.findMany({
    where: {
      type: CASH_TX_TYPES.CASH_ADVANCE,
      status: "POSTED",
      reversedById: null,
      createdById: userId,
      settledAt: null,
      dueDate: { lt: new Date() },
    },
  });
}

export interface CashDraftInput {
  cashbookId: string;
  cashbookToId?: string;
  amount: bigint;
  cashReturnAmount?: bigint;
  categoryId?: string;
  costCenterId?: string;
  recipient?: string;
  purpose: string;
  receiptRef?: string;
  referenceNote?: string;
  workOrderId?: string;
  projectId?: string;
  advanceId?: string;
  dueDate?: Date | null;
}

export async function createCashDraft(
  user: CurrentUser,
  type: string,
  input: CashDraftInput
): Promise<Result> {
  if (!Object.values(CASH_TX_TYPES).includes(type as never)) {
    return { ok: false, error: "Tipe transaksi tidak dikenal." };
  }
  if (!input.purpose?.trim()) {
    return { ok: false, error: "Tujuan transaksi wajib diisi (PRD §23)." };
  }
  const cashbook = await db.cashbook.findUnique({ where: { id: input.cashbookId } });
  if (!cashbook || !cashbook.isActive) {
    return { ok: false, error: "Cashbook tidak valid." };
  }

  const isSettlement = type === CASH_TX_TYPES.ADVANCE_SETTLEMENT;
  const cashReturn = input.cashReturnAmount ?? BigInt(0);
  if (input.amount < BigInt(0) || cashReturn < BigInt(0)) {
    return { ok: false, error: "Nominal tidak boleh negatif." };
  }
  if (!isSettlement && input.amount <= BigInt(0)) {
    return { ok: false, error: "Nominal harus lebih dari 0." };
  }

  // Rule 9: kategori + cost center wajib untuk pengeluaran riil.
  const needsCategory =
    type === CASH_TX_TYPES.EXPENSE ||
    type === CASH_TX_TYPES.REIMBURSEMENT ||
    (isSettlement && input.amount > BigInt(0));
  if (needsCategory && (!input.categoryId || !input.costCenterId)) {
    return {
      ok: false,
      error: "Kategori dan cost center wajib diisi (business rule 9).",
    };
  }
  if (type === CASH_TX_TYPES.EXPENSE && !input.recipient?.trim()) {
    return { ok: false, error: "Penerima dana wajib diisi (PRD §23)." };
  }

  // §24: nota tidak dapat digunakan dua kali.
  if (input.receiptRef?.trim()) {
    const dup = await db.cashTransaction.findFirst({
      where: {
        receiptRef: input.receiptRef.trim(),
        status: { notIn: ["CANCELLED", "REJECTED"] },
      },
    });
    if (dup) {
      return {
        ok: false,
        error: `Nota "${input.receiptRef}" sudah dipakai di ${dup.txNumber} (duplikasi ditolak — PRD §24).`,
      };
    }
  }

  if (type === CASH_TX_TYPES.CASH_ADVANCE) {
    if (!input.dueDate || input.dueDate <= new Date()) {
      return { ok: false, error: "Cash advance wajib memiliki tanggal settlement di masa depan (PRD §25)." };
    }
    // Rule 13: advance overdue memblokir pengajuan baru.
    const overdue = await overdueAdvances(user.id);
    if (overdue.length) {
      return {
        ok: false,
        error: `Anda memiliki advance overdue (${overdue.map((a) => a.txNumber).join(", ")}) yang belum diselesaikan — pengajuan baru diblokir (business rule 13).`,
      };
    }
  }

  if (type === CASH_TX_TYPES.CASH_TRANSFER) {
    if (!input.cashbookToId || input.cashbookToId === input.cashbookId) {
      return { ok: false, error: "Cashbook tujuan wajib dipilih dan berbeda." };
    }
  }

  if (isSettlement) {
    if (!input.advanceId) return { ok: false, error: "Pilih advance yang di-settle." };
    const advance = await db.cashTransaction.findUnique({ where: { id: input.advanceId } });
    if (!advance || advance.type !== CASH_TX_TYPES.CASH_ADVANCE || advance.status !== "POSTED" || advance.reversedById) {
      return { ok: false, error: "Advance tidak valid / belum diposting." };
    }
    if (advance.settledAt) return { ok: false, error: "Advance sudah selesai dipertanggungjawabkan." };
    const total = input.amount + cashReturn;
    if (total <= BigInt(0)) {
      return { ok: false, error: "Isi porsi belanja (bukti) dan/atau kas dikembalikan." };
    }
    const remaining = advance.amount - advance.settledAmount;
    if (total > remaining) {
      return {
        ok: false,
        error: `Total settlement ${formatRupiah(total)} melebihi sisa advance ${formatRupiah(remaining)}.`,
      };
    }
  }

  const tx = await db.cashTransaction.create({
    data: {
      txNumber: await nextCashNumber(type),
      type,
      cashbookId: input.cashbookId,
      cashbookToId: input.cashbookToId ?? null,
      amount: input.amount,
      cashReturnAmount: cashReturn,
      categoryId: input.categoryId ?? null,
      costCenterId: input.costCenterId ?? null,
      recipient: input.recipient?.trim() || null,
      purpose: input.purpose,
      receiptRef: input.receiptRef?.trim() || null,
      referenceNote: input.referenceNote || null,
      workOrderId: input.workOrderId ?? null,
      projectId: input.projectId ?? null,
      advanceId: input.advanceId ?? null,
      dueDate: input.dueDate ?? null,
      claimantId: type === CASH_TX_TYPES.REIMBURSEMENT ? user.id : null,
      createdById: user.id,
    },
  });
  await logAudit({
    userId: user.id,
    action: "CASH_CREATE",
    module: "finance",
    entityType: "CashTransaction",
    entityId: tx.id,
    description: `Membuat draft ${tx.txNumber} (${CASH_TX_LABELS[type]}) ${formatRupiah(input.amount)}`,
  });
  return { ok: true, id: tx.id };
}

async function evidenceCount(txId: string): Promise<number> {
  return db.attachment.count({
    where: { entityType: "CashTransaction", entityId: txId },
  });
}

// Ajukan approval (expense/reimbursement/advance). Bukti wajib untuk
// expense & reimbursement sebelum diajukan (§7.4, §23–24).
export async function submitCashForApproval(
  user: CurrentUser,
  txId: string
): Promise<Result> {
  const tx = await db.cashTransaction.findUnique({
    where: { id: txId },
    include: { cashbook: true },
  });
  if (!tx) return { ok: false, error: "Transaksi tidak ditemukan." };
  if (tx.status !== "DRAFT") return { ok: false, error: "Hanya draft yang bisa diajukan." };
  if (!CASH_TYPES_NEED_APPROVAL.includes(tx.type as never)) {
    return { ok: false, error: "Tipe ini tidak memerlukan approval — langsung posting." };
  }
  if (
    CASH_TYPES_NEED_EVIDENCE.includes(tx.type as never) &&
    (await evidenceCount(txId)) === 0
  ) {
    return { ok: false, error: "Bukti (nota/foto) wajib diunggah sebelum diajukan (PRD §7.4)." };
  }

  const approval = await submitApprovalRequest({
    user,
    module: "petty_cash",
    title: `${CASH_TX_LABELS[tx.type]} ${tx.txNumber} — ${formatRupiah(tx.amount)}`,
    description: `${tx.purpose} (${tx.cashbook.name})`,
    amount: tx.amount,
    entityType: "CashTransaction",
    entityId: tx.id,
  });
  if (!approval.ok) return approval;

  await db.cashTransaction.update({
    where: { id: txId },
    data: { status: "WAITING_APPROVAL", approvalRequestId: approval.id },
  });
  await logAudit({
    userId: user.id,
    action: "CASH_SUBMIT",
    module: "finance",
    entityType: "CashTransaction",
    entityId: txId,
    description: `Mengajukan ${tx.txNumber} untuk approval`,
  });
  return { ok: true, id: txId };
}

// ── Posting: satu-satunya jalur perubahan saldo ─────────────────

export async function postCashTransaction(
  user: CurrentUser,
  txId: string
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.CASH_POST)) {
    return { ok: false, error: "Anda tidak memiliki izin posting kas." };
  }
  const tx = await db.cashTransaction.findUnique({
    where: { id: txId },
    include: { cashbook: true, cashbookTo: true, advance: true },
  });
  if (!tx) return { ok: false, error: "Transaksi tidak ditemukan." };

  const needsApproval = CASH_TYPES_NEED_APPROVAL.includes(tx.type as never);
  if (needsApproval) {
    if (tx.status !== "WAITING_APPROVAL") {
      return { ok: false, error: "Transaksi harus diajukan dan disetujui sebelum posting." };
    }
    const approval = tx.approvalRequestId
      ? await db.approvalRequest.findUnique({ where: { id: tx.approvalRequestId } })
      : null;
    if (!approval || approval.status !== "APPROVED") {
      return {
        ok: false,
        error: approval
          ? `Approval masih ${approval.status} — belum bisa diposting.`
          : "Approval tidak ditemukan.",
      };
    }
  } else if (tx.status !== "DRAFT") {
    return { ok: false, error: "Hanya draft yang bisa diposting. Transaksi posted immutable." };
  }
  if (
    (CASH_TYPES_NEED_EVIDENCE.includes(tx.type as never) ||
      (tx.type === CASH_TX_TYPES.ADVANCE_SETTLEMENT && tx.amount > BigInt(0))) &&
    (await evidenceCount(txId)) === 0
  ) {
    return { ok: false, error: "Bukti wajib diunggah sebelum posting (PRD §7.4)." };
  }

  try {
    await db.$transaction(async (prisma) => {
      const book = await prisma.cashbook.findUnique({ where: { id: tx.cashbookId } });
      if (!book) throw new Error("Cashbook hilang.");

      const debit = async (bookId: string, delta: bigint, label: string) => {
        const b = await prisma.cashbook.findUnique({ where: { id: bookId } });
        const next = (b?.balance ?? BigInt(0)) + delta;
        if (next < BigInt(0)) {
          throw new Error(
            `Saldo ${label} tidak mencukupi (${formatRupiah(b?.balance ?? BigInt(0))}). Saldo negatif ditolak (business rule 2).`
          );
        }
        await prisma.cashbook.update({ where: { id: bookId }, data: { balance: next } });
      };

      switch (tx.type) {
        case CASH_TX_TYPES.TOP_UP:
          await debit(tx.cashbookId, tx.amount, tx.cashbook.name);
          break;
        case CASH_TX_TYPES.EXPENSE:
        case CASH_TX_TYPES.REIMBURSEMENT:
        case CASH_TX_TYPES.CASH_ADVANCE:
          await debit(tx.cashbookId, -tx.amount, tx.cashbook.name);
          break;
        case CASH_TX_TYPES.CASH_TRANSFER:
          await debit(tx.cashbookId, -tx.amount, tx.cashbook.name);
          await debit(tx.cashbookToId!, tx.amount, tx.cashbookTo?.name ?? "tujuan");
          break;
        case CASH_TX_TYPES.ADVANCE_SETTLEMENT: {
          const advance = await prisma.cashTransaction.findUnique({
            where: { id: tx.advanceId! },
          });
          if (!advance) throw new Error("Advance tidak ditemukan.");
          const total = tx.amount + tx.cashReturnAmount;
          const remaining = advance.amount - advance.settledAmount;
          if (total > remaining) {
            throw new Error(`Settlement melebihi sisa advance (${formatRupiah(remaining)}).`);
          }
          if (tx.cashReturnAmount > BigInt(0)) {
            await debit(tx.cashbookId, tx.cashReturnAmount, tx.cashbook.name);
          }
          const newSettled = advance.settledAmount + total;
          await prisma.cashTransaction.update({
            where: { id: advance.id },
            data: {
              settledAmount: newSettled,
              settledAt: newSettled >= advance.amount ? new Date() : null,
            },
          });
          break;
        }
        default:
          throw new Error("Tipe transaksi tidak dikenal.");
      }

      await prisma.cashTransaction.update({
        where: { id: tx.id },
        data: { status: "POSTED", postedById: user.id, postedAt: new Date() },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Posting gagal." };
  }

  await logAudit({
    userId: user.id,
    action: "CASH_POST",
    module: "finance",
    entityType: "CashTransaction",
    entityId: txId,
    description: `Posting ${tx.txNumber} (${CASH_TX_LABELS[tx.type]}) ${formatRupiah(tx.amount)}`,
  });
  return { ok: true, id: txId };
}

export async function cancelCashDraft(user: CurrentUser, txId: string): Promise<Result> {
  const tx = await db.cashTransaction.findUnique({ where: { id: txId } });
  if (!tx) return { ok: false, error: "Transaksi tidak ditemukan." };
  if (tx.status !== "DRAFT") return { ok: false, error: "Hanya draft yang bisa dibatalkan." };
  if (tx.createdById !== user.id && !user.permissions.has(PERMISSIONS.CASH_POST)) {
    return { ok: false, error: "Hanya pembuat atau Finance yang dapat membatalkan." };
  }
  await db.cashTransaction.update({ where: { id: txId }, data: { status: "CANCELLED" } });
  await logAudit({
    userId: user.id,
    action: "CASH_CANCEL",
    module: "finance",
    entityType: "CashTransaction",
    entityId: txId,
    description: `Membatalkan draft ${tx.txNumber}`,
  });
  return { ok: true, id: txId };
}

export async function reverseCashTransaction(
  user: CurrentUser,
  txId: string,
  reason: string
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.CASH_REVERSE)) {
    return { ok: false, error: "Anda tidak memiliki izin reversal kas." };
  }
  if (!reason?.trim()) return { ok: false, error: "Alasan reversal wajib diisi." };

  const tx = await db.cashTransaction.findUnique({
    where: { id: txId },
    include: { cashbook: true, cashbookTo: true },
  });
  if (!tx) return { ok: false, error: "Transaksi tidak ditemukan." };
  if (tx.status !== "POSTED") return { ok: false, error: "Hanya transaksi posted yang bisa di-reverse." };
  if (tx.reversedById) return { ok: false, error: "Transaksi sudah pernah di-reverse." };
  if (tx.reversalOfId) return { ok: false, error: "Transaksi reversal tidak bisa di-reverse lagi." };

  // §27: periode yang sudah ditutup bulanan terkunci.
  if (tx.cashbook.lockedUntil && tx.postedAt && tx.postedAt <= tx.cashbook.lockedUntil) {
    return {
      ok: false,
      error: `Periode ${tx.cashbook.name} sudah ditutup (monthly closing) — transaksi terkunci.`,
    };
  }
  if (tx.type === CASH_TX_TYPES.CASH_ADVANCE && tx.settledAmount > BigInt(0)) {
    return { ok: false, error: "Advance yang sudah memiliki settlement tidak bisa di-reverse." };
  }

  const revNumber = await nextCashNumber(tx.type);
  let revId = "";
  try {
    await db.$transaction(async (prisma) => {
      const rev = await prisma.cashTransaction.create({
        data: {
          txNumber: revNumber,
          type: tx.type,
          status: "POSTED",
          cashbookId: tx.cashbookId,
          cashbookToId: tx.cashbookToId,
          amount: tx.amount,
          cashReturnAmount: tx.cashReturnAmount,
          categoryId: tx.categoryId,
          costCenterId: tx.costCenterId,
          purpose: `Reversal ${tx.txNumber}: ${reason}`,
          advanceId: tx.advanceId,
          createdById: user.id,
          postedById: user.id,
          postedAt: new Date(),
          reversalOfId: tx.id,
        },
      });
      revId = rev.id;

      const shift = async (bookId: string, delta: bigint, label: string) => {
        const b = await prisma.cashbook.findUnique({ where: { id: bookId } });
        const next = (b?.balance ?? BigInt(0)) + delta;
        if (next < BigInt(0)) {
          throw new Error(`Reversal membuat saldo ${label} negatif — ditolak.`);
        }
        await prisma.cashbook.update({ where: { id: bookId }, data: { balance: next } });
      };

      switch (tx.type) {
        case CASH_TX_TYPES.TOP_UP:
          await shift(tx.cashbookId, -tx.amount, tx.cashbook.name);
          break;
        case CASH_TX_TYPES.EXPENSE:
        case CASH_TX_TYPES.REIMBURSEMENT:
        case CASH_TX_TYPES.CASH_ADVANCE:
          await shift(tx.cashbookId, tx.amount, tx.cashbook.name);
          break;
        case CASH_TX_TYPES.CASH_TRANSFER:
          await shift(tx.cashbookToId!, -tx.amount, tx.cashbookTo?.name ?? "tujuan");
          await shift(tx.cashbookId, tx.amount, tx.cashbook.name);
          break;
        case CASH_TX_TYPES.ADVANCE_SETTLEMENT: {
          const advance = await prisma.cashTransaction.findUnique({
            where: { id: tx.advanceId! },
          });
          if (!advance) throw new Error("Advance tidak ditemukan.");
          if (tx.cashReturnAmount > BigInt(0)) {
            await shift(tx.cashbookId, -tx.cashReturnAmount, tx.cashbook.name);
          }
          await prisma.cashTransaction.update({
            where: { id: advance.id },
            data: {
              settledAmount: advance.settledAmount - (tx.amount + tx.cashReturnAmount),
              settledAt: null,
            },
          });
          break;
        }
      }

      await prisma.cashTransaction.update({
        where: { id: tx.id },
        data: { reversedById: rev.id },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Reversal gagal." };
  }

  await logAudit({
    userId: user.id,
    action: "CASH_REVERSE",
    module: "finance",
    entityType: "CashTransaction",
    entityId: txId,
    description: `Reversal ${tx.txNumber} → ${revNumber}`,
    metadata: { reason },
  });
  return { ok: true, id: revId };
}

// ── Closing (PRD §27) ───────────────────────────────────────────

export async function createClosing(
  user: CurrentUser,
  input: {
    cashbookId: string;
    type: "DAILY" | "MONTHLY";
    physicalBalance: bigint;
    reason?: string;
    lockedUntil?: Date | null;
  }
): Promise<Result<{ variance: string }>> {
  if (!user.permissions.has(PERMISSIONS.CLOSINGS_MANAGE)) {
    return { ok: false, error: "Anda tidak memiliki izin closing." };
  }
  const cashbook = await db.cashbook.findUnique({ where: { id: input.cashbookId } });
  if (!cashbook) return { ok: false, error: "Cashbook tidak ditemukan." };
  if (input.physicalBalance < BigInt(0)) {
    return { ok: false, error: "Kas fisik tidak boleh negatif." };
  }

  const variance = input.physicalBalance - cashbook.balance;
  if (variance !== BigInt(0) && !input.reason?.trim()) {
    return {
      ok: false,
      error: `Ada selisih ${formatRupiah(variance)} — alasan wajib diisi dan masuk variance report (PRD §27).`,
    };
  }
  if (input.type === "MONTHLY") {
    if (!input.lockedUntil) {
      return { ok: false, error: "Tanggal batas periode terkunci wajib diisi untuk monthly closing." };
    }
    if (cashbook.lockedUntil && input.lockedUntil <= cashbook.lockedUntil) {
      return { ok: false, error: "Periode tersebut sudah terkunci sebelumnya." };
    }
  }

  const prefix = monthPrefix("CLS");
  const count = await db.cashClosing.count({
    where: { closingNumber: { startsWith: prefix } },
  });
  const closing = await db.cashClosing.create({
    data: {
      closingNumber: `${prefix}-${String(count + 1).padStart(4, "0")}`,
      cashbookId: input.cashbookId,
      type: input.type,
      closingDate: new Date(),
      systemBalance: cashbook.balance,
      physicalBalance: input.physicalBalance,
      variance,
      reason: input.reason?.trim() || null,
      lockedUntil: input.type === "MONTHLY" ? input.lockedUntil : null,
      createdById: user.id,
    },
  });
  if (input.type === "MONTHLY") {
    await db.cashbook.update({
      where: { id: input.cashbookId },
      data: { lockedUntil: input.lockedUntil },
    });
  }
  await logAudit({
    userId: user.id,
    action: input.type === "MONTHLY" ? "CLOSING_MONTHLY" : "CLOSING_DAILY",
    module: "finance",
    entityType: "CashClosing",
    entityId: closing.id,
    description: `Closing ${input.type === "MONTHLY" ? "bulanan" : "harian"} ${cashbook.name}: variance ${formatRupiah(variance)}`,
    metadata: { reason: input.reason },
  });
  return { ok: true, id: closing.id, data: { variance: variance.toString() } };
}
