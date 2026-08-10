"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import {
  saveDunningPolicy,
  evaluateDunning,
  suspendSubscription,
  restoreSubscription,
} from "@/lib/dunning";

function back(result: { ok: boolean; error?: string }, okMsg: string): never {
  redirect(
    "/billing/isolir?" +
      (result.ok ? "ok=" + encodeURIComponent(okMsg) : "error=" + encodeURIComponent(result.error ?? "Gagal."))
  );
}

export async function saveDunningPolicyAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.DUNNING_MANAGE);
  const days = String(formData.get("isolateAfterDays") ?? "").trim();
  const count = String(formData.get("maxUnpaidInvoices") ?? "").trim();
  const result = await saveDunningPolicy(user, {
    id: String(formData.get("id") ?? "") || undefined,
    name: String(formData.get("name") ?? ""),
    graceDays: Number(formData.get("graceDays") ?? 0),
    reminderOffsets: String(formData.get("reminderOffsets") ?? ""),
    isolateAfterDays: days ? Number(days) : null,
    maxUnpaidInvoices: count ? Number(count) : null,
    isActive: formData.get("isActive") === "on",
  });
  revalidatePath("/billing/isolir");
  back(result, "Kebijakan dunning tersimpan.");
}

export async function evaluateDunningAction(): Promise<void> {
  const user = await requirePermission(PERMISSIONS.DUNNING_MANAGE);
  const result = await evaluateDunning(user);
  revalidatePath("/billing/isolir");
  back(
    result,
    result.ok
      ? `Evaluasi selesai: ${result.data?.checked} langganan diperiksa, ${result.data?.suspended} diisolir.`
      : ""
  );
}

export async function suspendManualAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.DUNNING_MANAGE);
  const result = await suspendSubscription(user, {
    subscriptionId: String(formData.get("subscriptionId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    triggeredBy: "USER",
    note: String(formData.get("note") ?? "") || undefined,
  });
  revalidatePath("/billing/isolir");
  back(result, "Langganan diisolir — job blokir masuk antrian router.");
}

export async function restoreSuspensionAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.DUNNING_MANAGE);
  const result = await restoreSubscription(
    user,
    String(formData.get("suspensionId") ?? ""),
    String(formData.get("note") ?? "") || undefined
  );
  revalidatePath("/billing/isolir");
  back(result, "Langganan dipulihkan — job aktivasi masuk antrian router.");
}
