import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { notifyUsers, notifyPermission } from "@/lib/notify";
import { submitApprovalRequest } from "@/lib/approval";
import {
  PERMISSIONS,
  IT_TICKET_TYPES,
  IT_TICKET_PRIORITIES,
  ACCESS_TYPES,
  DEPLOY_ENVIRONMENTS,
  DEPLOY_ENVS_NEED_APPROVAL,
  BACKUP_TYPES,
  statusLabel,
} from "@/lib/constants";
import type { CurrentUser } from "@/lib/rbac";

// ── IT/DevOps Engine (PRD §38–45, §53) ──────────────────────────
// Aturan yang ditegakkan DI SINI, bukan di UI:
//  - Deployment production: wajib change record (rule 24), rollback plan
//    (rule 25), testing selesai, backup SUCCESS terverifikasi, maintenance
//    window (§42); tidak dapat dieksekusi tanpa approval; SoD pembuat ≠
//    approver ditegakkan approval engine (rule 26).
//  - Access: production wajib approval (rule 28); temporary wajib expiry
//    (rule 29); offboarding mencabut seluruh akses (rule 30); tidak ada
//    kolom secret/password (rule 31).
//  - Backup: wajib retention & lokasi; target production wajib terenkripsi;
//    backup kritikal wajib diverifikasi (rule 27); backup gagal wajib
//    kronologi dan tercatat di audit log (§44).

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

