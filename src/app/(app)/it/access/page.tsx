import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, ACCESS_TYPES, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams } from "@/components/table-controls";
import { offboardUserAction } from "./actions";

export const metadata = { title: "Access Management" };

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.ACCESS_REQUEST);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.ACCESS_MANAGE);
  const seesAll = canManage || user.permissions.has(PERMISSIONS.IT_VIEW);
  const tableOptions = [
    { value: "createdAt", label: "Dibuat" },
    { value: "requestNumber", label: "Nomor" },
    { value: "status", label: "Status" },
  ] as const;
  const table = parseTableQuery(sp, { defaultSort: "createdAt", sortOptions: tableOptions });
  const where: Prisma.AccessRequestWhereInput = seesAll
    ? {}
    : { OR: [{ createdById: user.id }, { targetUserId: user.id }] };
  const orderBy: Prisma.AccessRequestOrderByWithRelationInput[] = [
    { [table.sort]: table.direction },
    { id: "asc" },
  ];

  const [requests, totalCount, users] = await Promise.all([
    db.accessRequest.findMany({
      where,
      include: { targetUser: true, createdBy: true },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.accessRequest.count({ where }),
    canManage
      ? db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);
  const typeLabel = (t: string) => ACCESS_TYPES.find(([v]) => v === t)?.[1] ?? t;
  const now = new Date();

  return (
    <div>
      <PageHeader
        title="Access Management"
        subtitle="Kelola permintaan, pemberian, dan pencabutan akses sistem."
        action={
          <Link href="/it/access/new" className="btn-primary">
            Minta Akses
          </Link>
        }
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className={`grid gap-6 ${canManage ? "lg:grid-cols-[1fr_20rem]" : ""}`}>
        <div className="card overflow-x-auto">
          {requests.length === 0 ? (
            <EmptyState message="Belum ada permintaan akses." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th"><SortableTableHeader basePath="/it/access" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="requestNumber" label="Nomor" /></th>
                  <th className="th">Penerima</th>
                  <th className="th">Sistem</th>
                  <th className="th">Role</th>
                  <th className="th">Jenis</th>
                  <th className="th">Production</th>
                  <th className="th">Expiry</th>
                  <th className="th"><SortableTableHeader basePath="/it/access" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="status" label="Status" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs">
                      <Link href={`/it/access/${r.id}`} className="text-brand-600 hover:underline">
                        {r.requestNumber}
                      </Link>
                    </td>
                    <td className="td text-xs font-medium">{r.targetUser.name}</td>
                    <td className="td text-xs">{r.systemName}</td>
                    <td className="td text-xs">{r.roleRequested}</td>
                    <td className="td text-xs">{typeLabel(r.accessType)}</td>
                    <td className="td text-xs">{r.isProduction ? "Ya" : "-"}</td>
                    <td className="td text-xs">
                      {r.expiryDate ? (
                        <span className={r.status === "GRANTED" && r.expiryDate < now ? "font-medium text-red-600" : ""}>
                          {formatDateTime(r.expiryDate)}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="td"><Badge value={r.status} label={statusLabel(r.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <TableControls
            basePath="/it/access"
            query={table.query}
            page={table.page}
            pageSize={table.pageSize}
            sort={table.sort}
            direction={table.direction}
            sortOptions={tableOptions}
            total={totalCount}
          />
        </div>

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-1 text-sm font-medium">Offboarding</h2>
            <p className="mb-3 text-xs text-slate-500">
              Mencabut SELURUH akses aktif user (rule 30). Nonaktifkan user di menu Users secara terpisah.
            </p>
            <form action={offboardUserAction} className="space-y-3">
              <select name="targetUserId" className="input" required defaultValue="">
                <option value="" disabled>— pilih user —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <textarea name="reason" rows={2} className="input" placeholder="Alasan (wajib)" required />
              <button type="submit" className="btn-danger w-full justify-center">
                Cabut Semua Akses
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
