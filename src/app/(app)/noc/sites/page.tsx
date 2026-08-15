import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, SITE_TYPES, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";
import { FtthCoordinatePicker } from "@/components/ftth-coordinate-picker";
import { saveSiteAction } from "../actions";

export const metadata = { title: "Network Sites" };
const sortOptions: readonly TableSortOption[] = [
  { value: "siteCode", label: "Kode" },
  { value: "name", label: "Nama" },
  { value: "type", label: "Jenis" },
  { value: "status", label: "Status" },
];

export default async function SitesPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.NOC_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "siteCode", defaultDirection: "asc", sortOptions });
  const canManage = user.permissions.has(PERMISSIONS.NET_INVENTORY_MANAGE);
  const orderBy: Prisma.NetworkSiteOrderByWithRelationInput[] = table.sort === "name"
    ? [{ name: table.direction }, { id: "asc" }]
    : table.sort === "type"
      ? [{ type: table.direction }, { id: "asc" }]
      : table.sort === "status"
        ? [{ status: table.direction }, { id: "asc" }]
        : [{ siteCode: table.direction }, { id: "asc" }];

  const [sites, total, areas, users, editRow] = await Promise.all([
    db.networkSite.findMany({
      include: {
        area: true,
        pic: true,
        _count: { select: { devices: true, subnets: true } },
      },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.networkSite.count(),
    db.area.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    table.query.edit ? db.networkSite.findUnique({ where: { id: table.query.edit } }) : Promise.resolve(null),
  ]);

  return (
    <div>
      <PageHeader
        title="Network Sites"
        subtitle="Kelola POP, ODP, ODC, tower, dan lokasi infrastruktur jaringan."
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="crm-list-column">
          <div className="card overflow-x-auto">
          {sites.length === 0 ? (
            <EmptyState message="Belum ada site." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th"><SortableTableHeader basePath="/noc/sites" currentDirection={table.direction} currentSort={table.sort} label="Kode" query={table.query} sortKey="siteCode" /></th>
                  <th className="th"><SortableTableHeader basePath="/noc/sites" currentDirection={table.direction} currentSort={table.sort} label="Nama" query={table.query} sortKey="name" /></th>
                  <th className="th"><SortableTableHeader basePath="/noc/sites" currentDirection={table.direction} currentSort={table.sort} label="Jenis" query={table.query} sortKey="type" /></th>
                  <th className="th">Area</th>
                  <th className="th">PIC</th>
                  <th className="th">Perangkat</th>
                  <th className="th"><SortableTableHeader basePath="/noc/sites" currentDirection={table.direction} currentSort={table.sort} label="Status" query={table.query} sortKey="status" /></th>
                  {canManage && <th className="th"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sites.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs">{s.siteCode}</td>
                    <td className="td font-medium">{s.name}</td>
                    <td className="td text-xs">{statusLabel(s.type) !== s.type ? statusLabel(s.type) : SITE_TYPES.find(([v]) => v === s.type)?.[1] ?? s.type}</td>
                    <td className="td text-xs">{s.area?.name ?? "-"}</td>
                    <td className="td text-xs">{s.pic?.name ?? "-"}</td>
                    <td className="td">{s._count.devices}</td>
                    <td className="td"><Badge value={s.status} label={statusLabel(s.status)} /></td>
                    {canManage && (
                      <td className="td text-right text-xs">
                        <Link href={`/noc/sites?edit=${s.id}`} className="text-brand-600 hover:underline">
                          Ubah
                        </Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          </div>
        <TableControls basePath="/noc/sites" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />
        </div>

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-4 font-medium">{editRow ? `Ubah: ${editRow.siteCode}` : "Site Baru"}</h2>
            <form action={saveSiteAction} className="space-y-3">
              {editRow && <input type="hidden" name="id" value={editRow.id} />}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="siteCode">Kode</label>
                  <input id="siteCode" name="siteCode" className="input" defaultValue={editRow?.siteCode ?? ""} required />
                </div>
                <div>
                  <label className="label" htmlFor="type">Jenis</label>
                  <select id="type" name="type" className="input" defaultValue={editRow?.type ?? "POP"}>
                    {SITE_TYPES.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="name">Nama</label>
                <input id="name" name="name" className="input" defaultValue={editRow?.name ?? ""} required />
              </div>
              <div>
                <label className="label" htmlFor="address">Alamat</label>
                <textarea id="address" name="address" rows={2} className="input" defaultValue={editRow?.address ?? ""} />
              </div>
              <FtthCoordinatePicker
                initialLatitude={editRow?.latitude}
                initialLongitude={editRow?.longitude}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="areaId">Area</label>
                  <select id="areaId" name="areaId" className="input" defaultValue={editRow?.areaId ?? ""}>
                    <option value="">— pilih —</option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="picId">PIC</label>
                  <select id="picId" name="picId" className="input" defaultValue={editRow?.picId ?? ""}>
                    <option value="">— pilih —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="powerSource">Sumber Listrik</label>
                  <input id="powerSource" name="powerSource" className="input" defaultValue={editRow?.powerSource ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="backupPower">Backup Power</label>
                  <input id="backupPower" name="backupPower" className="input" defaultValue={editRow?.backupPower ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="upstreamProvider">Upstream</label>
                  <input id="upstreamProvider" name="upstreamProvider" className="input" defaultValue={editRow?.upstreamProvider ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="status">Status</label>
                  <select id="status" name="status" className="input" defaultValue={editRow?.status ?? "ACTIVE"}>
                    <option value="ACTIVE">Aktif</option>
                    <option value="INACTIVE">Nonaktif</option>
                    <option value="PLANNED">Direncanakan</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="notes">Catatan</label>
                <textarea id="notes" name="notes" rows={2} className="input" defaultValue={editRow?.notes ?? ""} />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">{editRow ? "Simpan" : "Tambah"}</button>
                {editRow && <Link href="/noc/sites" className="btn-secondary">Batal</Link>}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