function monthPrefix(base: string): string {
  const now = new Date();
  return `${base}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function nextNumber(
  base: string,
  count: (prefix: string) => Promise<number>
): Promise<string> {
  const prefix = monthPrefix(base);
  const n = await count(prefix);
  return `${prefix}-${String(n + 1).padStart(4, "0")}`;
}

function isValidCode(list: readonly (readonly [string, string])[], code: string): boolean {
  return list.some(([c]) => c === code);
}

// ── IT Service Desk (PRD §39) ───────────────────────────────────

export async function createTicket(
  user: CurrentUser,
  data: {
    title: string;
    type: string;
    priority?: string;
    description: string;
    requesterId?: string;
  }
): Promise<Result> {
  if (!isValidCode(IT_TICKET_TYPES, data.type)) {
    return { ok: false, error: "Jenis tiket tidak dikenal." };
  }
  const priority = data.priority ?? "MEDIUM";
  if (!IT_TICKET_PRIORITIES.includes(priority as never)) {
    return { ok: false, error: "Prioritas tiket tidak valid." };
  }
  if (!data.title?.trim() || !data.description?.trim()) {
    return { ok: false, error: "Judul dan deskripsi tiket wajib diisi." };
  }
  const ticketNumber = await nextNumber("TIK", (p) =>
    db.itTicket.count({ where: { ticketNumber: { startsWith: p } } })
  );
  const ticket = await db.itTicket.create({
    data: {
      ticketNumber,
      title: data.title,
      type: data.type,
      priority,
      description: data.description,
      requesterId: data.requesterId || user.id,
      createdById: user.id,
    },
  });
  await logAudit({
    userId: user.id,
    action: "IT_TICKET_CREATE",
    module: "itops",
    entityType: "ItTicket",
    entityId: ticket.id,
    description: `Membuat tiket ${ticketNumber} (${statusLabel(data.type)}): ${data.title}`,
  });
  return { ok: true, id: ticket.id };
}

export async function assignTicket(
  user: CurrentUser,
  ticketId: string,
  assigneeId: string
): Promise<Result> {
  const ticket = await db.itTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { ok: false, error: "Tiket tidak ditemukan." };
  if (["RESOLVED", "CLOSED"].includes(ticket.status)) {
    return { ok: false, error: "Tiket sudah selesai." };
  }
  await db.itTicket.update({
    where: { id: ticketId },
    data: { assigneeId, status: ticket.status === "NEW" ? "ASSIGNED" : ticket.status },
  });
  await logAudit({
    userId: user.id,
    action: "IT_TICKET_ASSIGN",
    module: "itops",
    entityType: "ItTicket",
    entityId: ticketId,
    description: `Assign tiket ${ticket.ticketNumber}`,
    metadata: { assigneeId },
  });
  if (assigneeId !== user.id) {
    await notifyUsers([assigneeId], {
      type: "TICKET_ASSIGNED",
      title: `Tiket untuk Anda: ${ticket.title}`,
      body: `${ticket.ticketNumber} di-assign oleh ${user.name}.`,
      link: `/it/tickets/${ticketId}`,
      module: "itops",
    });
  }
  return { ok: true, id: ticketId };
}

export async function setTicketStatus(
  user: CurrentUser,
  ticketId: string,
  status: "IN_PROGRESS" | "WAITING_USER" | "WAITING_VENDOR"
): Promise<Result> {
  const ticket = await db.itTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { ok: false, error: "Tiket tidak ditemukan." };
  if (["RESOLVED", "CLOSED"].includes(ticket.status)) {
    return { ok: false, error: "Tiket sudah selesai." };
  }
  if (!ticket.assigneeId) {
    return { ok: false, error: "Assign tiket ke petugas terlebih dahulu." };
  }
  await db.itTicket.update({ where: { id: ticketId }, data: { status } });
  await logAudit({
    userId: user.id,
    action: "IT_TICKET_STATUS",
    module: "itops",
    entityType: "ItTicket",
    entityId: ticketId,
    description: `Tiket ${ticket.ticketNumber} → ${statusLabel(status)}`,
  });
  return { ok: true, id: ticketId };
}

export async function resolveTicket(
  user: CurrentUser,
  ticketId: string,
  resolution: string
): Promise<Result> {
  const ticket = await db.itTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { ok: false, error: "Tiket tidak ditemukan." };
  if (["RESOLVED", "CLOSED"].includes(ticket.status)) {
    return { ok: false, error: "Tiket sudah selesai." };
  }
  if (!ticket.assigneeId) {
    return { ok: false, error: "Tiket belum di-assign." };
  }
  if (!resolution?.trim()) return { ok: false, error: "Resolusi wajib diisi." };
  await db.itTicket.update({
    where: { id: ticketId },
    data: { status: "RESOLVED", resolution, resolvedAt: new Date() },
  });
  await logAudit({
    userId: user.id,
    action: "IT_TICKET_RESOLVE",
    module: "itops",
    entityType: "ItTicket",
    entityId: ticketId,
    description: `Resolve tiket ${ticket.ticketNumber}`,
  });
  await notifyUsers([ticket.requesterId].filter((id) => id !== user.id), {
    type: "TICKET_RESOLVED",
    title: `Tiket selesai: ${ticket.title}`,
    body: `${ticket.ticketNumber} — ${resolution}`,
    link: `/it/tickets/${ticketId}`,
    module: "itops",
  });
  return { ok: true, id: ticketId };
}

export async function closeTicket(user: CurrentUser, ticketId: string): Promise<Result> {
  const ticket = await db.itTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { ok: false, error: "Tiket tidak ditemukan." };
  if (ticket.status !== "RESOLVED") {
    return { ok: false, error: "Tiket harus resolved sebelum ditutup." };
  }
  await db.itTicket.update({
    where: { id: ticketId },
    data: { status: "CLOSED", closedAt: new Date() },
  });
  await logAudit({
    userId: user.id,
    action: "IT_TICKET_CLOSE",
    module: "itops",
    entityType: "ItTicket",
    entityId: ticketId,
    description: `Menutup tiket ${ticket.ticketNumber}`,
  });
  return { ok: true, id: ticketId };
}

// ── Access Management (PRD §40, rule 28–31) ─────────────────────

export async function createAccessRequest(
  user: CurrentUser,
  data: {
    targetUserId: string;
    accessType: string;
    systemName: string;
    roleRequested: string;
    reason: string;
    isProduction?: boolean;
    isTemporary?: boolean;
    expiryDate?: Date | null;
  }
): Promise<Result> {
  if (!isValidCode(ACCESS_TYPES, data.accessType)) {
    return { ok: false, error: "Jenis akses tidak dikenal." };
  }
  if (!data.systemName?.trim() || !data.roleRequested?.trim()) {
    return { ok: false, error: "Sistem dan role akses wajib diisi." };
  }
  if (!data.reason?.trim()) {
    return { ok: false, error: "Alasan permintaan akses wajib diisi (PRD §40)." };
  }
  // Rule 29: akses sementara wajib punya expiry date.
  if (data.isTemporary && !data.expiryDate) {
    return { ok: false, error: "Akses sementara wajib memiliki expiry date (rule 29)." };
  }
  if (data.expiryDate && data.expiryDate <= new Date()) {
    return { ok: false, error: "Expiry date harus di masa depan." };
  }
  const target = await db.user.findUnique({ where: { id: data.targetUserId } });
  if (!target || !target.isActive) {
    return { ok: false, error: "User penerima tidak ditemukan / nonaktif." };
  }
  const requestNumber = await nextNumber("ACC", (p) =>
    db.accessRequest.count({ where: { requestNumber: { startsWith: p } } })
  );
  const req = await db.accessRequest.create({
    data: {
      requestNumber,
      targetUserId: data.targetUserId,
      accessType: data.accessType,
      systemName: data.systemName,
      roleRequested: data.roleRequested,
      reason: data.reason,
      isProduction: data.isProduction ?? false,
      isTemporary: data.isTemporary ?? false,
      expiryDate: data.expiryDate ?? null,
      createdById: user.id,
    },
  });
  await logAudit({
    userId: user.id,
    action: "ACCESS_REQUEST_CREATE",
    module: "itops",
    entityType: "AccessRequest",
    entityId: req.id,
    description: `Permintaan akses ${requestNumber}: ${target.name} → ${data.systemName} (${data.roleRequested})`,
  });
  return { ok: true, id: req.id };
}

export async function submitAccessRequest(user: CurrentUser, id: string): Promise<Result> {
  const req = await db.accessRequest.findUnique({ where: { id } });
  if (!req) return { ok: false, error: "Permintaan tidak ditemukan." };
  if (req.status !== "DRAFT") return { ok: false, error: "Hanya draft yang bisa diajukan." };
  if (!req.isProduction) {
    return {
      ok: false,
      error: "Akses non-production tidak perlu approval — langsung minta IT memberikan akses.",
    };
  }
  const approval = await submitApprovalRequest({
    user,
    module: "access_request",
    subtype: "production",
    title: `Akses production ${req.requestNumber}: ${req.systemName} (${req.roleRequested})`,
    description: req.reason,
    entityType: "AccessRequest",
    entityId: req.id,
  });
  if (!approval.ok) return approval;
  await db.accessRequest.update({
    where: { id },
    data: { status: "WAITING_APPROVAL", approvalRequestId: approval.id },
  });
  await logAudit({
    userId: user.id,
    action: "ACCESS_REQUEST_SUBMIT",
    module: "itops",
    entityType: "AccessRequest",
    entityId: id,
    description: `Mengajukan akses production ${req.requestNumber}`,
  });
  return { ok: true, id };
}

async function approvalApproved(approvalRequestId: string | null): Promise<boolean> {
  if (!approvalRequestId) return false;
  const approval = await db.approvalRequest.findUnique({ where: { id: approvalRequestId } });
  return approval?.status === "APPROVED";
}

export async function grantAccess(user: CurrentUser, id: string): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.ACCESS_MANAGE)) {
    return { ok: false, error: "Anda tidak memiliki izin memberikan akses." };
  }
  const req = await db.accessRequest.findUnique({ where: { id } });
  if (!req) return { ok: false, error: "Permintaan tidak ditemukan." };
  if (!["DRAFT", "WAITING_APPROVAL"].includes(req.status)) {
    return { ok: false, error: "Permintaan tidak dalam status yang bisa diberikan." };
  }
  // Rule 28: akses production wajib approval sebelum diberikan.
  if (req.isProduction && !(await approvalApproved(req.approvalRequestId))) {
    return {
      ok: false,
      error: "Akses production belum disetujui — tidak dapat diberikan (rule 28).",
    };
  }
  if (req.expiryDate && req.expiryDate <= new Date()) {
    return { ok: false, error: "Expiry date sudah lewat — buat permintaan baru." };
  }
  await db.accessRequest.update({
    where: { id },
    data: { status: "GRANTED", grantedById: user.id, grantedAt: new Date() },
  });
  await logAudit({
    userId: user.id,
    action: "ACCESS_GRANT",
    module: "itops",
    entityType: "AccessRequest",
    entityId: id,
    description: `Memberikan akses ${req.requestNumber} (${req.systemName})`,
  });
  await notifyUsers([req.targetUserId].filter((uid) => uid !== user.id), {
    type: "ACCESS_GRANTED",
    title: `Akses diberikan: ${req.systemName}`,
    body: `${req.requestNumber} (${req.roleRequested})${req.expiryDate ? " — berlaku sampai expiry." : ""}`,
    link: `/it/access/${id}`,
    module: "itops",
  });
  return { ok: true, id };
}

export async function revokeAccess(
  user: CurrentUser,
  id: string,
  reason: string
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.ACCESS_MANAGE)) {
    return { ok: false, error: "Anda tidak memiliki izin mencabut akses." };
  }
  if (!reason?.trim()) return { ok: false, error: "Alasan pencabutan wajib diisi." };
  const req = await db.accessRequest.findUnique({ where: { id } });
  if (!req) return { ok: false, error: "Permintaan tidak ditemukan." };
  if (req.status !== "GRANTED") return { ok: false, error: "Akses tidak dalam status aktif." };
  await db.accessRequest.update({
    where: { id },
    data: { status: "REVOKED", revokedById: user.id, revokedAt: new Date(), revokeReason: reason },
  });
  await logAudit({
    userId: user.id,
    action: "ACCESS_REVOKE",
    module: "itops",
    entityType: "AccessRequest",
    entityId: id,
    description: `Mencabut akses ${req.requestNumber} (${req.systemName})`,
    metadata: { reason },
  });
  return { ok: true, id };
}

// Rule 30: offboarding mencabut SELURUH akses aktif user.
export async function offboardUser(
  user: CurrentUser,
  targetUserId: string,
  reason: string
): Promise<Result<{ revoked: number }>> {
  if (!user.permissions.has(PERMISSIONS.ACCESS_MANAGE)) {
    return { ok: false, error: "Anda tidak memiliki izin offboarding." };
  }
  if (!reason?.trim()) return { ok: false, error: "Alasan offboarding wajib diisi." };
  const target = await db.user.findUnique({ where: { id: targetUserId } });
  if (!target) return { ok: false, error: "User tidak ditemukan." };
  const active = await db.accessRequest.findMany({
    where: { targetUserId, status: "GRANTED" },
  });
  const now = new Date();
  await db.accessRequest.updateMany({
    where: { targetUserId, status: "GRANTED" },
    data: {
      status: "REVOKED",
      revokedById: user.id,
      revokedAt: now,
      revokeReason: `[Offboarding] ${reason}`,
    },
  });
  await logAudit({
    userId: user.id,
    action: "ACCESS_OFFBOARD",
    module: "itops",
    entityType: "User",
    entityId: targetUserId,
    description: `Offboarding ${target.name}: ${active.length} akses dicabut (rule 30)`,
    metadata: { reason, revokedIds: active.map((a) => a.requestNumber) },
  });
  return { ok: true, id: targetUserId, data: { revoked: active.length } };
}

// ── Deployment Management (PRD §42, rule 24–26) ─────────────────

type DeploymentDraftData = {
  applicationId: string;
  version: string;
  environment: string;
  isMajor?: boolean;
  changeRecord?: string;
  releaseNote?: string;
  commitRef?: string;
  hasMigration?: boolean;
  migrationNote?: string;
  deploymentPlan: string;
  testingResult?: string;
  rollbackPlan?: string;
  backupId?: string;
  windowStart?: Date | null;
  windowEnd?: Date | null;
};

export async function createDeployment(
  user: CurrentUser,
  data: DeploymentDraftData
): Promise<Result> {
  if (!DEPLOY_ENVIRONMENTS.includes(data.environment as never)) {
    return { ok: false, error: "Environment deployment tidak valid." };
  }
  if (!data.version?.trim() || !data.deploymentPlan?.trim()) {
    return { ok: false, error: "Versi dan deployment plan wajib diisi (§42)." };
  }
  const app = await db.application.findUnique({ where: { id: data.applicationId } });
  if (!app) return { ok: false, error: "Aplikasi tidak ditemukan." };
  if (data.hasMigration && !data.migrationNote?.trim()) {
    return { ok: false, error: "Deployment dengan migration wajib mencatat detail migration." };
  }
  const deployNumber = await nextNumber("DEP", (p) =>
    db.deployment.count({ where: { deployNumber: { startsWith: p } } })
  );
  const dep = await db.deployment.create({
    data: {
      deployNumber,
      applicationId: data.applicationId,
      version: data.version,
      environment: data.environment,
      isMajor: data.isMajor ?? false,
      changeRecord: data.changeRecord || null,
      releaseNote: data.releaseNote || null,
      commitRef: data.commitRef || null,
      hasMigration: data.hasMigration ?? false,
      migrationNote: data.migrationNote || null,
      deploymentPlan: data.deploymentPlan,
      testingResult: data.testingResult || null,
      rollbackPlan: data.rollbackPlan || null,
      backupId: data.backupId || null,
      windowStart: data.windowStart ?? null,
      windowEnd: data.windowEnd ?? null,
      createdById: user.id,
    },
  });
  await logAudit({
    userId: user.id,
    action: "DEPLOY_CREATE",
    module: "itops",
    entityType: "Deployment",
    entityId: dep.id,
    description: `Membuat deployment ${deployNumber}: ${app.name} v${data.version} → ${statusLabel(data.environment)}`,
  });
  return { ok: true, id: dep.id };
}

// Gerbang §42: production deployment tidak dapat diajukan/dieksekusi bila
// testing belum selesai, change record kosong (rule 24), rollback plan kosong
// (rule 25), backup wajib belum tersedia, atau maintenance window belum ada.
async function productionGateError(dep: {
  environment: string;
  testingResult: string | null;
  changeRecord: string | null;
  rollbackPlan: string | null;
  backupId: string | null;
  windowStart: Date | null;
  windowEnd: Date | null;
}): Promise<string | null> {
  if (dep.environment !== "PRODUCTION") return null;
  if (!dep.testingResult?.trim()) return "Testing belum selesai — hasil testing wajib dicatat (§42).";
  if (!dep.changeRecord?.trim())
    return "Production deployment wajib memiliki change record (rule 24).";
  if (!dep.rollbackPlan?.trim())
    return "Production deployment wajib memiliki rollback plan (rule 25).";
  if (!dep.windowStart || !dep.windowEnd)
    return "Maintenance window belum ditentukan (§42).";
  if (!dep.backupId) return "Backup yang diwajibkan belum tersedia (§42).";
  const backup = await db.backupRecord.findUnique({ where: { id: dep.backupId } });
  if (!backup || backup.status !== "SUCCESS")
    return "Backup tertaut harus berstatus sukses (§42).";
  if (!backup.verificationResult)
    return "Backup untuk production wajib sudah diverifikasi (rule 27).";
  return null;
}

export async function submitDeployment(user: CurrentUser, id: string): Promise<Result> {
  const dep = await db.deployment.findUnique({ where: { id } });
  if (!dep) return { ok: false, error: "Deployment tidak ditemukan." };
  if (dep.status !== "DRAFT") return { ok: false, error: "Hanya draft yang bisa diajukan." };

  const gate = await productionGateError(dep);
  if (gate) return { ok: false, error: gate };

  // Development/Testing: tidak perlu approval — langsung siap dieksekusi.
  if (!DEPLOY_ENVS_NEED_APPROVAL.includes(dep.environment as never)) {
    await db.deployment.update({ where: { id }, data: { status: "READY" } });
    await logAudit({
      userId: user.id,
      action: "DEPLOY_SUBMIT",
      module: "itops",
      entityType: "Deployment",
      entityId: id,
      description: `Deployment ${dep.deployNumber} siap dieksekusi (${statusLabel(dep.environment)}, tanpa approval)`,
    });
    return { ok: true, id };
  }

  const subtype =
    dep.environment === "STAGING"
      ? "staging"
      : dep.isMajor
        ? "production_major"
        : "production_minor";
  const app = await db.application.findUnique({ where: { id: dep.applicationId } });
  const approval = await submitApprovalRequest({
    user,
    module: "deployment",
    subtype,
    title: `${dep.deployNumber}: ${app?.name} v${dep.version} → ${statusLabel(dep.environment)}${dep.environment === "PRODUCTION" ? (dep.isMajor ? " (major)" : " (minor)") : ""}`,
    description: `${dep.deploymentPlan}${dep.changeRecord ? ` | Change: ${dep.changeRecord}` : ""}`,
    entityType: "Deployment",
    entityId: dep.id,
  });
  if (!approval.ok) return approval;
  await db.deployment.update({
    where: { id },
    data: { status: "WAITING_APPROVAL", approvalRequestId: approval.id },
  });
  await logAudit({
    userId: user.id,
    action: "DEPLOY_SUBMIT",
    module: "itops",
    entityType: "Deployment",
    entityId: id,
    description: `Mengajukan deployment ${dep.deployNumber} (${subtype})`,
  });
  return { ok: true, id };
}

export async function executeDeployment(user: CurrentUser, id: string): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.DEPLOYMENTS_EXECUTE)) {
    return { ok: false, error: "Anda tidak memiliki izin mengeksekusi deployment." };
  }
  const dep = await db.deployment.findUnique({ where: { id } });
  if (!dep) return { ok: false, error: "Deployment tidak ditemukan." };
  const needsApproval = DEPLOY_ENVS_NEED_APPROVAL.includes(dep.environment as never);
  if (needsApproval) {
    if (dep.status !== "WAITING_APPROVAL" || !(await approvalApproved(dep.approvalRequestId))) {
      return {
        ok: false,
        error: "Deployment belum disetujui — approval belum tersedia (§42).",
      };
    }
  } else if (dep.status !== "READY") {
    return { ok: false, error: "Deployment tidak dalam antrian eksekusi." };
  }
  // Gerbang production dicek ulang saat eksekusi (kondisi bisa berubah).
  const gate = await productionGateError(dep);
  if (gate) return { ok: false, error: gate };

  await db.deployment.update({
    where: { id },
    data: { status: "IN_PROGRESS", executedById: user.id, startedAt: new Date() },
  });
  await logAudit({
    userId: user.id,
    action: "DEPLOY_EXECUTE",
    module: "itops",
    entityType: "Deployment",
    entityId: id,
    description: `Memulai deployment ${dep.deployNumber}`,
  });
  return { ok: true, id };
}

export async function finishDeployment(
  user: CurrentUser,
  id: string,
  result: string,
  success: boolean
): Promise<Result> {
  const dep = await db.deployment.findUnique({ where: { id } });
  if (!dep) return { ok: false, error: "Deployment tidak ditemukan." };
  if (dep.status !== "IN_PROGRESS") {
    return { ok: false, error: "Deployment belum dimulai." };
  }
  if (!result?.trim()) return { ok: false, error: "Hasil deployment wajib dicatat (§42)." };
  await db.deployment.update({
    where: { id },
    data: {
      status: success ? "COMPLETED" : "FAILED",
      result: `${success ? "[Berhasil]" : "[Gagal]"} ${result}`,
      finishedAt: new Date(),
    },
  });
  await logAudit({
    userId: user.id,
    action: "DEPLOY_FINISH",
    module: "itops",
    entityType: "Deployment",
    entityId: id,
    description: `Deployment ${dep.deployNumber}: ${success ? "berhasil" : "GAGAL"}`,
  });
  if (!success) {
    // §50: deployment gagal — pembuat & tim eksekusi harus tahu segera.
    await notifyUsers([dep.createdById].filter((uid) => uid !== user.id), {
      type: "DEPLOY_FAILED",
      title: `Deployment GAGAL: ${dep.deployNumber}`,
      body: result,
      link: `/it/deployments/${id}`,
      module: "itops",
    });
    await notifyPermission(
      PERMISSIONS.DEPLOYMENTS_EXECUTE,
      {
        type: "DEPLOY_FAILED",
        title: `Deployment GAGAL: ${dep.deployNumber}`,
        body: result,
        link: `/it/deployments/${id}`,
        module: "itops",
      },
      user.id
    );
  }
  return { ok: true, id };
}

export async function rollbackDeployment(
  user: CurrentUser,
  id: string,
  note: string
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.DEPLOYMENTS_EXECUTE)) {
    return { ok: false, error: "Anda tidak memiliki izin melakukan rollback." };
  }
  if (!note?.trim()) return { ok: false, error: "Catatan rollback wajib diisi." };
  const dep = await db.deployment.findUnique({ where: { id } });
  if (!dep) return { ok: false, error: "Deployment tidak ditemukan." };
  if (!["IN_PROGRESS", "COMPLETED", "FAILED"].includes(dep.status)) {
    return { ok: false, error: "Deployment belum/tidak dieksekusi — tidak ada yang di-rollback." };
  }
  await db.deployment.update({
    where: { id },
    data: { status: "ROLLED_BACK", rollbackNote: note, finishedAt: dep.finishedAt ?? new Date() },
  });
  await logAudit({
    userId: user.id,
    action: "DEPLOY_ROLLBACK",
    module: "itops",
    entityType: "Deployment",
    entityId: id,
    description: `Rollback deployment ${dep.deployNumber}`,
    metadata: { note },
  });
  return { ok: true, id };
}

export async function cancelDeployment(
  user: CurrentUser,
  id: string,
  reason: string
): Promise<Result> {
  if (!reason?.trim()) return { ok: false, error: "Alasan pembatalan wajib diisi." };
  const dep = await db.deployment.findUnique({ where: { id } });
  if (!dep) return { ok: false, error: "Deployment tidak ditemukan." };
  if (!["DRAFT", "WAITING_APPROVAL", "READY"].includes(dep.status)) {
    return { ok: false, error: "Deployment yang sudah berjalan tidak bisa dibatalkan." };
  }
  await db.deployment.update({
    where: { id },
    data: { status: "CANCELLED", result: `[Dibatalkan] ${reason}` },
  });
  await logAudit({
    userId: user.id,
    action: "DEPLOY_CANCEL",
    module: "itops",
    entityType: "Deployment",
    entityId: id,
    description: `Membatalkan deployment ${dep.deployNumber}`,
    metadata: { reason },
  });
  return { ok: true, id };
}

// ── Backup & DR (PRD §44, rule 27) ──────────────────────────────

export async function createBackupRecord(
  user: CurrentUser,
  data: {
    serverId?: string;
    applicationId?: string;
    backupType: string;
    schedule?: string;
    location: string;
    retention: string;
    isEncrypted?: boolean;
    isCritical?: boolean;
    status: string;
    failureNote?: string;
    executedAt: Date;
  }
): Promise<Result> {
  if (!isValidCode(BACKUP_TYPES, data.backupType)) {
    return { ok: false, error: "Jenis backup tidak dikenal." };
  }
  if (!data.serverId && !data.applicationId) {
    return { ok: false, error: "Backup wajib tertaut server atau aplikasi (§44)." };
  }
  if (!data.location?.trim() || !data.retention?.trim()) {
    return { ok: false, error: "Lokasi dan retention backup wajib diisi (§44)." };
  }
  if (!["SUCCESS", "FAILED"].includes(data.status)) {
    return { ok: false, error: "Status backup harus Sukses atau Gagal." };
  }
  if (data.status === "FAILED" && !data.failureNote?.trim()) {
    return { ok: false, error: "Backup gagal wajib mencatat penyebab (§44 — alert)." };
  }
  // §44: backup untuk target production wajib terenkripsi.
  let productionTarget = false;
  if (data.serverId) {
    const server = await db.server.findUnique({ where: { id: data.serverId } });
    if (!server) return { ok: false, error: "Server tidak ditemukan." };
    productionTarget ||= server.environment === "PRODUCTION";
  }
  if (data.applicationId) {
    const app = await db.application.findUnique({ where: { id: data.applicationId } });
    if (!app) return { ok: false, error: "Aplikasi tidak ditemukan." };
    productionTarget ||= app.environment === "PRODUCTION";
  }
  if (productionTarget && !data.isEncrypted) {
    return { ok: false, error: "Backup production wajib terenkripsi (§44)." };
  }

  const backupNumber = await nextNumber("BCK", (p) =>
    db.backupRecord.count({ where: { backupNumber: { startsWith: p } } })
  );
  const backup = await db.backupRecord.create({
    data: {
      backupNumber,
      serverId: data.serverId || null,
      applicationId: data.applicationId || null,
      backupType: data.backupType,
      schedule: data.schedule || null,
      location: data.location,
      retention: data.retention,
      isEncrypted: data.isEncrypted ?? false,
      isCritical: data.isCritical ?? false,
      status: data.status,
      failureNote: data.failureNote || null,
      executedAt: data.executedAt,
      createdById: user.id,
    },
  });
  await logAudit({
    userId: user.id,
    action: data.status === "FAILED" ? "BACKUP_FAILED" : "BACKUP_RESULT",
    module: "itops",
    entityType: "BackupRecord",
    entityId: backup.id,
    description: `Backup ${backupNumber} (${statusLabel(data.backupType)}): ${statusLabel(data.status)}${data.status === "FAILED" ? ` — ${data.failureNote}` : ""}`,
  });
  if (data.status === "FAILED") {
    // §44: backup gagal menghasilkan alert.
    await notifyPermission(
      PERMISSIONS.BACKUPS_MANAGE,
      {
        type: "BACKUP_FAILED",
        title: `Backup GAGAL: ${backupNumber}`,
        body: data.failureNote,
        link: `/it/backups/${backup.id}`,
        module: "itops",
      },
      user.id
    );
  }
  return { ok: true, id: backup.id };
}

// Rule 27: backup kritikal wajib diverifikasi.
export async function verifyBackup(
  user: CurrentUser,
  id: string,
  result: string
): Promise<Result> {
  if (!result?.trim()) return { ok: false, error: "Hasil verifikasi wajib diisi (rule 27)." };
  const backup = await db.backupRecord.findUnique({ where: { id } });
  if (!backup) return { ok: false, error: "Backup tidak ditemukan." };
  if (backup.status !== "SUCCESS") {
    return { ok: false, error: "Hanya backup sukses yang bisa diverifikasi." };
  }
  await db.backupRecord.update({
    where: { id },
    data: { verificationResult: result, verifiedById: user.id, verifiedAt: new Date() },
  });
  await logAudit({
    userId: user.id,
    action: "BACKUP_VERIFY",
    module: "itops",
    entityType: "BackupRecord",
    entityId: id,
    description: `Verifikasi backup ${backup.backupNumber}`,
  });
  return { ok: true, id };
}

export async function recordRestoreTest(
  user: CurrentUser,
  id: string,
  result: string
): Promise<Result> {
  if (!result?.trim()) return { ok: false, error: "Hasil restore test wajib diisi (§44)." };
  const backup = await db.backupRecord.findUnique({ where: { id } });
  if (!backup) return { ok: false, error: "Backup tidak ditemukan." };
  if (backup.status !== "SUCCESS") {
    return { ok: false, error: "Restore test hanya untuk backup sukses." };
  }
  await db.backupRecord.update({
    where: { id },
    data: { restoreTestAt: new Date(), restoreTestResult: result },
  });
  await logAudit({
    userId: user.id,
    action: "BACKUP_RESTORE_TEST",
    module: "itops",
    entityType: "BackupRecord",
    entityId: id,
    description: `Restore test backup ${backup.backupNumber}`,
  });
  return { ok: true, id };
}
