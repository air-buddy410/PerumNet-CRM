"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { createProject, saveBomLine, closeProject, cancelProject } from "@/lib/project";
import { saveAttachment } from "@/lib/files";

const createSchema = z.object({
  name: z.string().min(3, "Nama proyek minimal 3 karakter"),
  customerId: z.string().optional(),
  areaId: z.string().optional(),
  managerId: z.string().min(1, "Pilih project manager"),
  budget: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().optional(),
});

function parseRp(v: string | undefined): bigint {
  const digits = String(v ?? "").replace(/[^\d]/g, "");
  return digits ? BigInt(digits) : BigInt(0);
}

export async function createProjectAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.PROJECTS_MANAGE);
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(
      "/projects/new?error=" +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")
    );
  }
  const d = parsed.data;
  const result = await createProject(user, {
    name: d.name,
    customerId: d.customerId || undefined,
    areaId: d.areaId || undefined,
    managerId: d.managerId,
    budget: parseRp(d.budget),
    startDate: d.startDate ? new Date(d.startDate) : null,
    endDate: d.endDate ? new Date(d.endDate) : null,
    notes: d.notes || undefined,
  });
  if (!result.ok) {
    redirect("/projects/new?error=" + encodeURIComponent(result.error));
  }
  revalidatePath("/projects");
  redirect(`/projects/${result.id}?ok=` + encodeURIComponent("Proyek dibuat."));
}

function back(projectId: string, result: { ok: boolean; error?: string }, okMsg: string): never {
  redirect(
    `/projects/${projectId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent(okMsg)
        : "error=" + encodeURIComponent(result.error ?? "Gagal."))
  );
}

export async function saveBomLineAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.PROJECTS_MANAGE);
  const projectId = String(formData.get("projectId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const plannedQty = parseInt(String(formData.get("plannedQty") ?? "0"), 10);
  if (!itemId || Number.isNaN(plannedQty)) {
    back(projectId, { ok: false, error: "Pilih item dan isi qty rencana." }, "");
  }
  const result = await saveBomLine(user, projectId, itemId, plannedQty);
  back(projectId, result, "BoM diperbarui.");
}

export async function closeProjectAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.PROJECTS_CLOSE);
  const projectId = String(formData.get("projectId") ?? "");
  const result = await closeProject(user, projectId);
  revalidatePath("/projects");
  back(projectId, result, "Proyek ditutup — rekonsiliasi lengkap.");
}

export async function cancelProjectAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.PROJECTS_MANAGE);
  const projectId = String(formData.get("projectId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const result = await cancelProject(user, projectId, reason);
  revalidatePath("/projects");
  back(projectId, result, "Proyek dibatalkan.");
}

export async function uploadProjectDocAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.PROJECTS_MANAGE);
  const projectId = String(formData.get("projectId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    back(projectId, { ok: false, error: "Pilih file dokumentasi terlebih dahulu." }, "");
  }
  const result = await saveAttachment(file as File, "Project", projectId, user.id);
  back(
    projectId,
    result.ok ? { ok: true } : { ok: false, error: result.ok === false ? result.error : "" },
    "Dokumentasi terunggah."
  );
}
