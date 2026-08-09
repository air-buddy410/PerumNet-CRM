"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import {
  createSurvey,
  scheduleSurvey,
  completeSurvey,
  cancelSurvey,
} from "@/lib/crm";
import { saveAttachment } from "@/lib/files";

const createSchema = z.object({
  leadId: z.string().min(1, "Pilih lead"),
  address: z.string().min(5, "Alamat wajib diisi"),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  packageId: z.string().optional(),
  bandwidthMbps: z.coerce.number().int().positive().optional(),
});

export async function createSurveyAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.SURVEYS_CREATE);
  const raw = Object.fromEntries(formData);
  const parsed = createSchema.safeParse({
    ...raw,
    bandwidthMbps: raw.bandwidthMbps || undefined,
  });
  if (!parsed.success) {
    redirect(
      "/sales/surveys/new?error=" +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")
    );
  }
  const d = parsed.data;
  const result = await createSurvey(user, {
    leadId: d.leadId,
    address: d.address,
    contactName: d.contactName || undefined,
    contactPhone: d.contactPhone || undefined,
    packageId: d.packageId || undefined,
    bandwidthMbps: d.bandwidthMbps,
  });
  if (!result.ok) {
    redirect("/sales/surveys/new?error=" + encodeURIComponent(result.error));
  }
  revalidatePath("/sales/surveys");
  redirect(`/sales/surveys/${result.id}?ok=` + encodeURIComponent("Survey diajukan."));
}

export async function scheduleSurveyAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.SURVEYS_MANAGE);
  const surveyId = String(formData.get("surveyId") ?? "");
  const scheduledAt = String(formData.get("scheduledAt") ?? "");
  const technicianId = String(formData.get("technicianId") ?? "");
  if (!scheduledAt || !technicianId) {
    redirect(
      `/sales/surveys/${surveyId}?error=` +
        encodeURIComponent("Jadwal dan teknisi wajib diisi.")
    );
  }
  const result = await scheduleSurvey(user, surveyId, new Date(scheduledAt), technicianId);
  revalidatePath("/sales/surveys");
  redirect(
    `/sales/surveys/${surveyId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("Survey dijadwalkan.")
        : "error=" + encodeURIComponent(result.error))
  );
}

const completeSchema = z.object({
  surveyId: z.string().min(1),
  nearestNode: z.string().optional(),
  estCableMeters: z.coerce.number().int().nonnegative().optional(),
  estMaterials: z.string().optional(),
  estCost: z.string().optional(),
  signalLevel: z.string().optional(),
  opticalPower: z.string().optional(),
  feasibility: z.enum(["FEASIBLE", "FEASIBLE_WITH_COST", "NOT_FEASIBLE"], {
    message: "Pilih hasil feasibility",
  }),
  resultNotes: z.string().optional(),
});

export async function completeSurveyAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.SURVEYS_EXECUTE);
  const raw = Object.fromEntries(formData);
  const parsed = completeSchema.safeParse({
    ...raw,
    estCableMeters: raw.estCableMeters || undefined,
  });
  if (!parsed.success) {
    redirect(
      `/sales/surveys/${raw.surveyId}?error=` +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")
    );
  }
  const d = parsed.data;
  let estCost: bigint | undefined;
  if (d.estCost) {
    const digits = d.estCost.replace(/[^\d]/g, "");
    if (digits) estCost = BigInt(digits);
  }
  const result = await completeSurvey(user, d.surveyId, {
    nearestNode: d.nearestNode || undefined,
    estCableMeters: d.estCableMeters,
    estMaterials: d.estMaterials || undefined,
    estCost,
    signalLevel: d.signalLevel || undefined,
    opticalPower: d.opticalPower || undefined,
    feasibility: d.feasibility,
    resultNotes: d.resultNotes || undefined,
  });
  revalidatePath("/sales/surveys");
  redirect(
    `/sales/surveys/${d.surveyId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("Hasil survey tersimpan.")
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function cancelSurveyAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.SURVEYS_MANAGE);
  const surveyId = String(formData.get("surveyId") ?? "");
  const reason = String(formData.get("reason") ?? "") || undefined;
  const result = await cancelSurvey(user, surveyId, reason);
  revalidatePath("/sales/surveys");
  redirect(
    `/sales/surveys/${surveyId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("Survey dibatalkan.")
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function uploadSurveyPhotoAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.SURVEYS_EXECUTE);
  const surveyId = String(formData.get("surveyId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(
      `/sales/surveys/${surveyId}?error=` + encodeURIComponent("Pilih file terlebih dahulu.")
    );
  }
  const result = await saveAttachment(file, "Survey", surveyId, user.id);
  redirect(
    `/sales/surveys/${surveyId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("Foto/bukti terunggah.")
        : "error=" + encodeURIComponent(result.error))
  );
}
