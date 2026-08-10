import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";
import { PERMISSIONS, CTICKET_PRIORITIES } from "@/lib/constants";
import type { CurrentUser } from "@/lib/rbac";

// ── Helpdesk Pelanggan Engine (DESIGN-PHASE-8 §6, gap G15–G17) ──
// Aturan yang ditegakkan DI SINI, bukan di UI:
//  - MTTR dihitung saat solve dan BERSIH dari jeda pause (nilai tambah
//    vs sistem lama); pause wajib alasan; solve ditolak selama masih
//    ada pause terbuka.
//  - Kategori ber-workflow: solve ditolak sebelum seluruh step wajib
//    selesai (workflow harus dimulai dulu).
//  - Sub-tiket maksimal satu tingkat; parent tidak bisa CLOSED selama
//    ada sub-tiket yang belum CLOSED.
//  - Yang boleh mengerjakan tiket: assignee, member, atau pemegang
//    ctickets.manage — dicek di engine, bukan UI.
//  - SLA: slaBreached = MTTR bersih > slaHours kategori.

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

async function nextTicketNumber(): Promise<string> {
  const now = new Date();
  const prefix = `CT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const n = await db.customerTicket.count({ where: { ticketNumber: { startsWith: prefix } } });
  return `${prefix}-${String(n + 1).padStart(4, "0")}`;
}

// Assignee, member, atau pemegang ctickets.manage.
async function canAct(user: CurrentUser, ticketId: string): Promise<boolean> {
  if (user.permissions.has(PERMISSIONS.CTICKETS_MANAGE)) return true;
  const ticket = await db.customerTicket.findUnique({
    where: { id: ticketId },
    include: { members: true },
  });
  if (!ticket) return false;
  return ticket.assigneeId === user.id || ticket.members.some((m) => m.userId === user.id);
}

// ── Master kategori & workflow (G17) ────────────────────────────

export async function saveTicketCategory(
  user: CurrentUser,
  data: { id?: string; name: string; slaHours?: number | null; workflowId?: string | null; isActive?: boolean }
): Promise<Result> {
  if (!data.name?.trim()) return { ok: false, error: "Nama kategori wajib diisi." };
  if (
    data.slaHours !== undefined && data.slaHours !== null &&
    (!Number.isInteger(data.slaHours) || data.slaHours < 1 || data.slaHours > 720)
  ) {
    return { ok: false, error: "SLA harus 1–720 jam." };
  }
  if (data.workflowId) {
    const wf = await db.workflowTemplate.findUnique({ where: { id: data.workflowId } });
    if (!wf) return { ok: false, error: "Workflow template tidak ditemukan." };
  }
  const dup = await db.ticketCategory.findFirst({
    where: { name: data.name, ...(data.id ? { id: { not: data.id } } : {}) },
  });
  if (dup) return { ok: false, error: `Kategori "${data.name}" sudah ada.` };
  const payload = {
    name: data.name,
    slaHours: data.slaHours ?? null,
    workflowId: data.workflowId || null,
    isActive: data.isActive ?? true,
  };
  const cat = data.id
    ? await db.ticketCategory.update({ where: { id: data.id }, data: payload })
    : await db.ticketCategory.create({ data: payload });
  await logAudit({
    userId: user.id,
    action: data.id ? "CTICKET_CATEGORY_UPDATE" : "CTICKET_CATEGORY_CREATE",
    module: "helpdesk",
    entityType: "TicketCategory",
    entityId: cat.id,
    description: `${data.id ? "Mengubah" : "Membuat"} kategori tiket "${data.name}"`,
  });
  return { ok: true, id: cat.id };
}

export async function saveWorkflowTemplate(user: CurrentUser, name: string): Promise<Result> {
  if (!name?.trim()) return { ok: false, error: "Nama workflow wajib diisi." };
  const dup = await db.workflowTemplate.findUnique({ where: { name } });
  if (dup) return { ok: false, error: `Workflow "${name}" sudah ada.` };
  const wf = await db.workflowTemplate.create({ data: { kind: "TICKET", name } });
  await logAudit({
    userId: user.id,
    action: "WORKFLOW_CREATE",
    module: "helpdesk",
    entityType: "WorkflowTemplate",
    entityId: wf.id,
    description: `Membuat workflow "${name}"`,
  });
  return { ok: true, id: wf.id };
}

export async function addWorkflowStep(
  user: CurrentUser,
  data: { templateId: string; name: string; description?: string; isRequired?: boolean }
): Promise<Result> {
  if (!data.name?.trim()) return { ok: false, error: "Nama step wajib diisi." };
  const template = await db.workflowTemplate.findUnique({
    where: { id: data.templateId },
    include: { steps: { orderBy: { order: "desc" }, take: 1 } },
  });
  if (!template) return { ok: false, error: "Workflow template tidak ditemukan." };
  const order = (template.steps[0]?.order ?? 0) + 1;
  const step = await db.workflowStep.create({
    data: {
      templateId: data.templateId,
      order,
      name: data.name,
      description: data.description || null,
      isRequired: data.isRequired ?? true,
    },
  });
  await logAudit({
    userId: user.id,
    action: "WORKFLOW_STEP_ADD",
    module: "helpdesk",
    entityType: "WorkflowStep",
    entityId: step.id,
    description: `Menambah step ${order}. ${data.name} ke workflow "${template.name}"`,
  });
  return { ok: true, id: step.id };
}

// ── Tiket pelanggan (G16) ───────────────────────────────────────

export async function createCustomerTicket(
  user: CurrentUser,
  data: {
    customerId: string;
    subscriptionId?: string | null;
    categoryId: string;
    title: string;
    description?: string;
    priority?: string;
    tags?: string;
    assigneeId?: string | null;
    parentId?: string | null;
    scheduledAt?: Date | null;
    workOrderId?: string | null;
  }
): Promise<Result> {
  if (!data.title?.trim()) return { ok: false, error: "Judul tiket wajib diisi." };
  const priority = data.priority ?? "NORMAL";
  if (!CTICKET_PRIORITIES.includes(priority as never)) {
    return { ok: false, error: "Prioritas tidak valid." };
  }
  const customer = await db.customer.findUnique({ where: { id: data.customerId } });
  if (!customer) return { ok: false, error: "Pelanggan tidak ditemukan." };
  const category = await db.ticketCategory.findUnique({ where: { id: data.categoryId } });
  if (!category || !category.isActive) return { ok: false, error: "Kategori tidak ditemukan / nonaktif." };
  if (data.subscriptionId) {
    const sub = await db.subscription.findUnique({ where: { id: data.subscriptionId } });
    if (!sub || sub.customerId !== data.customerId) {
      return { ok: false, error: "Langganan bukan milik pelanggan ini." };
    }
  }
  if (data.parentId) {
    const parent = await db.customerTicket.findUnique({ where: { id: data.parentId } });
    if (!parent) return { ok: false, error: "Tiket induk tidak ditemukan." };
    if (parent.parentId) return { ok: false, error: "Sub-tiket maksimal satu tingkat." };
    if (parent.status === "CLOSED") return { ok: false, error: "Tiket induk sudah ditutup." };
  }
  if (data.workOrderId) {
    const wo = await db.workOrder.findUnique({ where: { id: data.workOrderId } });
    if (!wo) return { ok: false, error: "Work order tidak ditemukan." };
  }
  const ticketNumber = await nextTicketNumber();
  const ticket = await db.customerTicket.create({
    data: {
      ticketNumber,
      customerId: data.customerId,
      subscriptionId: data.subscriptionId ?? null,
      categoryId: data.categoryId,
      title: data.title,
      description: data.description || null,
      priority,
      tags: data.tags?.trim() || null,
      assigneeId: data.assigneeId ?? null,
      parentId: data.parentId ?? null,
      scheduledAt: data.scheduledAt ?? null,
      workOrderId: data.workOrderId ?? null,
      firstResponseAt: data.assigneeId ? new Date() : null,
      createdById: user.id,
    },
  });
  await logAudit({
    userId: user.id,
    action: "CTICKET_CREATE",
    module: "helpdesk",
    entityType: "CustomerTicket",
    entityId: ticket.id,
    description: `Tiket ${ticketNumber} (${category.name}) untuk ${customer.name}: ${data.title}`,
  });
  if (data.assigneeId && data.assigneeId !== user.id) {
    await notifyUsers([data.assigneeId], {
      type: "CTICKET_ASSIGNED",
      title: `Tiket pelanggan: ${data.title}`,
      body: `${ticketNumber} — ${customer.name}`,
      link: `/helpdesk/tickets/${ticket.id}`,
      module: "helpdesk",
    });
  }
  return { ok: true, id: ticket.id };
}

export async function assignCustomerTicket(
  user: CurrentUser,
  ticketId: string,
  assigneeId: string
): Promise<Result> {
  const ticket = await db.customerTicket.findUnique({ where: { id: ticketId }, include: { customer: true } });
  if (!ticket) return { ok: false, error: "Tiket tidak ditemukan." };
  if (["SOLVED", "CLOSED"].includes(ticket.status)) {
    return { ok: false, error: "Tiket sudah selesai." };
  }
  await db.customerTicket.update({
    where: { id: ticketId },
    data: { assigneeId, firstResponseAt: ticket.firstResponseAt ?? new Date() },
  });
  await logAudit({
    userId: user.id,
    action: "CTICKET_ASSIGN",
    module: "helpdesk",
    entityType: "CustomerTicket",
    entityId: ticketId,
    description: `Assign ${ticket.ticketNumber}`,
    metadata: { assigneeId },
  });
  if (assigneeId !== user.id) {
    await notifyUsers([assigneeId], {
      type: "CTICKET_ASSIGNED",
      title: `Tiket pelanggan: ${ticket.title}`,
      body: `${ticket.ticketNumber} — ${ticket.customer.name}`,
      link: `/helpdesk/tickets/${ticketId}`,
      module: "helpdesk",
    });
  }
  return { ok: true, id: ticketId };
}

export async function addTicketMember(user: CurrentUser, ticketId: string, userId: string): Promise<Result> {
  const ticket = await db.customerTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { ok: false, error: "Tiket tidak ditemukan." };
  const existing = await db.ticketMember.findUnique({
    where: { ticketId_userId: { ticketId, userId } },
  });
  if (existing) return { ok: false, error: "Sudah menjadi member tiket ini." };
  await db.ticketMember.create({ data: { ticketId, userId } });
  await notifyUsers([userId].filter((u) => u !== user.id), {
    type: "CTICKET_MEMBER",
    title: `Anda ditambahkan ke tiket ${ticket.ticketNumber}`,
    body: ticket.title,
    link: `/helpdesk/tickets/${ticketId}`,
    module: "helpdesk",
  });
  return { ok: true, id: ticketId };
}

export async function removeTicketMember(user: CurrentUser, ticketId: string, userId: string): Promise<Result> {
  const existing = await db.ticketMember.findUnique({
    where: { ticketId_userId: { ticketId, userId } },
  });
  if (!existing) return { ok: false, error: "Bukan member tiket ini." };
  await db.ticketMember.delete({ where: { ticketId_userId: { ticketId, userId } } });
  void user;
  return { ok: true, id: ticketId };
}

export async function startCustomerTicket(user: CurrentUser, ticketId: string): Promise<Result> {
  if (!(await canAct(user, ticketId))) {
    return { ok: false, error: "Hanya assignee/member/koordinator yang bisa mengerjakan tiket ini." };
  }
  const ticket = await db.customerTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { ok: false, error: "Tiket tidak ditemukan." };
  if (ticket.status !== "OPEN") return { ok: false, error: "Tiket sudah dikerjakan." };
  await db.customerTicket.update({
    where: { id: ticketId },
    data: { status: "IN_PROGRESS", firstResponseAt: ticket.firstResponseAt ?? new Date() },
  });
  await logAudit({
    userId: user.id,
    action: "CTICKET_START",
    module: "helpdesk",
    entityType: "CustomerTicket",
    entityId: ticketId,
    description: `Mulai mengerjakan ${ticket.ticketNumber}`,
  });
  return { ok: true, id: ticketId };
}

// "Hentikan Sementara" — alasan wajib; MTTR berhenti selama jeda.
export async function pauseCustomerTicket(
  user: CurrentUser,
  ticketId: string,
  reason: string
): Promise<Result> {
  if (!reason?.trim()) return { ok: false, error: "Alasan hentikan sementara wajib diisi." };
  if (!(await canAct(user, ticketId))) {
    return { ok: false, error: "Hanya assignee/member/koordinator yang bisa mengerjakan tiket ini." };
  }
  const ticket = await db.customerTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { ok: false, error: "Tiket tidak ditemukan." };
  if (ticket.status !== "IN_PROGRESS") {
    return { ok: false, error: "Hanya tiket yang sedang dikerjakan yang bisa dihentikan sementara." };
  }
  await db.$transaction([
    db.ticketPause.create({ data: { ticketId, reason, createdById: user.id } }),
    db.customerTicket.update({ where: { id: ticketId }, data: { status: "PENDING" } }),
  ]);
  await logAudit({
    userId: user.id,
    action: "CTICKET_PAUSE",
    module: "helpdesk",
    entityType: "CustomerTicket",
    entityId: ticketId,
    description: `Hentikan sementara ${ticket.ticketNumber}: ${reason}`,
  });
  return { ok: true, id: ticketId };
}

export async function resumeCustomerTicket(user: CurrentUser, ticketId: string): Promise<Result> {
  if (!(await canAct(user, ticketId))) {
    return { ok: false, error: "Hanya assignee/member/koordinator yang bisa mengerjakan tiket ini." };
  }
  const ticket = await db.customerTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { ok: false, error: "Tiket tidak ditemukan." };
  if (ticket.status !== "PENDING") return { ok: false, error: "Tiket tidak sedang dijeda." };
  const openPause = await db.ticketPause.findFirst({
    where: { ticketId, resumedAt: null },
    orderBy: { pausedAt: "desc" },
  });
  await db.$transaction([
    ...(openPause
      ? [db.ticketPause.update({ where: { id: openPause.id }, data: { resumedAt: new Date() } })]
      : []),
    db.customerTicket.update({ where: { id: ticketId }, data: { status: "IN_PROGRESS" } }),
  ]);
  await logAudit({
    userId: user.id,
    action: "CTICKET_RESUME",
    module: "helpdesk",
    entityType: "CustomerTicket",
    entityId: ticketId,
    description: `Lanjutkan ${ticket.ticketNumber}`,
  });
  return { ok: true, id: ticketId };
}

// ── Workflow progress (G17) ─────────────────────────────────────

export async function startWorkflow(user: CurrentUser, ticketId: string): Promise<Result> {
  if (!(await canAct(user, ticketId))) {
    return { ok: false, error: "Hanya assignee/member/koordinator yang bisa mengerjakan tiket ini." };
  }
  const ticket = await db.customerTicket.findUnique({
    where: { id: ticketId },
    include: { category: { include: { workflow: { include: { steps: true } } } }, progress: true },
  });
  if (!ticket) return { ok: false, error: "Tiket tidak ditemukan." };
  const workflow = ticket.category.workflow;
  if (!workflow || workflow.steps.length === 0) {
    return { ok: false, error: "Kategori tiket ini tidak memiliki workflow." };
  }
  if (ticket.progress.length > 0) return { ok: false, error: "Workflow sudah dimulai." };
  await db.ticketStepProgress.createMany({
    data: workflow.steps.map((s) => ({ ticketId, stepId: s.id })),
  });
  await logAudit({
    userId: user.id,
    action: "CTICKET_WORKFLOW_START",
    module: "helpdesk",
    entityType: "CustomerTicket",
    entityId: ticketId,
    description: `Mulai workflow "${workflow.name}" (${workflow.steps.length} step) di ${ticket.ticketNumber}`,
  });
  return { ok: true, id: ticketId };
}

export async function completeStep(
  user: CurrentUser,
  progressId: string,
  note?: string
): Promise<Result> {
  const progress = await db.ticketStepProgress.findUnique({
    where: { id: progressId },
    include: { step: true, ticket: true },
  });
  if (!progress) return { ok: false, error: "Step tidak ditemukan." };
  if (!(await canAct(user, progress.ticketId))) {
    return { ok: false, error: "Hanya assignee/member/koordinator yang bisa mengerjakan tiket ini." };
  }
  if (progress.doneAt) return { ok: false, error: "Step sudah diselesaikan." };
  if (["SOLVED", "CLOSED"].includes(progress.ticket.status)) {
    return { ok: false, error: "Tiket sudah selesai." };
  }
  await db.ticketStepProgress.update({
    where: { id: progressId },
    data: { doneAt: new Date(), doneById: user.id, note: note || null },
  });
  await logAudit({
    userId: user.id,
    action: "CTICKET_STEP_DONE",
    module: "helpdesk",
    entityType: "CustomerTicket",
    entityId: progress.ticketId,
    description: `Step "${progress.step.name}" selesai di ${progress.ticket.ticketNumber}`,
  });
  return { ok: true, id: progressId };
}

// ── Solve & close — MTTR bersih dari pause ──────────────────────

export async function solveCustomerTicket(
  user: CurrentUser,
  ticketId: string,
  resolution: string
): Promise<Result<{ mttrMinutes: number; slaBreached: boolean }>> {
  if (!resolution?.trim()) return { ok: false, error: "Resolusi wajib diisi." };
  if (!(await canAct(user, ticketId))) {
    return { ok: false, error: "Hanya assignee/member/koordinator yang bisa mengerjakan tiket ini." };
  }
  const ticket = await db.customerTicket.findUnique({
    where: { id: ticketId },
    include: {
      category: { include: { workflow: { include: { steps: true } } } },
      progress: true,
      pauses: true,
    },
  });
  if (!ticket) return { ok: false, error: "Tiket tidak ditemukan." };
  if (ticket.status === "PENDING") {
    return { ok: false, error: "Tiket sedang dijeda — lanjutkan dulu sebelum solve." };
  }
  if (ticket.status !== "IN_PROGRESS") {
    return { ok: false, error: "Mulai kerjakan tiket dulu sebelum solve." };
  }
  if (ticket.pauses.some((p) => !p.resumedAt)) {
    return { ok: false, error: "Masih ada jeda terbuka — data tidak konsisten." };
  }
  // Gerbang workflow: step wajib harus selesai.
  const workflow = ticket.category.workflow;
  if (workflow && workflow.steps.some((s) => s.isRequired)) {
    if (ticket.progress.length === 0) {
      return { ok: false, error: `Kategori ini ber-workflow "${workflow.name}" — mulai workflow dulu.` };
    }
    const requiredIds = new Set(workflow.steps.filter((s) => s.isRequired).map((s) => s.id));
    const undone = ticket.progress.filter((p) => requiredIds.has(p.stepId) && !p.doneAt);
    if (undone.length > 0) {
      return { ok: false, error: `${undone.length} step wajib belum selesai — selesaikan workflow dulu.` };
    }
  }
  const resolvedAt = new Date();
  // MTTR BERSIH: durasi total dikurangi seluruh jeda pause.
  const pauseMs = ticket.pauses.reduce(
    (acc, p) => acc + ((p.resumedAt?.getTime() ?? 0) - p.pausedAt.getTime()),
    0
  );
  const mttrMinutes = Math.max(
    0,
    Math.round((resolvedAt.getTime() - ticket.createdAt.getTime() - pauseMs) / 60000)
  );
  const slaBreached =
    ticket.category.slaHours !== null && mttrMinutes > ticket.category.slaHours * 60;
  await db.customerTicket.update({
    where: { id: ticketId },
    data: { status: "SOLVED", resolution, resolvedAt, mttrMinutes, slaBreached },
  });
  await logAudit({
    userId: user.id,
    action: "CTICKET_SOLVE",
    module: "helpdesk",
    entityType: "CustomerTicket",
    entityId: ticketId,
    description: `Solve ${ticket.ticketNumber} — MTTR ${mttrMinutes} menit (bersih dari pause)${slaBreached ? " — SLA TERLEWATI" : ""}`,
  });
  return { ok: true, id: ticketId, data: { mttrMinutes, slaBreached } };
}

export async function closeCustomerTicket(user: CurrentUser, ticketId: string): Promise<Result> {
  const ticket = await db.customerTicket.findUnique({
    where: { id: ticketId },
    include: { children: true },
  });
  if (!ticket) return { ok: false, error: "Tiket tidak ditemukan." };
  if (ticket.status !== "SOLVED") {
    return { ok: false, error: "Tiket harus solved sebelum ditutup." };
  }
  const openChildren = ticket.children.filter((c) => c.status !== "CLOSED");
  if (openChildren.length > 0) {
    return { ok: false, error: `${openChildren.length} sub-tiket belum ditutup.` };
  }
  await db.customerTicket.update({
    where: { id: ticketId },
    data: { status: "CLOSED", closedAt: new Date() },
  });
  await logAudit({
    userId: user.id,
    action: "CTICKET_CLOSE",
    module: "helpdesk",
    entityType: "CustomerTicket",
    entityId: ticketId,
    description: `Menutup ${ticket.ticketNumber}`,
  });
  return { ok: true, id: ticketId };
}

export async function linkWorkOrder(
  user: CurrentUser,
  ticketId: string,
  workOrderId: string | null
): Promise<Result> {
  const ticket = await db.customerTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { ok: false, error: "Tiket tidak ditemukan." };
  if (workOrderId) {
    const wo = await db.workOrder.findUnique({ where: { id: workOrderId } });
    if (!wo) return { ok: false, error: "Work order tidak ditemukan." };
  }
  await db.customerTicket.update({ where: { id: ticketId }, data: { workOrderId } });
  await logAudit({
    userId: user.id,
    action: "CTICKET_LINK_WO",
    module: "helpdesk",
    entityType: "CustomerTicket",
    entityId: ticketId,
    description: `${workOrderId ? "Menautkan" : "Melepas"} work order pada ${ticket.ticketNumber}`,
  });
  return { ok: true, id: ticketId };
}
