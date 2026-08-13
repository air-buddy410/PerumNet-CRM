import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  LEAD_STATUSES,
  statusLabel,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Badge, EmptyState, Flash } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";

export const metadata = { title: "Leads" };
const sortOptions: readonly TableSortOption[] = [
  { value: "createdAt", label: "Terbaru" },
  { value: "leadNumber", label: "Nomor" },
  { value: "name", label: "Nama" },
  { value: "status", label: "Status" },
  { value: "nextFollowUpAt", label: "Follow-up" },
];

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.LEADS_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "createdAt", defaultDirection: "desc", sortOptions });

  const where: Prisma.LeadWhereInput = {
    ...(table.query.status ? { status: table.query.status } : {}),
    ...(table.query.owner === "mine"
      ? { salesOwnerId: user.id }
      : table.query.owner === "unassigned"
        ? { salesOwnerId: null }
        : {}),
  };
  const orderBy: Prisma.LeadOrderByWithRelationInput[] = table.sort === "leadNumber"
    ? [{ leadNumber: table.direction }, { id: "asc" }]
    : table.sort === "name"
    ? [{ name: table.direction }, { id: "asc" }]
    : table.sort === "status"
      ? [{ status: table.direction }, { id: "asc" }]
      : table.sort === "nextFollowUpAt"
        ? [{ nextFollowUpAt: table.direction }, { id: "asc" }]
        : [{ createdAt: table.direction }, { id: "asc" }];

  const [leads, total, salesOwners] = await Promise.all([
    db.lead.findMany({
      where,
      include: { salesOwner: true, campaign: true, interestPackage: true },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.lead.count({ where }),
    db.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const now = new Date();
  const unassignedCount = leads.filter((l) => !l.salesOwnerId).length;
  const overdueCount = leads.filter(
    (l) => l.nextFollowUpAt && l.nextFollowUpAt < now && !["CONVERTED", "LOST", "NOT_INTERESTED"].includes(l.status)
  ).length;

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="Setiap lead harus memiliki Sales owner. Follow-up yang melewati tenggat ditandai merah."
        action={
          user.permissions.has(PERMISSIONS.LEADS_CREATE) ? (
            <Link href="/sales/leads/new" className="btn-primary">
              + Lead
            </Link>
          ) : undefined
        }
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      {(unassignedCount > 0 || overdueCount > 0) && (
        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          {unassignedCount > 0 && (
            <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-800">
              {unassignedCount} lead belum memiliki Sales owner
            </span>
          )}
          {overdueCount > 0 && (
            <span className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-red-700">
              {overdueCount} follow-up lewat tenggat
            </span>
          )}
        </div>
      )}

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input w-52" defaultValue={table.query.status ?? ""}>
            <option value="">Semua status</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="owner">Sales Owner</label>
          <select id="owner" name="owner" className="input w-52" defaultValue={table.query.owner ?? ""}>
            <option value="">Semua</option>
            <option value="mine">Milik saya</option>
            <option value="unassigned">Belum ter-assign</option>
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {leads.length === 0 ? (
          <EmptyState message="Belum ada lead yang cocok dengan filter." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/sales/leads" currentDirection={table.direction} currentSort={table.sort} label="Nomor" query={table.query} sortKey="leadNumber" /></th>
                <th className="th"><SortableTableHeader basePath="/sales/leads" currentDirection={table.direction} currentSort={table.sort} label="Nama" query={table.query} sortKey="name" /></th>
                <th className="th">Telepon</th>
                <th className="th">Sumber</th>
                <th className="th">Paket Diminati</th>
                <th className="th">Sales Owner</th>
                <th className="th">Follow-up</th>
                <th className="th"><SortableTableHeader basePath="/sales/leads" currentDirection={table.direction} currentSort={table.sort} label="Status" query={table.query} sortKey="status" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((l) => {
                const overdue =
                  l.nextFollowUpAt &&
                  l.nextFollowUpAt < now &&
                  !["CONVERTED", "LOST", "NOT_INTERESTED"].includes(l.status);
                return (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="td">
                      <Link href={`/sales/leads/${l.id}`} className="font-medium text-brand-600 hover:underline">
                        {l.leadNumber}
                      </Link>
                    </td>
                    <td className="td">
                      <div className="font-medium">{l.name}</div>
                      {l.company && <div className="text-xs text-slate-500">{l.company}</div>}
                    </td>
                    <td className="td whitespace-nowrap">{l.phone}</td>
                    <td className="td text-xs">
                      {l.campaign ? l.campaign.name : statusLabel(l.source)}
                    </td>
                    <td className="td text-xs">{l.interestPackage?.name ?? "-"}</td>
                    <td className="td">
                      {l.salesOwner ? (
                        l.salesOwner.name
                      ) : (
                        <span className="font-medium text-amber-600">Belum ada</span>
                      )}
                    </td>
                    <td className={`td whitespace-nowrap text-xs ${overdue ? "font-medium text-red-600" : "text-slate-500"}`}>
                      {l.nextFollowUpAt ? formatDateTime(l.nextFollowUpAt) : "-"}
                    </td>
                    <td className="td"><Badge value={l.status} label={statusLabel(l.status)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <TableControls basePath="/sales/leads" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />
      {salesOwners.length === 0 && (
        <p className="mt-3 text-xs text-slate-400">Belum ada user aktif untuk di-assign.</p>
      )}
    </div>
  );
}
