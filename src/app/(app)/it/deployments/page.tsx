import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams } from "@/components/table-controls";

export const metadata = { title: "Deployments" };

export default async function DeploymentsPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.IT_VIEW);
  const sp = await searchParams;
  const canCreate = user.permissions.has(PERMISSIONS.DEPLOYMENTS_CREATE);
  const tableOptions = [
    { value: "createdAt", label: "Dibuat" },
    { value: "deployNumber", label: "Nomor" },
    { value: "status", label: "Status" },
  ] as const;
  const table = parseTableQuery(sp, { defaultSort: "createdAt", sortOptions: tableOptions });
  const orderBy: Prisma.DeploymentOrderByWithRelationInput[] = [
    { [table.sort]: table.direction },
    { id: "asc" },
  ];

  const [deployments, totalCount] = await Promise.all([
    db.deployment.findMany({
      include: { application: true, createdBy: true, executedBy: true },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.deployment.count(),
  ]);

  return (
    <div>
      <PageHeader
        title="Deployment Management"
        subtitle="Deployment production memerlukan change record, rencana rollback, hasil testing, backup terverifikasi, dan persetujuan."
        action={
          canCreate ? (
            <Link href="/it/deployments/new" className="btn-primary">
              Deployment Baru
            </Link>
          ) : undefined
        }
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="card overflow-x-auto">
        {deployments.length === 0 ? (
          <EmptyState message="Belum ada deployment." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/it/deployments" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="deployNumber" label="Nomor" /></th>
                <th className="th">Aplikasi</th>
                <th className="th">Versi</th>
                <th className="th">Environment</th>
                <th className="th">Pembuat</th>
                <th className="th">Eksekutor</th>
                <th className="th">Selesai</th>
                <th className="th"><SortableTableHeader basePath="/it/deployments" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="status" label="Status" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deployments.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="td font-mono text-xs">
                    <Link href={`/it/deployments/${d.id}`} className="text-brand-600 hover:underline">
                      {d.deployNumber}
                    </Link>
                  </td>
                  <td className="td font-medium">{d.application.name}</td>
                  <td className="td font-mono text-xs">{d.version}</td>
                  <td className="td">
                    <Badge value={d.environment} label={statusLabel(d.environment)} />
                    {d.environment === "PRODUCTION" && d.isMajor ? (
                      <span className="ml-1 text-xs text-slate-500">major</span>
                    ) : null}
                  </td>
                  <td className="td text-xs">{d.createdBy.name}</td>
                  <td className="td text-xs">{d.executedBy?.name ?? "-"}</td>
                  <td className="td text-xs">{d.finishedAt ? formatDateTime(d.finishedAt) : "-"}</td>
                  <td className="td"><Badge value={d.status} label={statusLabel(d.status)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
          <TableControls
            basePath="/it/deployments"
            query={table.query}
            page={table.page}
            pageSize={table.pageSize}
            sort={table.sort}
            direction={table.direction}
            sortOptions={tableOptions}
            total={totalCount}
          />
        </div>
    </div>
  );
}
