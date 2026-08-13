import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatDateTime } from "@/lib/constants";
import { PageHeader, EmptyState } from "@/components/ui";
import {
  parseTableQuery,
  SortableTableHeader,
  TableControls,
  type TableSearchParams,
  type TableSortOption,
} from "@/components/table-controls";

export const metadata = { title: "Audit Log" };

const sortOptions: readonly TableSortOption[] = [
  { value: "createdAt", label: "Waktu" },
  { value: "action", label: "Aksi" },
  { value: "module", label: "Modul" },
];

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  await requirePermission(PERMISSIONS.AUDIT_LOG_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, {
    defaultSort: "createdAt",
    defaultDirection: "desc",
    sortOptions,
  });

  const where = {
    ...(table.query.module ? { module: table.query.module } : {}),
    ...(table.query.action ? { action: table.query.action } : {}),
  };
  const orderBy: Prisma.AuditLogOrderByWithRelationInput[] = table.sort === "action"
    ? [{ action: table.direction }, { id: "asc" }]
    : table.sort === "module"
      ? [{ module: table.direction }, { id: "asc" }]
      : [{ createdAt: table.direction }, { id: "asc" }];

  const [logs, total, modules, actions] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { user: true },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({ distinct: ["module"], select: { module: true } }),
    db.auditLog.findMany({ distinct: ["action"], select: { action: true } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle={`${total} entri · catatan audit hanya dapat ditambah dan tidak dapat diubah atau dihapus.`}
      />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="module">Modul</label>
          <select id="module" name="module" className="input w-44" defaultValue={sp.module ?? ""}>
            <option value="">Semua</option>
            {modules.map((m) => (
              <option key={m.module} value={m.module}>{m.module}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="action">Aksi</label>
          <select id="action" name="action" className="input w-52" defaultValue={sp.action ?? ""}>
            <option value="">Semua</option>
            {actions.map((a) => (
              <option key={a.action} value={a.action}>{a.action}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {logs.length === 0 ? (
          <EmptyState message="Belum ada entri audit." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/audit-log" currentDirection={table.direction} currentSort={table.sort} label="Waktu" query={table.query} sortKey="createdAt" /></th>
                <th className="th">User</th>
                <th className="th"><SortableTableHeader basePath="/audit-log" currentDirection={table.direction} currentSort={table.sort} label="Aksi" query={table.query} sortKey="action" /></th>
                <th className="th"><SortableTableHeader basePath="/audit-log" currentDirection={table.direction} currentSort={table.sort} label="Modul" query={table.query} sortKey="module" /></th>
                <th className="th">Deskripsi</th>
                <th className="th">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="td whitespace-nowrap text-slate-500">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="td whitespace-nowrap">{log.user?.name ?? "—"}</td>
                  <td className="td">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                      {log.action}
                    </span>
                  </td>
                  <td className="td">{log.module}</td>
                  <td className="td">{log.description}</td>
                  <td className="td whitespace-nowrap text-xs text-slate-400">
                    {log.ipAddress ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <TableControls
        basePath="/audit-log"
        direction={table.direction}
        page={table.page}
        pageSize={table.pageSize}
        query={table.query}
        sort={table.sort}
        sortOptions={sortOptions}
        total={total}
      />
    </div>
  );
}
