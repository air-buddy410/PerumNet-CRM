"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import {
  createMaintenance,
  submitMaintenance,
  startMaintenance,
  completeMaintenance,
  cancelMaintenance,
} from "@/lib/noc";

export async function createMaintenanceAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.MAINTENANCE_MANAGE);
  const start = String(formData.get("scheduledStart") ?? "");
  const end = String(formData.get("scheduledEnd") ?? "");
  if (!start || !end) {
    redirect("/noc/maintenance?error=" + encodeURIComponent("Jadwal mulai & selesai wajib diisi."));
  }
  const estRaw = String(formData.get("estDowntimeMin") ?? "");
  const result = await createMaintenance(user, {
    title: String(formData.get("title") ?? ""),
    type: String(formData.get("type") ?? "PREVENTIVE"),
    siteId: String(formData.get("siteId") ?? "") || undefined,
    deviceId: String(formData.get("deviceId") ?? "") || undefined,
    purpose: String(formData.get("purpose") ?? ""),
    risk: String(formData.get("risk") ?? ""),
    scheduledStart: new Date(start),
    scheduledEnd: new Date(end),
    estDowntimeMin: estRaw ? parseInt(estRaw, 10) : undefined,
    picId: String(formData.get("picId") ?? user.id),
  });
  revalidatePath("/noc/maintenance");
  if (!result.ok) {
    redirect("/noc/maintenance?error=" + encodeURIComponent(result.error));
  }
  redirect(`/noc/maintenance/${result.id}?ok=` + encodeURIComponent("Maintenance dibuat (draft)."));
}

function back(id: string, result: { ok: boolean; error?: string }, okMsg: string): never {
  redirect(
    `/noc/maintenance/${id}?` +
      (result.ok
        ? "ok=" + encodeURIComponent(okMsg)
        : "error=" + encodeURIComponent(result.error ?? "Gagal."))
  );
}

export async function submitMaintenanceAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.MAINTENANCE_MANAGE);
  const id = String(formData.get("maintId") ?? "");
  const result = await submitMaintenance(user, id);
  revalidatePath("/noc/maintenance");
  back(id, result, "Diajukan — menunggu approval NOC Manager.");
}

export async function startMaintenanceAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.MAINTENANCE_MANAGE);
  const id = String(formData.get("maintId") ?? "");
  const result = await startMaintenance(user, id);
  revalidatePath("/noc/maintenance");
  back(id, result, "Maintenance dimulai.");
}

export async function completeMaintenanceAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.MAINTENANCE_MANAGE);
  const id = String(formData.get("maintId") ?? "");
  const result = await completeMaintenance(user, id, String(formData.get("result") ?? ""));
  revalidatePath("/noc/maintenance");
  back(id, result, "Maintenance selesai — hasil terdokumentasi.");
}

export async function cancelMaintenanceAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.MAINTENANCE_MANAGE);
  const id = String(formData.get("maintId") ?? "");
  const result = await cancelMaintenance(user, id, String(formData.get("reason") ?? ""));
  revalidatePath("/noc/maintenance");
  back(id, result, "Maintenance dibatalkan.");
}
