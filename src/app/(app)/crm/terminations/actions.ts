"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import {
  createTermination,
  submitTermination,
  syncTerminationDecision,
  cancelTermination,
  makeTerminationEffective,
} from "@/lib/termination";

function back(id: string, result: { ok: true; id: string } | { ok: false; error: string }, okMsg: string): never {
  redirect(
    `/crm/terminations/${id}?` +
      (result.ok ? "ok=" + encodeURIComponent(okMsg) : "error=" + encodeURIComponent(result.error))
  );
}

export async function createTerminationAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.TERMINATION_CREATE);
  const result = await createTermination(user, {
    subscriptionId: String(formData.get("subscriptionId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    reasonCategory: String(formData.get("reasonCategory") ?? ""),
    effectiveDate: new Date(String(formData.get("effectiveDate") ?? "")),
    warehouseToId: String(formData.get("warehouseToId") ?? ""),
  });
  revalidatePath("/crm/terminations");
  if (!result.ok) {
    redirect("/crm/terminations/new?error=" + encodeURIComponent(result.error));
  }
  redirect(`/crm/terminations/${result.id}?ok=` + encodeURIComponent("Draft terminasi dibuat."));
}

export async function submitTerminationAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.TERMINATION_CREATE);
  const id = String(formData.get("id") ?? "");
  const result = await submitTermination(user, id);
  revalidatePath("/crm/terminations");
  back(id, result, "Terminasi diajukan — menunggu persetujuan Management.");
}

export async function syncDecisionAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.TERMINATION_VIEW);
  const id = String(formData.get("id") ?? "");
  const result = await syncTerminationDecision(user, id);
  revalidatePath("/crm/terminations");
  revalidatePath("/inventory/device-recoveries");
  back(id, result, "Keputusan approval diterapkan.");
}

export async function cancelTerminationAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.TERMINATION_CANCEL);
  const id = String(formData.get("id") ?? "");
  const result = await cancelTermination(user, id, String(formData.get("reason") ?? ""));
  revalidatePath("/crm/terminations");
  back(id, result, "Terminasi dibatalkan.");
}

export async function makeEffectiveAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.TERMINATION_APPROVE);
  const id = String(formData.get("id") ?? "");
  const result = await makeTerminationEffective(user, id);
  revalidatePath("/crm/terminations");
  revalidatePath("/crm/subscriptions");
  back(id, result, "Terminasi berlaku — langganan berstatus TERMINATED.");
}
