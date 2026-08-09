"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import {
  createQuotation,
  updateQuotation,
  sendQuotation,
  decideQuotation,
  reviseQuotation,
  type QuotationInput,
} from "@/lib/crm";

const schema = z.object({
  leadId: z.string().min(1, "Pilih lead"),
  packageId: z.string().min(1, "Pilih paket"),
  monthlyPrice: z.string().optional(),
  installationFee: z.string().optional(),
  deviceFee: z.string().optional(),
  networkBuildFee: z.string().optional(),
  discount: z.string().optional(),
  taxPercent: z.coerce.number().min(0).max(100).default(11),
  contractMonths: z.coerce.number().int().min(1).default(12),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
});

function parseRp(v: string | undefined): bigint | undefined {
  if (!v?.trim()) return undefined;
  const digits = v.replace(/[^\d]/g, "");
  return digits ? BigInt(digits) : undefined;
}

function toInput(d: z.infer<typeof schema>): QuotationInput {
  return {
    packageId: d.packageId,
    monthlyPrice: parseRp(d.monthlyPrice),
    installationFee: parseRp(d.installationFee),
    deviceFee: parseRp(d.deviceFee) ?? BigInt(0),
    networkBuildFee: parseRp(d.networkBuildFee) ?? BigInt(0),
    discount: parseRp(d.discount) ?? BigInt(0),
    taxPercent: d.taxPercent,
    contractMonths: d.contractMonths,
    validUntil: d.validUntil ? new Date(d.validUntil) : null,
    notes: d.notes || undefined,
  };
}

export async function createQuotationAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.QUOTATIONS_CREATE);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(
      "/sales/quotations/new?error=" +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")
    );
  }
  const result = await createQuotation(user, parsed.data.leadId, toInput(parsed.data));
  if (!result.ok) {
    redirect("/sales/quotations/new?error=" + encodeURIComponent(result.error));
  }
  revalidatePath("/sales/quotations");
  redirect(
    `/sales/quotations/${result.id}?ok=` + encodeURIComponent("Quotation dibuat (Draft).")
  );
}

export async function updateQuotationAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.QUOTATIONS_CREATE);
  const quotationId = String(formData.get("quotationId") ?? "");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(
      `/sales/quotations/${quotationId}?error=` +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")
    );
  }
  const result = await updateQuotation(user, quotationId, toInput(parsed.data));
  redirect(
    `/sales/quotations/${quotationId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("Draft tersimpan.")
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function sendQuotationAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.QUOTATIONS_MANAGE);
  const quotationId = String(formData.get("quotationId") ?? "");
  const result = await sendQuotation(user, quotationId);
  revalidatePath("/sales/quotations");
  redirect(
    `/sales/quotations/${quotationId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent(result.data?.message ?? "Berhasil.")
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function decideQuotationAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.QUOTATIONS_MANAGE);
  const quotationId = String(formData.get("quotationId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (decision !== "ACCEPTED" && decision !== "REJECTED") {
    redirect(`/sales/quotations/${quotationId}?error=` + encodeURIComponent("Aksi tidak valid."));
  }
  const result = await decideQuotation(user, quotationId, decision as "ACCEPTED" | "REJECTED");
  revalidatePath("/sales/quotations");
  redirect(
    `/sales/quotations/${quotationId}?` +
      (result.ok
        ? "ok=" +
          encodeURIComponent(
            decision === "ACCEPTED"
              ? "Quotation diterima pelanggan. Lead siap dikonversi."
              : "Quotation ditandai ditolak."
          )
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function reviseQuotationAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.QUOTATIONS_MANAGE);
  const quotationId = String(formData.get("quotationId") ?? "");
  const result = await reviseQuotation(user, quotationId);
  revalidatePath("/sales/quotations");
  if (!result.ok) {
    redirect(`/sales/quotations/${quotationId}?error=` + encodeURIComponent(result.error));
  }
  redirect(
    `/sales/quotations/${result.id}?ok=` +
      encodeURIComponent("Versi baru dibuat (Draft). Versi lama ditandai Direvisi.")
  );
}
