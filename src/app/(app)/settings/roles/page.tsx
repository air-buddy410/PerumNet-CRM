import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Roles & Permissions" };

export default async function RolesPage() {
  await requirePermission(PERMISSIONS.ROLES_VIEW);

  const roles = await db.role.findMany({
    include: { _count: { select: { users: true, permissions: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        subtitle="17 role standar PerumNet (PRD §6). Klik role untuk mengatur permission."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {roles.map((r) => (
          <Link
            key={r.id}
            href={`/settings/roles/${r.id}`}
            className="card p-5 transition hover:shadow-md"
          >
            <div className="font-medium text-slate-900">{r.name}</div>
            <div className="mt-1 line-clamp-2 min-h-10 text-xs text-slate-500">
              {r.description}
            </div>
            <div className="mt-3 flex gap-4 text-xs text-slate-400">
              <span>{r._count.users} user</span>
              <span>{r._count.permissions} permission</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
