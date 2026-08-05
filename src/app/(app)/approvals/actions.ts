"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import {
  submitApprovalRequest,
  actOnApproval,
  cancelApproval,
} from "@/lib/approval";

const submitSchema = z.object({
  module: z.string().min(1),
  subtype: z.string().optional(),
  title: z.string().min(3, "Judul minimal 3 karakter"),
  description: z.string().optional(),
  amount: z.string().optional(),
});

export async function submitRequestAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.APPROVALS_CREATE);

  const parsed = submitSchema.safeParse({
    module: formData.get("module"),
    subtype: formData.get("subtype") || undefined,
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    amount: formData.get("amount") || undefined,
  });
  if (!parsed.success) {
    redirect(
      "/approvals/new?error=" +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")
    );
  }

  let amount: bigint | null = null;
  if (parsed.data.amount) {
    const digits = parsed.data.amount.replace(/[^\d]/g, "");
    if (digits) amount = BigInt(digits);
  }

  const result = await submitApprovalRequest({
    user,
    module: parsed.data.module,
    subtype: parsed.data.subtype ?? null,
    title: parsed.data.title,
    description: parsed.data.description,
    amount,
  });

  if (!result.ok) {
    redirect("/approvals/new?error=" + encodeURIComponent(result.error));
  }
  redirect(`/approvals/${result.id}?ok=` + encodeURIComponent("Pengajuan berhasil dibuat."));
}

export async function actOnApprovalAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.APPROVALS_ACT);
  const requestId = String(formData.get("requestId") ?? "");
  const action = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "") || undefined;

  if (action !== "APPROVE" && action !== "REJECT") {
    redirect(`/approvals/${requestId}?error=` + encodeURIComponent("Aksi tidak valid."));
  }

  const result = await actOnApproval({
    user,
    requestId,
    action: action as "APPROVE" | "REJECT",
    note,
  });
  revalidatePath("/approvals");
  if (!result.ok) {
    redirect(`/approvals/${requestId}?error=` + encodeURIComponent(result.error));
  }
  redirect(
    `/approvals/${requestId}?ok=` +
      encodeURIComponent(action === "APPROVE" ? "Request disetujui." : "Request ditolak.")
  );
}

export async function cancelApprovalAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.APPROVALS_VIEW);
  const requestId = String(formData.get("requestId") ?? "");
  const result = await cancelApproval({ user, requestId });
  revalidatePath("/approvals");
  if (!result.ok) {
    redirect(`/approvals/${requestId}?error=` + encodeURIComponent(result.error));
  }
  redirect(`/approvals/${requestId}?ok=` + encodeURIComponent("Pengajuan dibatalkan."));
}
