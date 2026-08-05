"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS, AUDIT_ACTIONS, ROLES } from "@/lib/constants";

export async function updateRolePermissionsAction(
  formData: FormData
): Promise<void> {
  const actor = await requirePermission(PERMISSIONS.ROLES_MANAGE);
  const roleId = String(formData.get("roleId") ?? "");
  const permissionIds = formData.getAll("permissionIds").map(String).filter(Boolean);

  const role = await db.role.findUnique({
    where: { id: roleId },
    include: { permissions: true },
  });
  if (!role) {
    redirect("/settings/roles?error=" + encodeURIComponent("Role tidak ditemukan."));
  }
  // Super Admin selalu memiliki seluruh permission — tidak dapat dipreteli
  // agar sistem tidak pernah terkunci tanpa administrator.
  if (role.code === ROLES.SUPER_ADMIN) {
    redirect(
      `/settings/roles/${roleId}?error=` +
        encodeURIComponent("Permission Super Admin tidak dapat diubah.")
    );
  }

  const before = role.permissions.map((p) => p.permissionId).sort();
  await db.$transaction([
    db.rolePermission.deleteMany({ where: { roleId } }),
    db.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
    }),
  ]);

  await logAudit({
    userId: actor.id,
    action: AUDIT_ACTIONS.ROLE_PERMISSION_UPDATE,
    module: "roles",
    entityType: "Role",
    entityId: roleId,
    description: `Mengubah permission role "${role.name}"`,
    metadata: { before, after: [...permissionIds].sort() },
  });
  revalidatePath("/settings/roles");
  redirect(
    `/settings/roles/${roleId}?ok=` + encodeURIComponent("Permission tersimpan.")
  );
}
