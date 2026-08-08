"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/constants";
import { createSubscription, changeSubscriptionStatus } from "@/lib/crm";

const createSchema = z.object({
  customerId: z.string().min(1, "Pilih customer"),
  packageId: z.string().min(1, "Pilih paket"),
  monthlyPrice: z.string().optional(),
  contractMonths: z.coerce.number().int().min(1).optional(),
  popNode: z.string().optional(),
  vlan: z.string().optional(),
  pppoeUsername: z.string().optional(),
  ipAddress: z.string().optional(),
  notes: z.string().optional(),
});

function parseRp(v: string | undefined): bigint | undefined {
  if (!v?.trim()) return undefined;
  const digits = v.replace(/[^\d]/g, "");
  return digits ? BigInt(digits) : undefined;
}

export async function createSubscriptionAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.SUBSCRIPTIONS_CREATE);
  const raw = Object.fromEntries(formData);
  const parsed = createSchema.safeParse({
    ...raw,
    contractMonths: raw.contractMonths || undefined,
  });
  if (!parsed.success) {
    redirect(
      "/crm/subscriptions/new?error=" +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")
    );
  }
  const d = parsed.data;
  const result = await createSubscription(user, d.customerId, {
    packageId: d.packageId,
    monthlyPrice: parseRp(d.monthlyPrice),
    contractMonths: d.contractMonths,
    popNode: d.popNode || undefined,
    vlan: d.vlan || undefined,
    pppoeUsername: d.pppoeUsername || undefined,
    ipAddress: d.ipAddress || undefined,
    notes: d.notes || undefined,
  });
  if (!result.ok) {
    redirect("/crm/subscriptions/new?error=" + encodeURIComponent(result.error));
  }
  revalidatePath("/crm/subscriptions");
  redirect(
    `/crm/subscriptions/${result.id}?ok=` + encodeURIComponent("Subscription dibuat (Draft).")
  );
}

const techSchema = z.object({
  subscriptionId: z.string().min(1),
  popNode: z.string().optional(),
  vlan: z.string().optional(),
  pppoeUsername: z.string().optional(),
  ipAddress: z.string().optional(),
  billingCycleDay: z.coerce.number().int().min(1).max(28).default(1),
  notes: z.string().optional(),
});

export async function updateSubscriptionTechAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.SUBSCRIPTIONS_EDIT);
  const parsed = techSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(
      `/crm/subscriptions/${formData.get("subscriptionId")}?error=` +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")
    );
  }
  const { subscriptionId, ...d } = parsed.data;
  const before = await db.subscription.findUnique({ where: { id: subscriptionId } });
  if (!before) {
    redirect("/crm/subscriptions?error=" + encodeURIComponent("Subscription tidak ditemukan."));
  }
  if (d.pppoeUsername) {
    const dup = await db.subscription.findFirst({
      where: { pppoeUsername: d.pppoeUsername, id: { not: subscriptionId } },
    });
    if (dup) {
      redirect(
        `/crm/subscriptions/${subscriptionId}?error=` +
          encodeURIComponent(`PPPoE username "${d.pppoeUsername}" sudah dipakai ${dup.serviceNumber}.`)
      );
    }
  }
  await db.subscription.update({
    where: { id: subscriptionId },
    data: {
      popNode: d.popNode || null,
      vlan: d.vlan || null,
      pppoeUsername: d.pppoeUsername || null,
      ipAddress: d.ipAddress || null,
      billingCycleDay: d.billingCycleDay,
      notes: d.notes || null,
    },
  });
  await logAudit({
    userId: user.id,
    action: "SUBSCRIPTION_UPDATE",
    module: "subscriptions",
    entityType: "Subscription",
    entityId: subscriptionId,
    description: `Mengubah data teknis subscription ${before.serviceNumber}`,
  });
  redirect(
    `/crm/subscriptions/${subscriptionId}?ok=` + encodeURIComponent("Data teknis tersimpan.")
  );
}

export async function changeSubscriptionStatusAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.SUBSCRIPTIONS_EDIT);
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const status = String(formData.get("status") ?? "");
  const result = await changeSubscriptionStatus(user, subscriptionId, status);
  revalidatePath("/crm/subscriptions");
  redirect(
    `/crm/subscriptions/${subscriptionId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("Status subscription diperbarui.")
        : "error=" + encodeURIComponent(result.error))
  );
}
