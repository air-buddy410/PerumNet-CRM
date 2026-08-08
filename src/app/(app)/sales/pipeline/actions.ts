"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { moveOpportunityStage } from "@/lib/crm";

export async function moveStageAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.OPPORTUNITIES_MANAGE);
  const oppId = String(formData.get("oppId") ?? "");
  const stage = String(formData.get("stage") ?? "");
  const lostReason = String(formData.get("lostReason") ?? "") || undefined;

  const result = await moveOpportunityStage(user, oppId, stage, lostReason);
  revalidatePath("/sales/pipeline");
  redirect(
    "/sales/pipeline?" +
      (result.ok
        ? "ok=" + encodeURIComponent("Stage diperbarui.")
        : "error=" + encodeURIComponent(result.error))
  );
}
