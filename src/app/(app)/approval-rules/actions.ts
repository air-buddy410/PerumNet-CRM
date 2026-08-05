"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS, AUDIT_ACTIONS } from "@/lib/constants";

export async function toggleRuleAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.APPROVALS_CONFIGURE);
  const ruleId = String(formData.get("ruleId") ?? "");

  const rule = await db.approvalRule.findUnique({ where: { id: ruleId } });
  if (!rule) {
    redirect("/approval-rules?error=" + encodeURIComponent("Rule tidak ditemukan."));
  }

  await db.approvalRule.update({
    where: { id: rule.id },
    data: { isActive: !rule.isActive },
  });
  await logAudit({
    userId: user.id,
    action: AUDIT_ACTIONS.MASTER_TOGGLE,
    module: "approvals",
    entityType: "ApprovalRule",
    entityId: rule.id,
    description: `${rule.isActive ? "Menonaktifkan" : "Mengaktifkan"} approval rule "${rule.name}"`,
  });
  redirect(
    "/approval-rules?ok=" +
      encodeURIComponent(`Rule "${rule.name}" ${rule.isActive ? "dinonaktifkan" : "diaktifkan"}.`)
  );
}
