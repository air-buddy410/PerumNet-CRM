import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatDateTime } from "@/lib/constants";
import { PageHeader, ActiveBadge, Flash } from "@/components/ui";

export const metadata = { title: "Users" };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const actor = await requirePermission(PERMISSIONS.USERS_VIEW);
  const sp = await searchParams;

  const users = await db.user.findMany({
    include: { roles: { include: { role: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="User tidak pernah dihapus — hanya dinonaktifkan, agar jejak audit tetap utuh."
        action={
          actor.permissions.has(PERMISSIONS.USERS_CREATE) ? (
            <Link href="/settings/users/new" className="btn-primary">
              + Tambah User
            </Link>
          ) : undefined
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-100 bg-slate-50/60">
            <tr>
              <th className="th">Nama</th>
              <th className="th">Username</th>
              <th className="th">Email</th>
              <th className="th">Role</th>
              <th className="th">Status</th>
              <th className="th">Dibuat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="td">
                  <Link
                    href={`/settings/users/${u.id}`}
                    className="font-medium text-brand-600 hover:underline"
                  >
                    {u.name}
                  </Link>
                </td>
                <td className="td">{u.username}</td>
                <td className="td">{u.email}</td>
                <td className="td">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <span
                        key={r.roleId}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs"
                      >
                        {r.role.name}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="td">
                  <ActiveBadge isActive={u.isActive} />
                </td>
                <td className="td whitespace-nowrap text-slate-500">
                  {formatDateTime(u.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
