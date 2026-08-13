import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, ENVIRONMENTS, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams } from "@/components/table-controls";
import { saveApplicationAction } from "../actions";

export const metadata = { title: "Application Inventory" };

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.IT_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.IT_INVENTORY_MANAGE);
  const tableOptions = [
    { value: "name", label: "Nama" },
    { value: "environment", label: "Environment" },
    { value: "status", label: "Status" },
  ] as const;
  const table = parseTableQuery(sp, { defaultSort: "name", defaultDirection: "asc", sortOptions: tableOptions });
  const orderBy: Prisma.ApplicationOrderByWithRelationInput[] = [
    { [table.sort]: table.direction },
    { id: "asc" },
  ];

  const [apps, totalCount, editRow, servers, users] = await Promise.all([
    db.application.findMany({
      include: { owner: true, server: true, _count: { select: { deployments: true } } },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.application.count(),
    table.query.edit ? db.application.findUnique({ where: { id: table.query.edit } }) : Promise.resolve(null),
    db.server.findMany({ where: { status: "ACTIVE" }, orderBy: { hostname: "asc" } }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Application Inventory"
        subtitle="Kelola aplikasi beserta repository, owner, environment, dan metode deployment."
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="card overflow-x-auto">
          {apps.length === 0 ? (
            <EmptyState message="Belum ada aplikasi terdaftar." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th"><SortableTableHeader basePath="/it/applications" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="name" label="Nama" /></th>
                  <th className="th"><SortableTableHeader basePath="/it/applications" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="environment" label="Environment" /></th>
                  <th className="th">Domain</th>
                  <th className="th">Server</th>
                  <th className="th">Owner</th>
                  <th className="th">Deploy</th>
                  <th className="th"><SortableTableHeader basePath="/it/applications" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="status" label="Status" /></th>
                  {canManage && <th className="th"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {apps.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="td font-medium">{a.name}</td>
                    <td className="td"><Badge value={a.environment} label={statusLabel(a.environment)} /></td>
                    <td className="td text-xs">{a.domain ?? "-"}</td>
                    <td className="td font-mono text-xs">{a.server?.hostname ?? "-"}</td>
                    <td className="td text-xs">{a.owner?.name ?? "-"}</td>
                    <td className="td">{a._count.deployments}</td>
                    <td className="td"><Badge value={a.status} label={statusLabel(a.status)} /></td>
                    {canManage && (
                      <td className="td text-right text-xs">
                        <Link href={`/it/applications?edit=${a.id}`} className="text-brand-600 hover:underline">
                          Ubah
                        </Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <TableControls
            basePath="/it/applications"
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
            <h2 className="mb-4 font-medium">{editRow ? `Ubah: ${editRow.name}` : "Aplikasi Baru"}</h2>
            <form action={saveApplicationAction} className="space-y-3">
              {editRow && <input type="hidden" name="id" value={editRow.id} />}
              <div>
                <label className="label" htmlFor="name">Nama</label>
                <input id="name" name="name" className="input" defaultValue={editRow?.name ?? ""} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="environment">Environment</label>
                  <select id="environment" name="environment" className="input" defaultValue={editRow?.environment ?? "PRODUCTION"}>
                    {ENVIRONMENTS.map((e) => (
                      <option key={e} value={e}>{statusLabel(e)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="status">Status</label>
                  <select id="status" name="status" className="input" defaultValue={editRow?.status ?? "ACTIVE"}>
                    <option value="ACTIVE">Aktif</option>
                    <option value="INACTIVE">Nonaktif</option>
                    <option value="DEPRECATED">Deprecated</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="repository">Repository</label>
                <input id="repository" name="repository" className="input" defaultValue={editRow?.repository ?? ""} />
              </div>
              <div>
                <label className="label" htmlFor="domain">Domain</label>
                <input id="domain" name="domain" className="input" defaultValue={editRow?.domain ?? ""} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="ownerId">Technical Owner</label>
                  <select id="ownerId" name="ownerId" className="input" defaultValue={editRow?.ownerId ?? ""}>
                    <option value="">— pilih —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="businessOwnerId">Business Owner</label>
                  <select id="businessOwnerId" name="businessOwnerId" className="input" defaultValue={editRow?.businessOwnerId ?? ""}>
                    <option value="">— pilih —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="serverId">Server</label>
                  <select id="serverId" name="serverId" className="input" defaultValue={editRow?.serverId ?? ""}>
                    <option value="">— pilih —</option>
                    {servers.map((s) => (
                      <option key={s.id} value={s.id}>{s.hostname}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="deploymentMethod">Metode Deploy</label>
                  <input id="deploymentMethod" name="deploymentMethod" className="input" defaultValue={editRow?.deploymentMethod ?? ""} placeholder="CI/CD, manual, ..." />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="techStack">Technology Stack</label>
                <input id="techStack" name="techStack" className="input" defaultValue={editRow?.techStack ?? ""} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="databaseInfo">Database</label>
                  <input id="databaseInfo" name="databaseInfo" className="input" defaultValue={editRow?.databaseInfo ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="sla">SLA</label>
                  <input id="sla" name="sla" className="input" defaultValue={editRow?.sla ?? ""} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="dependencyNote">Dependency</label>
                <input id="dependencyNote" name="dependencyNote" className="input" defaultValue={editRow?.dependencyNote ?? ""} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="backupNote">Backup</label>
                  <input id="backupNote" name="backupNote" className="input" defaultValue={editRow?.backupNote ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="monitoringNote">Monitoring</label>
                  <input id="monitoringNote" name="monitoringNote" className="input" defaultValue={editRow?.monitoringNote ?? ""} />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">{editRow ? "Simpan" : "Tambah"}</button>
                {editRow && <Link href="/it/applications" className="btn-secondary">Batal</Link>}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
