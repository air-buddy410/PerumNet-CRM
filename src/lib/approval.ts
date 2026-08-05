import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { APPROVAL_STATUS, AUDIT_ACTIONS } from "@/lib/constants";
import type { CurrentUser } from "@/lib/rbac";

// ── Approval Engine ─────────────────────────────────────────────
// Aturan yang ditegakkan di sini (PRD §7.3, §48, §53):
//  - Rule dicocokkan berdasarkan module + subtype + rentang amount.
//  - Pembuat request TIDAK PERNAH bisa approve/reject request-nya sendiri.
//  - Satu user tidak bisa approve dua step pada request yang sama.
//  - Approver harus memiliki role yang disyaratkan step aktif.
//  - Request yang sudah selesai (approved/rejected/cancelled) immutable.

export async function findMatchingRule(
  module: string,
  subtype: string | null,
  amount: bigint | null
) {
  const rules = await db.approvalRule.findMany({
    where: { module, isActive: true },
    include: { steps: { include: { role: true }, orderBy: { stepOrder: "asc" } } },
  });

  const candidates = rules.filter((r) => {
    if ((r.subtype ?? null) !== (subtype ?? null)) return false;
    if (amount === null) return true;
    if (amount < r.minAmount) return false;
    if (r.maxAmount !== null && amount > r.maxAmount) return false;
    return true;
  });
  return candidates[0] ?? null;
}

async function nextRequestNumber(): Promise<string> {
  const now = new Date();
  const prefix = `APR-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const count = await db.approvalRequest.count({
    where: { requestNumber: { startsWith: prefix } },
  });
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

export async function submitApprovalRequest(input: {
  user: CurrentUser;
  module: string;
  subtype?: string | null;
  title: string;
  description?: string;
  amount?: bigint | null;
  entityType?: string;
  entityId?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const subtype = input.subtype ?? null;
  const amount = input.amount ?? null;

  const rule = await findMatchingRule(input.module, subtype, amount);
  if (!rule) {
    return {
      ok: false,
      error:
        "Tidak ada approval rule aktif yang cocok untuk modul/subtipe/nilai ini. Hubungi Super Admin.",
    };
  }

  const requestNumber = await nextRequestNumber();
  const request = await db.approvalRequest.create({
    data: {
      requestNumber,
      module: input.module,
      subtype,
      title: input.title,
      description: input.description,
      amount,
      entityType: input.entityType,
      entityId: input.entityId,
      ruleId: rule.id,
      requestedById: input.user.id,
      steps: {
        create: rule.steps.map((s) => ({
          stepOrder: s.stepOrder,
          roleId: s.roleId,
        })),
      },
    },
  });

  await logAudit({
    userId: input.user.id,
    action: AUDIT_ACTIONS.APPROVAL_SUBMIT,
    module: "approvals",
    entityType: "ApprovalRequest",
    entityId: request.id,
    description: `Mengajukan ${requestNumber}: ${input.title}`,
    metadata: { module: input.module, subtype, amount: amount?.toString() },
  });

  return { ok: true, id: request.id };
}

export async function actOnApproval(input: {
  user: CurrentUser;
  requestId: string;
  action: "APPROVE" | "REJECT";
  note?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const request = await db.approvalRequest.findUnique({
    where: { id: input.requestId },
    include: { steps: { orderBy: { stepOrder: "asc" }, include: { role: true } } },
  });
  if (!request) return { ok: false, error: "Request tidak ditemukan." };

  if (request.status !== APPROVAL_STATUS.PENDING) {
    return { ok: false, error: "Request sudah selesai dan tidak dapat diubah." };
  }

  // Segregation of duties — pembuat tidak boleh menyetujui transaksinya sendiri.
  if (request.requestedById === input.user.id) {
    return {
      ok: false,
      error: "Segregation of duties: Anda tidak dapat menyetujui/menolak request Anda sendiri.",
    };
  }

  const step = request.steps.find((s) => s.stepOrder === request.currentStep);
  if (!step || step.status !== "PENDING") {
    return { ok: false, error: "Tidak ada step aktif pada request ini." };
  }

  const hasRole = input.user.roles.some((r) => r.id === step.roleId);
  if (!hasRole) {
    return {
      ok: false,
      error: `Step ini memerlukan role "${step.role.name}".`,
    };
  }

  const alreadyActed = request.steps.some((s) => s.actedById === input.user.id);
  if (alreadyActed) {
    return {
      ok: false,
      error: "Anda sudah memberikan keputusan pada step lain di request ini.",
    };
  }

  const now = new Date();
  if (input.action === "REJECT") {
    await db.$transaction([
      db.approvalStep.update({
        where: { id: step.id },
        data: {
          status: "REJECTED",
          actedById: input.user.id,
          note: input.note,
          actedAt: now,
        },
      }),
      db.approvalRequest.update({
        where: { id: request.id },
        data: { status: APPROVAL_STATUS.REJECTED, resolvedAt: now },
      }),
    ]);
    await logAudit({
      userId: input.user.id,
      action: AUDIT_ACTIONS.APPROVAL_REJECT,
      module: "approvals",
      entityType: "ApprovalRequest",
      entityId: request.id,
      description: `Menolak ${request.requestNumber} pada step ${step.stepOrder}`,
      metadata: { note: input.note },
    });
    return { ok: true };
  }

  const isLastStep = request.currentStep >= request.steps.length;
  await db.$transaction([
    db.approvalStep.update({
      where: { id: step.id },
      data: {
        status: "APPROVED",
        actedById: input.user.id,
        note: input.note,
        actedAt: now,
      },
    }),
    db.approvalRequest.update({
      where: { id: request.id },
      data: isLastStep
        ? { status: APPROVAL_STATUS.APPROVED, resolvedAt: now }
        : { currentStep: request.currentStep + 1 },
    }),
  ]);
  await logAudit({
    userId: input.user.id,
    action: AUDIT_ACTIONS.APPROVAL_APPROVE,
    module: "approvals",
    entityType: "ApprovalRequest",
    entityId: request.id,
    description: `Menyetujui ${request.requestNumber} step ${step.stepOrder}${isLastStep ? " (final)" : ""}`,
    metadata: { note: input.note },
  });
  return { ok: true };
}

export async function cancelApproval(input: {
  user: CurrentUser;
  requestId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const request = await db.approvalRequest.findUnique({
    where: { id: input.requestId },
  });
  if (!request) return { ok: false, error: "Request tidak ditemukan." };
  if (request.requestedById !== input.user.id) {
    return { ok: false, error: "Hanya pembuat yang dapat membatalkan request." };
  }
  if (request.status !== APPROVAL_STATUS.PENDING) {
    return { ok: false, error: "Request sudah selesai dan tidak dapat dibatalkan." };
  }
  await db.approvalRequest.update({
    where: { id: request.id },
    data: { status: APPROVAL_STATUS.CANCELLED, resolvedAt: new Date() },
  });
  await logAudit({
    userId: input.user.id,
    action: AUDIT_ACTIONS.APPROVAL_CANCEL,
    module: "approvals",
    entityType: "ApprovalRequest",
    entityId: request.id,
    description: `Membatalkan ${request.requestNumber}`,
  });
  return { ok: true };
}
