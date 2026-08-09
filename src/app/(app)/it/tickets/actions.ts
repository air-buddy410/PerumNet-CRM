"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import {
  createTicket,
  assignTicket,
  setTicketStatus,
  resolveTicket,
  closeTicket,
} from "@/lib/itops";

export async function createTicketAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.IT_TICKETS_CREATE);
  const result = await createTicket(user, {
    title: String(formData.get("title") ?? ""),
    type: String(formData.get("type") ?? ""),
    priority: String(formData.get("priority") ?? "MEDIUM"),
    description: String(formData.get("description") ?? ""),
  });
  revalidatePath("/it/tickets");
  if (!result.ok) {
    redirect("/it/tickets/new?error=" + encodeURIComponent(result.error));
  }
  redirect(`/it/tickets/${result.id}?ok=` + encodeURIComponent("Tiket dibuat."));
}

function back(id: string, result: { ok: boolean; error?: string }, okMsg: string): never {
  redirect(
    `/it/tickets/${id}?` +
      (result.ok
        ? "ok=" + encodeURIComponent(okMsg)
        : "error=" + encodeURIComponent(result.error ?? "Gagal."))
  );
}

export async function assignTicketAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.IT_TICKETS_MANAGE);
  const id = String(formData.get("ticketId") ?? "");
  const result = await assignTicket(user, id, String(formData.get("assigneeId") ?? ""));
  revalidatePath("/it/tickets");
  back(id, result, "Tiket di-assign.");
}

export async function setTicketStatusAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.IT_TICKETS_MANAGE);
  const id = String(formData.get("ticketId") ?? "");
  const result = await setTicketStatus(
    user,
    id,
    String(formData.get("status") ?? "") as "IN_PROGRESS" | "WAITING_USER" | "WAITING_VENDOR"
  );
  revalidatePath("/it/tickets");
  back(id, result, "Status tiket diperbarui.");
}

export async function resolveTicketAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.IT_TICKETS_MANAGE);
  const id = String(formData.get("ticketId") ?? "");
  const result = await resolveTicket(user, id, String(formData.get("resolution") ?? ""));
  revalidatePath("/it/tickets");
  back(id, result, "Tiket resolved.");
}

export async function closeTicketAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.IT_TICKETS_MANAGE);
  const id = String(formData.get("ticketId") ?? "");
  const result = await closeTicket(user, id);
  revalidatePath("/it/tickets");
  back(id, result, "Tiket ditutup.");
}
