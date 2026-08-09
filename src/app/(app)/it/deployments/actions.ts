"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import {
  createDeployment,
  submitDeployment,
  executeDeployment,
  finishDeployment,
  rollbackDeployment,
  cancelDeployment,
} from "@/lib/itops";

export async function createDeploymentAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.DEPLOYMENTS_CREATE);
  const ws = String(formData.get("windowStart") ?? "");
  const we = String(formData.get("windowEnd") ?? "");
  const result = await createDeployment(user, {
    applicationId: String(formData.get("applicationId") ?? ""),
    version: String(formData.get("version") ?? ""),
    environment: String(formData.get("environment") ?? ""),
    isMajor: formData.get("isMajor") === "on",
    changeRecord: String(formData.get("changeRecord") ?? "") || undefined,
    releaseNote: String(formData.get("releaseNote") ?? "") || undefined,
    commitRef: String(formData.get("commitRef") ?? "") || undefined,
    hasMigration: formData.get("hasMigration") === "on",
    migrationNote: String(formData.get("migrationNote") ?? "") || undefined,
    deploymentPlan: String(formData.get("deploymentPlan") ?? ""),
    testingResult: String(formData.get("testingResult") ?? "") || undefined,
    rollbackPlan: String(formData.get("rollbackPlan") ?? "") || undefined,
    backupId: String(formData.get("backupId") ?? "") || undefined,
    windowStart: ws ? new Date(ws) : null,
    windowEnd: we ? new Date(we) : null,
  });
  revalidatePath("/it/deployments");
  if (!result.ok) {
    redirect("/it/deployments/new?error=" + encodeURIComponent(result.error));
  }
  redirect(`/it/deployments/${result.id}?ok=` + encodeURIComponent("Deployment draft dibuat."));
}

function back(id: string, result: { ok: boolean; error?: string }, okMsg: string): never {
  redirect(
    `/it/deployments/${id}?` +
      (result.ok
        ? "ok=" + encodeURIComponent(okMsg)
        : "error=" + encodeURIComponent(result.error ?? "Gagal."))
  );
}

export async function submitDeploymentAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.DEPLOYMENTS_CREATE);
  const id = String(formData.get("deploymentId") ?? "");
  const result = await submitDeployment(user, id);
  revalidatePath("/it/deployments");
  back(id, result, "Deployment diajukan.");
}

export async function executeDeploymentAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.DEPLOYMENTS_EXECUTE);
  const id = String(formData.get("deploymentId") ?? "");
  const result = await executeDeployment(user, id);
  revalidatePath("/it/deployments");
  back(id, result, "Deployment dimulai.");
}

export async function finishDeploymentAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.DEPLOYMENTS_EXECUTE);
  const id = String(formData.get("deploymentId") ?? "");
  const result = await finishDeployment(
    user,
    id,
    String(formData.get("result") ?? ""),
    String(formData.get("outcome") ?? "success") === "success"
  );
  revalidatePath("/it/deployments");
  back(id, result, "Hasil deployment dicatat.");
}

export async function rollbackDeploymentAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.DEPLOYMENTS_EXECUTE);
  const id = String(formData.get("deploymentId") ?? "");
  const result = await rollbackDeployment(user, id, String(formData.get("note") ?? ""));
  revalidatePath("/it/deployments");
  back(id, result, "Rollback dicatat.");
}

export async function cancelDeploymentAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.DEPLOYMENTS_CREATE);
  const id = String(formData.get("deploymentId") ?? "");
  const result = await cancelDeployment(user, id, String(formData.get("reason") ?? ""));
  revalidatePath("/it/deployments");
  back(id, result, "Deployment dibatalkan.");
}
