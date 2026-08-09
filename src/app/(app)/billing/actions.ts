"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/constants";
import {
  attachAddon,
  detachAddon,
  saveBillingProfile,
  createInvoiceRun,
  generateInvoiceRun,
  postInvoiceRun,
  cancelInvoiceRun,
  createManualInvoice,
  voidInvoice,
} from "@/lib/billing";

function parseRupiah(v: FormDataEntryValue | null): bigint {
  return BigInt(String(v ?? "").replace(/[^0-9-]/g, "") || "0");
}

// ── Master addon service ────────────────────────────────────────

const addonSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(2).regex(/^[A-Za-z0-9_-]+$/, "Kode hanya huruf/angka/strip"),
  name: z.string().min(2, "Nama minimal 2 karakter"),
  monthlyPrice: z.string().min(1, "Harga wajib diisi"),
  description: z.string().optional(),
  isActive: z.string().optional(),
});

export async function saveAddonAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.BILLING_MANAGE);
  const parsed = addonSchema.safeParse({
    ...Object.fromEntries(formData),
    id: formData.get("id") || undefined,
  });
  if (!parsed.success) {
    redirect("/billing/addons?error=" + encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid"));
  }
  const d = parsed.data;
  const code = d.code.toUpperCase();
  const monthlyPrice = parseRupiah(d.monthlyPrice);
  if (monthlyPrice < 0n) {
    redirect("/billing/addons?error=" + encodeURIComponent("Harga tidak boleh negatif."));
  }
  const dup = await db.addonService.findFirst({
    where: { code, ...(d.id ? { id: { not: d.id } } : {}) },
  });
  if (dup) redirect("/billing/addons?error=" + encodeURIComponent(`Kode "${code}" sudah dipakai.`));

  const data = {
    code,
    name: d.name,
    monthlyPrice,
    description: d.description || null,
    isActive: d.isActive === "on",
  };
  const addon = d.id
    ? await db.addonService.update({ where: { id: d.id }, data })
    : await db.addonService.create({ data });
  await logAudit({
    userId: user.id,
    action: d.id ? "ADDON_UPDATE" : "ADDON_CREATE",
    module: "billing",
    entityType: "AddonService",
    entityId: addon.id,
    description: `${d.id ? "Mengubah" : "Membuat"} addon ${code} — ${d.name}`,
  });
  revalidatePath("/billing/addons");
  redirect("/billing/addons?ok=" + encodeURIComponent("Addon tersimpan."));
}

export async function attachAddonAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.BILLING_MANAGE);
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const override = String(formData.get("priceOverride") ?? "").trim();
  const result = await attachAddon(user, {
    subscriptionId,
    addonId: String(formData.get("addonId") ?? ""),
    priceOverride: override ? parseRupiah(override) : null,
  });
  revalidatePath("/billing/profiles");
  redirect(
    `/billing/profiles?edit=${subscriptionId}&` +
      (result.ok ? "ok=" + encodeURIComponent("Addon ditambahkan.") : "error=" + encodeURIComponent(result.error))
  );
}

export async function detachAddonAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.BILLING_MANAGE);
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const result = await detachAddon(user, String(formData.get("subscriptionAddonId") ?? ""));
  revalidatePath("/billing/profiles");
  redirect(
    `/billing/profiles?edit=${subscriptionId}&` +
      (result.ok ? "ok=" + encodeURIComponent("Addon dihentikan.") : "error=" + encodeURIComponent(result.error))
  );
}

export async function saveBillingProfileAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.BILLING_MANAGE);
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const start = String(formData.get("billingStartAt") ?? "");
  const isolir = String(formData.get("isolirDay") ?? "").trim();
  const result = await saveBillingProfile(user, {
    subscriptionId,
    billingStartAt: start ? new Date(start) : new Date(NaN),
    invoiceDay: Number(formData.get("invoiceDay") ?? 0),
    dueDays: Number(formData.get("dueDays") ?? 0),
    isolirDay: isolir ? Number(isolir) : null,
    taxPercent: Number(formData.get("taxPercent") ?? 0),
    isActive: formData.get("isActive") === "on",
  });
  revalidatePath("/billing/profiles");
  redirect(
    `/billing/profiles?edit=${subscriptionId}&` +
      (result.ok ? "ok=" + encodeURIComponent("Profil penagihan tersimpan.") : "error=" + encodeURIComponent(result.error))
  );
}

