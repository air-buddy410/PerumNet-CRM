import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatDateTime, USER_LEVEL_LABELS } from "@/lib/constants";
import { PageHeader, ActiveBadge, Flash } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";

export const metadata = { title: "Users" };
const sortOptions: readonly TableSortOption[] = [
  { value: "createdAt", label: "Dibuat" },
  { value: "name", label: "Nama" },
  { value: "username", label: "Username" },
  { value: "email", label: "Email" },
];

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const actor = await requirePermission(PERMISSIONS.USERS_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "createdAt", defaultDirection: "asc", sortOptions });
  const orderBy: Prisma.UserOrderByWithRelationInput[] = table.sort === "name"
    ? [{ name: table.direction }, { id: "asc" }]
    : table.sort === "username"
      ? [{ username: table.direction }, { id: "asc" }]
      : table.sort === "email"
        ? [{ email: table.direction }, { id: "asc" }]
        : [{ createdAt: table.direction }, { id: "asc" }];

  const [users, total] = await Promise.all([
    db.user.findMany({ include: { roles: { include: { role: true } }, division: true }, orderBy, skip: (table.page - 1) * table.pageSize, take: table.pageSize }),
    db.user.count(),
  ]);

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
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-100 bg-slate-50/60">
            <tr>
              <th className="th"><SortableTableHeader basePath="/settings/users" currentDirection={table.direction} currentSort={table.sort} label="Nama" query={table.query} sortKey="name" /></th>
              <th className="th"><SortableTableHeader basePath="/settings/users" currentDirection={table.direction} currentSort={table.sort} label="Username" query={table.query} sortKey="username" /></th>
              <th className="th"><SortableTableHeader basePath="/settings/users" currentDirection={table.direction} currentSort={table.sort} label="Email" query={table.query} sortKey="email" /></th>
              <th className="th">Divisi</th>
              <th className="th">Level</th>
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
                <td className="td">{u.division?.name ?? "—"}</td>
                <td className="td">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                    {USER_LEVEL_LABELS[u.level] ?? u.level}
                  </span>
                </td>
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
      <TableControls basePath="/settings/users" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />
    </div>
  );
}
