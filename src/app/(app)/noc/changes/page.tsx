import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, CHANGE_TYPES, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";

export const metadata = { title: "Network Changes" };
const sortOptions: readonly TableSortOption[] = [
  { value: "createdAt", label: "Terbaru" },
  { value: "changeNumber", label: "Nomor" },
  { value: "status", label: "Status" },
];

export default async function ChangesPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.NOC_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "createdAt", defaultDirection: "desc", sortOptions });
  const where = table.query.type ? { changeType: table.query.type } : undefined;
  const orderBy: Prisma.ChangeRequestOrderByWithRelationInput[] = table.sort === "changeNumber"
    ? [{ changeNumber: table.direction }, { id: "asc" }]
    : table.sort === "status"
      ? [{ status: table.direction }, { id: "asc" }]
      : [{ createdAt: table.direction }, { id: "asc" }];

  const [changes, total] = await Promise.all([
    db.changeRequest.findMany({ where, include: { pic: true, createdBy: true }, orderBy, skip: (table.page - 1) * table.pageSize, take: table.pageSize }),
    db.changeRequest.count({ where }),
  ]);

  return (
    <div>
      <PageHeader
        title="Network Change Management"
        subtitle="Setiap perubahan memerlukan rencana rollback dan persetujuan; perubahan darurat wajib ditinjau setelah pelaksanaan."
        action={
          user.permissions.has(PERMISSIONS.CHANGES_CREATE) ? (
            <Link href="/noc/changes/new" className="btn-primary">+ Change Request</Link>
          ) : undefined
        }
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <form method="GET" className="mb-4 flex items-end gap-3">
        <div>
          <label className="label" htmlFor="type">Jenis</label>
          <select id="type" name="type" className="input w-44" defaultValue={table.query.type ?? ""}>
            <option value="">Semua jenis</option>
            {CHANGE_TYPES.map((t) => (
              <option key={t} value={t}>{statusLabel(t)}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {changes.length === 0 ? (
          <EmptyState message="Belum ada change request." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/noc/changes" currentDirection={table.direction} currentSort={table.sort} label="Nomor" query={table.query} sortKey="changeNumber" /></th>
                <th className="th">Judul</th>
                <th className="th">Jenis</th>
                <th className="th">PIC</th>
                <th className="th">Window</th>
                <th className="th"><SortableTableHeader basePath="/noc/changes" currentDirection={table.direction} currentSort={table.sort} label="Status" query={table.query} sortKey="status" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {changes.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="td whitespace-nowrap">
                    <Link href={`/noc/changes/${c.id}`} className="font-medium text-brand-600 hover:underline">
                      {c.changeNumber}
                    </Link>
                  </td>
                  <td className="td max-w-56 truncate">{c.title}</td>
                  <td className="td">
                    <Badge
                      value={c.changeType === "EMERGENCY" ? "REJECTED" : c.changeType === "MAJOR" ? "PENDING" : "APPROVED"}
                      label={statusLabel(c.changeType)}
                    />
                  </td>
                  <td className="td text-xs">{c.pic.name}</td>
                  <td className="td whitespace-nowrap text-xs">
                    {c.windowStart ? formatDateTime(c.windowStart) : "-"}
                  </td>
                  <td className="td"><Badge value={c.status} label={statusLabel(c.status)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <TableControls basePath="/noc/changes" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />
    </div>
  );
}