// ── Invoice run ─────────────────────────────────────────────────

export async function createInvoiceRunAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.INVOICES_CREATE);
  const result = await createInvoiceRun(user, String(formData.get("period") ?? ""));
  revalidatePath("/billing/runs");
  if (!result.ok) {
    redirect("/billing/runs?error=" + encodeURIComponent(result.error));
  }
  redirect(`/billing/runs/${result.id}?ok=` + encodeURIComponent("Run dibuat — generate preview untuk melihat tagihan."));
}

function backRun(id: string, result: { ok: boolean; error?: string }, okMsg: string): never {
  redirect(
    `/billing/runs/${id}?` +
      (result.ok ? "ok=" + encodeURIComponent(okMsg) : "error=" + encodeURIComponent(result.error ?? "Gagal."))
  );
}

export async function generateInvoiceRunAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.INVOICES_CREATE);
  const id = String(formData.get("runId") ?? "");
  const result = await generateInvoiceRun(user, id);
  revalidatePath("/billing/runs");
  backRun(
    id,
    result,
    result.ok
      ? `Preview siap: ${result.data?.created} invoice baru, ${result.data?.skipped} dilewati (idempoten).`
      : ""
  );
}

export async function postInvoiceRunAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.INVOICES_POST);
  const id = String(formData.get("runId") ?? "");
  const result = await postInvoiceRun(user, id);
  revalidatePath("/billing/runs");
  revalidatePath("/billing/invoices");
  backRun(id, result, "Run diposting — seluruh invoice terbit (Belum Dibayar).");
}

export async function cancelInvoiceRunAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.INVOICES_CREATE);
  const id = String(formData.get("runId") ?? "");
  const result = await cancelInvoiceRun(user, id, String(formData.get("reason") ?? ""));
  revalidatePath("/billing/runs");
  backRun(id, result, "Run dibatalkan.");
}

// ── Invoice ─────────────────────────────────────────────────────

export async function createManualInvoiceAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.INVOICES_CREATE);
  const due = String(formData.get("dueAt") ?? "");
  const lines: { kind: string; description: string; quantity: number; unitPrice: bigint }[] = [];
  for (let i = 0; i < 5; i++) {
    const desc = String(formData.get(`line${i}_description`) ?? "").trim();
    if (!desc) continue;
    lines.push({
      kind: String(formData.get(`line${i}_kind`) ?? "MANUAL"),
      description: desc,
      quantity: Number(formData.get(`line${i}_quantity`) ?? 1),
      unitPrice: parseRupiah(formData.get(`line${i}_unitPrice`)),
    });
  }
  const result = await createManualInvoice(user, {
    customerId: String(formData.get("customerId") ?? ""),
    subscriptionId: String(formData.get("subscriptionId") ?? "") || null,
    type: String(formData.get("type") ?? ""),
    taxPercent: Number(formData.get("taxPercent") ?? 0),
    dueAt: due ? new Date(due) : new Date(NaN),
    notes: String(formData.get("notes") ?? "") || undefined,
    lines,
  });
  revalidatePath("/billing/invoices");
  if (!result.ok) {
    redirect("/billing/invoices/new?error=" + encodeURIComponent(result.error));
  }
  redirect(`/billing/invoices/${result.id}?ok=` + encodeURIComponent("Invoice terbit."));
}

export async function voidInvoiceAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.INVOICES_POST);
  const id = String(formData.get("invoiceId") ?? "");
  const result = await voidInvoice(user, id, String(formData.get("reason") ?? ""));
  revalidatePath("/billing/invoices");
  redirect(
    `/billing/invoices/${id}?` +
      (result.ok ? "ok=" + encodeURIComponent("Invoice di-void.") : "error=" + encodeURIComponent(result.error))
  );
}
