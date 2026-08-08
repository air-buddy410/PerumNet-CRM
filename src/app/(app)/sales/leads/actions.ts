"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import {
  createLead,
  assignLead,
  changeLeadStatus,
  logLeadActivity,
  ensureOpportunity,
  convertLead,
} from "@/lib/crm";

const createSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter"),
  phone: z.string().min(5, "Telepon wajib diisi"),
  company: z.string().optional(),
  email: z.string().email("Email tidak valid").optional().or(z.literal("")),
  address: z.string().optional(),
  customerType: z.string().min(1),
  source: z.string().min(1),
  campaignId: z.string().optional(),
  interestPackageId: z.string().optional(),
  estBandwidthMbps: z.coerce.number().int().positive().optional(),
  salesOwnerId: z.string().optional(),
  notes: z.string().optional(),
});

export async function createLeadAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.LEADS_CREATE);
  const raw = Object.fromEntries(formData);
  const parsed = createSchema.safeParse({
    ...raw,
    estBandwidthMbps: raw.estBandwidthMbps || undefined,
  });
  if (!parsed.success) {
    redirect(
      "/sales/leads/new?error=" +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")
    );
  }
  const d = parsed.data;
  const result = await createLead(user, {
    name: d.name,
    phone: d.phone,
    company: d.company || undefined,
    email: d.email || undefined,
    address: d.address || undefined,
    customerType: d.customerType,
    source: d.source,
    campaignId: d.campaignId || undefined,
    interestPackageId: d.interestPackageId || undefined,
    estBandwidthMbps: d.estBandwidthMbps,
    salesOwnerId: d.salesOwnerId || undefined,
    notes: d.notes || undefined,
  });
  if (!result.ok) {
    redirect("/sales/leads/new?error=" + encodeURIComponent(result.error));
  }
  revalidatePath("/sales/leads");
  redirect(`/sales/leads/${result.id}?ok=` + encodeURIComponent("Lead dibuat."));
}

export async function assignLeadAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.LEADS_ASSIGN);
  const leadId = String(formData.get("leadId") ?? "");
  const ownerId = String(formData.get("salesOwnerId") ?? "");
  if (!ownerId) {
    redirect(`/sales/leads/${leadId}?error=` + encodeURIComponent("Pilih Sales owner."));
  }
  const result = await assignLead(user, leadId, ownerId);
  revalidatePath("/sales/leads");
  redirect(
    `/sales/leads/${leadId}?` +
      (result.ok ? "ok=" + encodeURIComponent("Sales owner tersimpan.") : "error=" + encodeURIComponent(result.error))
  );
}

export async function changeLeadStatusAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.LEADS_EDIT);
  const leadId = String(formData.get("leadId") ?? "");
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "") || undefined;
  const result = await changeLeadStatus(user, leadId, status, reason);
  revalidatePath("/sales/leads");
  redirect(
    `/sales/leads/${leadId}?` +
      (result.ok ? "ok=" + encodeURIComponent("Status diperbarui.") : "error=" + encodeURIComponent(result.error))
  );
}

export async function logActivityAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.LEADS_EDIT);
  const leadId = String(formData.get("leadId") ?? "");
  const type = String(formData.get("type") ?? "");
  const note = String(formData.get("note") ?? "");
  const nextFollowUp = String(formData.get("nextFollowUpAt") ?? "");
  if (!note.trim()) {
    redirect(`/sales/leads/${leadId}?error=` + encodeURIComponent("Catatan aktivitas wajib diisi."));
  }
  const result = await logLeadActivity(user, leadId, {
    type,
    note,
    nextFollowUpAt: nextFollowUp ? new Date(nextFollowUp) : null,
  });
  redirect(
    `/sales/leads/${leadId}?` +
      (result.ok ? "ok=" + encodeURIComponent("Aktivitas tercatat.") : "error=" + encodeURIComponent(result.error))
  );
}

export async function createOpportunityAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.OPPORTUNITIES_MANAGE);
  const leadId = String(formData.get("leadId") ?? "");
  const result = await ensureOpportunity(user, leadId);
  redirect(
    `/sales/leads/${leadId}?` +
      (result.ok ? "ok=" + encodeURIComponent("Opportunity dibuat.") : "error=" + encodeURIComponent(result.error))
  );
}

export async function convertLeadAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CUSTOMERS_CREATE);
  const leadId = String(formData.get("leadId") ?? "");
  const result = await convertLead(user, leadId);
  revalidatePath("/sales/leads");
  redirect(
    `/sales/leads/${leadId}?` +
      (result.ok
        ? "ok=" +
          encodeURIComponent(
            "Lead terkonversi menjadi customer + subscription draft. Halaman customer menyusul di iterasi berikutnya."
          )
        : "error=" + encodeURIComponent(result.error))
  );
}
