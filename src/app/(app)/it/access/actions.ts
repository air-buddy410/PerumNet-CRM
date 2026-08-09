"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import {
  createAccessRequest,
  submitAccessRequest,
  grantAccess,
  revokeAccess,
  offboardUser,
} from "@/lib/itops";

export async function createAccessRequestAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.ACCESS_REQUEST);
  const expiry = String(formData.get("expiryDate") ?? "");
  const result = await createAccessRequest(user, {
    targetUserId: String(formData.get("targetUserId") ?? ""),
    accessType: String(formData.get("accessType") ?? ""),
    systemName: String(formData.get("systemName") ?? ""),
    roleRequested: String(formData.get("roleRequested") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    isProduction: formData.get("isProduction") === "on",
    isTemporary: formData.get("isTemporary") === "on",
    expiryDate: expiry ? new Date(expiry) : null,
  });
  revalidatePath("/it/access");
  if (!result.ok) {
    redirect("/it/access/new?error=" + encodeURIComponent(result.error));
  }
  redirect(`/it/access/${result.id}?ok=` + encodeURIComponent("Permintaan akses dibuat."));
}

function back(id: string, result: { ok: boolean; error?: string }, okMsg: string): never {
  redirect(
    `/it/access/${id}?` +
      (result.ok
        ? "ok=" + encodeURIComponent(okMsg)
        : "error=" + encodeURIComponent(result.error ?? "Gagal."))
  );
}

export async function submitAccessRequestAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.ACCESS_REQUEST);
  const id = String(formData.get("requestId") ?? "");
  const result = await submitAccessRequest(user, id);
  revalidatePath("/it/access");
  back(id, result, "Diajukan untuk approval.");
}

export async function grantAccessAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.ACCESS_MANAGE);
  const id = String(formData.get("requestId") ?? "");
  const result = await grantAccess(user, id);
  revalidatePath("/it/access");
  back(id, result, "Akses diberikan.");
}

export async function revokeAccessAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.ACCESS_MANAGE);
  const id = String(formData.get("requestId") ?? "");
  const result = await revokeAccess(user, id, String(formData.get("reason") ?? ""));
  revalidatePath("/it/access");
  back(id, result, "Akses dicabut.");
}

export async function offboardUserAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.ACCESS_MANAGE);
  const targetUserId = String(formData.get("targetUserId") ?? "");
  const result = await offboardUser(user, targetUserId, String(formData.get("reason") ?? ""));
  revalidatePath("/it/access");
  redirect(
    "/it/access?" +
      (result.ok
        ? "ok=" + encodeURIComponent(`Offboarding selesai: ${result.data?.revoked ?? 0} akses dicabut.`)
        : "error=" + encodeURIComponent(result.error ?? "Gagal."))
  );
}
