"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import {
  saveTicketCategory,
  saveWorkflowTemplate,
  addWorkflowStep,
  createCustomerTicket,
  assignCustomerTicket,
  addTicketMember,
  removeTicketMember,
  startCustomerTicket,
  pauseCustomerTicket,
  resumeCustomerTicket,
  startWorkflow,
  completeStep,
  solveCustomerTicket,
  closeCustomerTicket,
  linkWorkOrder,
} from "@/lib/helpdesk";

// ── Master kategori & workflow ──────────────────────────────────

export async function saveTicketCategoryAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CTICKETS_MANAGE);
  const sla = String(formData.get("slaHours") ?? "").trim();
  const result = await saveTicketCategory(user, {
    id: String(formData.get("id") ?? "") || undefined,
    name: String(formData.get("name") ?? ""),
    slaHours: sla ? Number(sla) : null,
    workflowId: String(formData.get("workflowId") ?? "") || null,
    isActive: formData.get("isActive") === "on",
  });
  revalidatePath("/helpdesk/categories");
  redirect(
    "/helpdesk/categories?" +
      (result.ok ? "ok=" + encodeURIComponent("Kategori tersimpan.") : "error=" + encodeURIComponent(result.error))
  );
}

export async function saveWorkflowTemplateAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CTICKETS_MANAGE);
  const result = await saveWorkflowTemplate(user, String(formData.get("name") ?? ""));
  revalidatePath("/helpdesk/categories");
  redirect(
    "/helpdesk/categories?" +
      (result.ok ? "ok=" + encodeURIComponent("Workflow dibuat — tambahkan step-nya.") : "error=" + encodeURIComponent(result.error))
  );
}

export async function addWorkflowStepAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CTICKETS_MANAGE);
  const result = await addWorkflowStep(user, {
    templateId: String(formData.get("templateId") ?? ""),
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? "") || undefined,
    isRequired: formData.get("isRequired") === "on",
  });
  revalidatePath("/helpdesk/categories");
  redirect(
    "/helpdesk/categories?" +
      (result.ok ? "ok=" + encodeURIComponent("Step ditambahkan.") : "error=" + encodeURIComponent(result.error))
  );
}

// ── Tiket ───────────────────────────────────────────────────────

export async function createCustomerTicketAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CTICKETS_CREATE);
  const scheduled = String(formData.get("scheduledAt") ?? "");
  const result = await createCustomerTicket(user, {
    customerId: String(formData.get("customerId") ?? ""),
    subscriptionId: String(formData.get("subscriptionId") ?? "") || null,
    categoryId: String(formData.get("categoryId") ?? ""),
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? "") || undefined,
    priority: String(formData.get("priority") ?? "NORMAL"),
    tags: String(formData.get("tags") ?? "") || undefined,
    assigneeId: String(formData.get("assigneeId") ?? "") || null,
    parentId: String(formData.get("parentId") ?? "") || null,
    scheduledAt: scheduled ? new Date(scheduled) : null,
  });
  revalidatePath("/helpdesk/tickets");
  if (!result.ok) {
    redirect("/helpdesk/tickets/new?error=" + encodeURIComponent(result.error));
  }
  redirect(`/helpdesk/tickets/${result.id}?ok=` + encodeURIComponent("Tiket dibuat."));
}

function back(id: string, result: { ok: boolean; error?: string }, okMsg: string): never {
  redirect(
    `/helpdesk/tickets/${id}?` +
      (result.ok ? "ok=" + encodeURIComponent(okMsg) : "error=" + encodeURIComponent(result.error ?? "Gagal."))
  );
}

export async function assignCustomerTicketAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CTICKETS_MANAGE);
  const id = String(formData.get("ticketId") ?? "");
  const result = await assignCustomerTicket(user, id, String(formData.get("assigneeId") ?? ""));
  revalidatePath("/helpdesk/tickets");
  back(id, result, "Tiket di-assign.");
}

export async function addTicketMemberAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CTICKETS_MANAGE);
  const id = String(formData.get("ticketId") ?? "");
  const result = await addTicketMember(user, id, String(formData.get("userId") ?? ""));
  revalidatePath("/helpdesk/tickets");
  back(id, result, "Member ditambahkan.");
}

export async function removeTicketMemberAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CTICKETS_MANAGE);
  const id = String(formData.get("ticketId") ?? "");
  const result = await removeTicketMember(user, id, String(formData.get("userId") ?? ""));
  revalidatePath("/helpdesk/tickets");
  back(id, result, "Member dilepas.");
}

export async function startCustomerTicketAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CTICKETS_VIEW);
  const id = String(formData.get("ticketId") ?? "");
  const result = await startCustomerTicket(user, id);
  revalidatePath("/helpdesk/tickets");
  back(id, result, "Tiket mulai dikerjakan.");
}

export async function pauseCustomerTicketAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CTICKETS_VIEW);
  const id = String(formData.get("ticketId") ?? "");
  const result = await pauseCustomerTicket(user, id, String(formData.get("reason") ?? ""));
  revalidatePath("/helpdesk/tickets");
  back(id, result, "Tiket dihentikan sementara — MTTR berhenti dihitung.");
}

export async function resumeCustomerTicketAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CTICKETS_VIEW);
  const id = String(formData.get("ticketId") ?? "");
  const result = await resumeCustomerTicket(user, id);
  revalidatePath("/helpdesk/tickets");
  back(id, result, "Tiket dilanjutkan.");
}

export async function startWorkflowAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CTICKETS_VIEW);
  const id = String(formData.get("ticketId") ?? "");
  const result = await startWorkflow(user, id);
  revalidatePath("/helpdesk/tickets");
  back(id, result, "Workflow dimulai.");
}

export async function completeStepAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CTICKETS_VIEW);
  const ticketId = String(formData.get("ticketId") ?? "");
  const result = await completeStep(
    user,
    String(formData.get("progressId") ?? ""),
    String(formData.get("note") ?? "") || undefined
  );
  revalidatePath("/helpdesk/tickets");
  back(ticketId, result, "Step selesai.");
}

export async function solveCustomerTicketAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CTICKETS_VIEW);
  const id = String(formData.get("ticketId") ?? "");
  const result = await solveCustomerTicket(user, id, String(formData.get("resolution") ?? ""));
  revalidatePath("/helpdesk/tickets");
  back(
    id,
    result,
    result.ok
      ? `Tiket solved — MTTR ${result.data?.mttrMinutes} menit${result.data?.slaBreached ? " (SLA terlewati)" : ""}.`
      : ""
  );
}

export async function closeCustomerTicketAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CTICKETS_MANAGE);
  const id = String(formData.get("ticketId") ?? "");
  const result = await closeCustomerTicket(user, id);
  revalidatePath("/helpdesk/tickets");
  back(id, result, "Tiket ditutup.");
}

export async function linkWorkOrderAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CTICKETS_MANAGE);
  const id = String(formData.get("ticketId") ?? "");
  const result = await linkWorkOrder(user, id, String(formData.get("workOrderId") ?? "") || null);
  revalidatePath("/helpdesk/tickets");
  back(id, result, "Tautan work order diperbarui.");
}
