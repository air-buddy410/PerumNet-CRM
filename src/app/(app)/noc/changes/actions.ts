"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import {
  createChange,
  submitChange,
  implementChange,
  postReviewChange,
  cancelChange,
} from "@/lib/noc";

export async function createChangeAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CHANGES_CREATE);
  const windowStart = String(formData.get("windowStart") ?? "");
  const windowEnd = String(formData.get("windowEnd") ?? "");
  const result = await createChange(user, {
    title: String(formData.get("title") ?? ""),
    changeType: String(formData.get("changeType") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    impactedDevices: String(formData.get("impactedDevices") ?? "") || undefined,
    impactedServices: String(formData.get("impactedServices") ?? "") || undefined,
    risk: String(formData.get("risk") ?? ""),
    implementationPlan: String(formData.get("implementationPlan") ?? ""),
    testPlan: String(formData.get("testPlan") ?? "") || undefined,
    rollbackPlan: String(formData.get("rollbackPlan") ?? "") || undefined,
    windowStart: windowStart ? new Date(windowStart) : null,
    windowEnd: windowEnd ? new Date(windowEnd) : null,
    picId: String(formData.get("picId") ?? user.id),
  });
  revalidatePath("/noc/changes");
  if (!result.ok) {
    redirect("/noc/changes/new?error=" + encodeURIComponent(result.error));
  }
  redirect(`/noc/changes/${result.id}?ok=` + encodeURIComponent("Change request dibuat (draft)."));
}

function back(id: string, result: { ok: boolean; error?: string }, okMsg: string): never {
  redirect(
    `/noc/changes/${id}?` +
      (result.ok
        ? "ok=" + encodeURIComponent(okMsg)
        : "error=" + encodeURIComponent(result.error ?? "Gagal."))
  );
}

export async function submitChangeAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CHANGES_CREATE);
  const id = String(formData.get("changeId") ?? "");
  const result = await submitChange(user, id);
  revalidatePath("/noc/changes");
  back(id, result, "Diajukan — mengikuti approval matrix network change.");
}

export async function implementChangeAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CHANGES_IMPLEMENT);
  const id = String(formData.get("changeId") ?? "");
  const success = String(formData.get("outcome") ?? "") === "success";
  const result = await implementChange(user, id, String(formData.get("result") ?? ""), success);
  revalidatePath("/noc/changes");
  back(id, result, success ? "Change dieksekusi — hasil tercatat." : "Kegagalan tercatat — rollback dijalankan.");
}

export async function postReviewChangeAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CHANGES_REVIEW);
  const id = String(formData.get("changeId") ?? "");
  const finalSuccess = String(formData.get("finalOutcome") ?? "") === "success";
  const result = await postReviewChange(user, id, String(formData.get("note") ?? ""), finalSuccess);
  revalidatePath("/noc/changes");
  back(id, result, "Post-review tercatat.");
}

export async function cancelChangeAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CHANGES_CREATE);
  const id = String(formData.get("changeId") ?? "");
  const result = await cancelChange(user, id, String(formData.get("reason") ?? ""));
  revalidatePath("/noc/changes");
  back(id, result, "Change dibatalkan.");
}
