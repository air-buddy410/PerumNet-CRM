import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, ROLES } from "@/lib/constants";
import { PageHeader, Flash, BackLink } from "@/components/ui";
import { updateRolePermissionsAction } from "../actions";

export const metadata = { title: "Detail Role" };

export default async function RoleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const actor = await requirePermission(PERMISSIONS.ROLES_VIEW);
  const canManage = actor.permissions.has(PERMISSIONS.ROLES_MANAGE);
  const { id } = await params;
  const sp = await searchParams;

  const [role, permissions] = await Promise.all([
    db.role.findUnique({
      where: { id },
      include: { permissions: true, _count: { select: { users: true } } },
    }),
    db.permission.findMany({ orderBy: [{ module: "asc" }, { action: "asc" }] }),
  ]);
  if (!role) notFound();

  const assigned = new Set(role.permissions.map((p) => p.permissionId));
  const isSuperAdmin = role.code === ROLES.SUPER_ADMIN;
  const editable = canManage && !isSuperAdmin;

  const modules = Array.from(new Set(permissions.map((p) => p.module)));

  return (
    <div className="max-w-3xl">
      <BackLink href="/settings/roles" label="Kembali ke daftar role" />
      <PageHeader
        title={role.name}
        subtitle={`${role.description ?? ""} · ${role._count.users} user`}
      />
      <Flash ok={sp.ok} error={sp.error} />

      {isSuperAdmin && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Permission Super Admin bersifat tetap (seluruh permission) dan tidak dapat diubah.
        </div>
      )}

      <form action={updateRolePermissionsAction} className="card space-y-6 p-6">
        <input type="hidden" name="roleId" value={role.id} />
        {modules.map((module) => (
          <div key={module}>
            <div className="mb-2 text-sm font-semibold capitalize text-slate-700">
              {module.replace(/_/g, " ")}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {permissions
                .filter((p) => p.module === module)
                .map((p) => (
                  <label
                    key={p.id}
                    className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      name="permissionIds"
                      value={p.id}
                      defaultChecked={assigned.has(p.id)}
                      disabled={!editable}
                      className="mt-0.5 accent-brand-600"
                    />
                    <span>
                      <span className="font-medium">{p.code}</span>
                      <span className="block text-xs text-slate-500">
                        {p.description}
                      </span>
                    </span>
                  </label>
                ))}
            </div>
          </div>
        ))}
        {editable && (
          <button type="submit" className="btn-primary">
            Simpan Permission
          </button>
        )}
      </form>
    </div>
  );
}
