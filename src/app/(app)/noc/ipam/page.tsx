import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PageHeader, Flash, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams } from "@/components/table-controls";
import { createSubnetAction } from "./actions";

export const metadata = { title: "IP Address Management" };

export default async function IpamPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.NOC_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.IPAM_MANAGE);
  const tableOptions = [
    { value: "cidr", label: "CIDR" },
    { value: "name", label: "Nama" },
  ] as const;
  const table = parseTableQuery(sp, { defaultSort: "cidr", defaultDirection: "asc", sortOptions: tableOptions });
  const orderBy: Prisma.SubnetOrderByWithRelationInput[] = [
    { [table.sort]: table.direction },
    { id: "asc" },
  ];

  const [subnets, totalCount, ipCounts, sites, users] = await Promise.all([
    db.subnet.findMany({
      include: {
        site: true,
        owner: true,
      },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.subnet.count(),
    db.iPAddress.groupBy({
      by: ["subnetId"],
      where: { status: { not: "RELEASED" } },
      _count: { _all: true },
    }),
    db.networkSite.findMany({ orderBy: { siteCode: "asc" } }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="IP Address Management"
        subtitle="Setiap IP harus unik dan tertaut ke perangkat atau layanan."
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card overflow-x-auto">
          {subnets.length === 0 ? (
            <EmptyState message="Belum ada subnet." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                <th className="th"><SortableTableHeader basePath="/noc/ipam" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="cidr" label="CIDR" /></th>
                <th className="th"><SortableTableHeader basePath="/noc/ipam" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="name" label="Nama / Tujuan" /></th>
                  <th className="th">VLAN</th>
                  <th className="th">Site</th>
                  <th className="th">Owner</th>
                  <th className="th text-right">IP Terpakai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subnets.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs">
                      <Link href={`/noc/ipam/${s.id}`} className="font-semibold text-brand-600 hover:underline">
                        {s.cidr}
                      </Link>
                    </td>
                    <td className="td">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-slate-500">{s.purpose}</div>
                    </td>
                    <td className="td text-xs">{s.vlan ?? "-"}</td>
                    <td className="td text-xs">{s.site?.siteCode ?? "-"}</td>
                    <td className="td text-xs">{s.owner?.name ?? "-"}</td>
                    <td className="td text-right">
                      {ipCounts.find((x) => x.subnetId === s.id)?._count._all ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <TableControls
            basePath="/noc/ipam"
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
            <h2 className="mb-4 font-medium">Subnet Baru</h2>
            <form action={createSubnetAction} className="space-y-3">
              <div>
                <label className="label" htmlFor="cidr">CIDR</label>
                <input id="cidr" name="cidr" className="input font-mono" placeholder="10.10.0.0/24" required />
              </div>
              <div>
                <label className="label" htmlFor="name">Nama</label>
                <input id="name" name="name" className="input" required />
              </div>
              <div>
                <label className="label" htmlFor="purpose">Tujuan (wajib)</label>
                <input id="purpose" name="purpose" className="input" placeholder="mis. PPPoE pool area utara" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="vlan">VLAN</label>
                  <input id="vlan" name="vlan" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="gateway">Gateway</label>
                  <input id="gateway" name="gateway" className="input font-mono" />
                </div>
                <div>
                  <label className="label" htmlFor="siteId">Site</label>
                  <select id="siteId" name="siteId" className="input" defaultValue="">
                    <option value="">— pilih —</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>{s.siteCode}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="ownerId">Owner</label>
                  <select id="ownerId" name="ownerId" className="input" defaultValue="">
                    <option value="">— pilih —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button type="submit" className="btn-primary w-full justify-center">Tambah Subnet</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
