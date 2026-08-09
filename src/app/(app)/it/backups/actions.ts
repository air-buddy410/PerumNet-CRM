"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { createBackupRecord, verifyBackup, recordRestoreTest } from "@/lib/itops";

export async function createBackupAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.BACKUPS_MANAGE);
  const executedAt = String(formData.get("executedAt") ?? "");
  const result = await createBackupRecord(user, {
    serverId: String(formData.get("serverId") ?? "") || undefined,
    applicationId: String(formData.get("applicationId") ?? "") || undefined,
    backupType: String(formData.get("backupType") ?? ""),
    schedule: String(formData.get("schedule") ?? "") || undefined,
    location: String(formData.get("location") ?? ""),
    retention: String(formData.get("retention") ?? ""),
    isEncrypted: formData.get("isEncrypted") === "on",
    isCritical: formData.get("isCritical") === "on",
    status: String(formData.get("status") ?? ""),
    failureNote: String(formData.get("failureNote") ?? "") || undefined,
    executedAt: executedAt ? new Date(executedAt) : new Date(),
  });
  revalidatePath("/it/backups");
  redirect(
    "/it/backups?" +
      (result.ok
        ? "ok=" + encodeURIComponent("Backup dicatat.")
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function verifyBackupAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.BACKUPS_MANAGE);
  const id = String(formData.get("backupId") ?? "");
  const result = await verifyBackup(user, id, String(formData.get("result") ?? ""));
  revalidatePath("/it/backups");
  redirect(
    `/it/backups/${id}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("Backup terverifikasi.")
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function restoreTestAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.BACKUPS_MANAGE);
  const id = String(formData.get("backupId") ?? "");
  const result = await recordRestoreTest(user, id, String(formData.get("result") ?? ""));
  revalidatePath("/it/backups");
  redirect(
    `/it/backups/${id}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("Restore test dicatat.")
        : "error=" + encodeURIComponent(result.error))
  );
}
