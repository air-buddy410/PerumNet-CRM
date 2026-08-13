import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  TERMINATION_STATUSES,
  statusLabel,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Badge, EmptyState, Flash } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";

export const metadata = { title: "Terminasi Pelanggan" };
const sortOptions: readonly TableSortOption[] = [
  { value: "createdAt", label: "Terbaru" },
  { value: "terminationNumber", label: "Nomor" },
  { value: "status", label: "Status" },
];

export default async function TerminationsPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.TERMINATION_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "createdAt", defaultDirection: "desc", sortOptions });
  const where: Prisma.CustomerTerminationWhereInput = {
    ...(table.query.status ? { status: table.query.status } : {}),
    ...(table.query.q ? { OR: [
      { terminationNumber: { contains: table.query.q } },
      { customer: { name: { contains: table.query.q } } },
      { subscription: { serviceNumber: { contains: table.query.q } } },
    ] } : {}),
  };
  const orderBy: Prisma.CustomerTerminationOrderByWithRelationInput[] = table.sort === "terminationNumber"
    ? [{ terminationNumber: table.direction }, { id: "asc" }]
    : table.sort === "status"
      ? [{ status: table.direction }, { id: "asc" }]
      : [{ createdAt: table.direction }, { id: "asc" }];

  const [terminations, total] = await Promise.all([
    db.customerTermination.findMany({
      where,
      include: { customer: { select: { name: true } }, subscription: { select: { serviceNumber: true } }, recovery: { select: { id: true, recoveryNumber: true, status: true } } },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.customerTermination.count({ where }),
  ]);

  const canCreate = user.permissions.has(PERMISSIONS.TERMINATION_CREATE);

  return (
    <div>
      <PageHeader
        title="Terminasi Pelanggan"
        subtitle="Persetujuan terminasi otomatis menerbitkan surat penarikan perangkat — keduanya dibuat dalam satu transaksi."
        action={
          canCreate ? (
            <div className="flex items-center gap-2">
              <a href="/api/export/terminations" className="btn-secondary">Export CSV</a>
              <Link href="/crm/terminations/new" className="btn-primary">
                Ajukan Terminasi
              </Link>
            </div>
          ) : (
            <a href="/api/export/terminations" className="btn-secondary">Export CSV</a>
          )
        }
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-64">
          <label className="label" htmlFor="q">Cari nomor / pelanggan</label>
          <input id="q" name="q" className="input" defaultValue={table.query.q ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
        <select id="status" name="status" className="input w-52" defaultValue={table.query.status ?? ""}>
            <option value="">Semua status</option>
            {TERMINATION_STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {terminations.length === 0 ? (
          <EmptyState message="Belum ada pengajuan terminasi." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/crm/terminations" currentDirection={table.direction} currentSort={table.sort} label="Nomor" query={table.query} sortKey="terminationNumber" /></th>
                <th className="th">Pelanggan</th>
                <th className="th">Layanan</th>
                <th className="th">Berlaku</th>
                <th className="th">Penarikan</th>
                <th className="th"><SortableTableHeader basePath="/crm/terminations" currentDirection={table.direction} currentSort={table.sort} label="Status" query={table.query} sortKey="status" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {terminations.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="td">
                    <Link
                      href={`/crm/terminations/${t.id}`}
                      className="font-semibold text-brand-600 hover:underline"
                    >
                      {t.terminationNumber}
                    </Link>
                  </td>
                  <td className="td">{t.customer.name}</td>
                  <td className="td font-mono text-xs">{t.subscription.serviceNumber}</td>
                  <td className="td text-xs">{formatDateTime(t.effectiveDate)}</td>
                  <td className="td text-xs">
                    {t.recovery ? (
                      <Link
                        href={`/inventory/device-recoveries/${t.recovery.id}`}
                        className="text-brand-600 hover:underline"
                      >
                        {t.recovery.recoveryNumber}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="td">
                    <Badge value={t.status} label={statusLabel(t.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <TableControls basePath="/crm/terminations" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />
    </div>
  );
}
