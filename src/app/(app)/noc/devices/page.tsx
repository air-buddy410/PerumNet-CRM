import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, NET_DEVICE_TYPES, CRITICALITY, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";
import { saveNetDeviceAction } from "../actions";

export const metadata = { title: "Perangkat Jaringan" };
const sortOptions: readonly TableSortOption[] = [
  { value: "hostname", label: "Hostname" },
  { value: "deviceType", label: "Jenis" },
  { value: "status", label: "Status" },
];

export default async function NetDevicesPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.NOC_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "hostname", defaultDirection: "asc", sortOptions });
  const canManage = user.permissions.has(PERMISSIONS.NET_INVENTORY_MANAGE);
  const orderBy: Prisma.NetworkDeviceOrderByWithRelationInput[] = table.sort === "deviceType"
    ? [{ deviceType: table.direction }, { id: "asc" }]
    : table.sort === "status"
      ? [{ status: table.direction }, { id: "asc" }]
      : [{ hostname: table.direction }, { id: "asc" }];

  const [devices, total, sites, users, editRow] = await Promise.all([
    db.networkDevice.findMany({
      include: { site: true, owner: true },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.networkDevice.count(),
    db.networkSite.findMany({ where: { status: { not: "INACTIVE" } }, orderBy: { siteCode: "asc" } }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    table.query.edit ? db.networkDevice.findUnique({ where: { id: table.query.edit } }) : Promise.resolve(null),
  ]);
  const typeLabel = (v: string) => NET_DEVICE_TYPES.find(([t]) => t === v)?.[1] ?? v;

  return (
    <div>
      <PageHeader
        title="Perangkat Jaringan"
        subtitle="Kelola perangkat jaringan aktif seperti router, switch, OLT, dan backhaul."
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="card overflow-x-auto">
          {devices.length === 0 ? (
            <EmptyState message="Belum ada perangkat jaringan." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th"><SortableTableHeader basePath="/noc/devices" currentDirection={table.direction} currentSort={table.sort} label="Hostname" query={table.query} sortKey="hostname" /></th>
                  <th className="th"><SortableTableHeader basePath="/noc/devices" currentDirection={table.direction} currentSort={table.sort} label="Jenis" query={table.query} sortKey="deviceType" /></th>
                  <th className="th">Site</th>
                  <th className="th">Mgmt IP</th>
                  <th className="th">Kritikalitas</th>
                  <th className="th"><SortableTableHeader basePath="/noc/devices" currentDirection={table.direction} currentSort={table.sort} label="Status" query={table.query} sortKey="status" /></th>
                  {canManage && <th className="th"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {devices.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs font-semibold">{d.hostname}</td>
                    <td className="td text-xs">{typeLabel(d.deviceType)}</td>
                    <td className="td text-xs">{d.site.siteCode}</td>
                    <td className="td font-mono text-xs">{d.managementIp ?? "-"}</td>
                    <td className="td">
                      <Badge
                        value={d.criticality === "CRITICAL" ? "REJECTED" : d.criticality === "HIGH" ? "PENDING" : "APPROVED"}
                        label={d.criticality}
                      />
                    </td>
                    <td className="td"><Badge value={d.status} label={statusLabel(d.status)} /></td>
                    {canManage && (
                      <td className="td text-right text-xs">
                        <Link href={`/noc/devices?edit=${d.id}`} className="text-brand-600 hover:underline">
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
        <TableControls basePath="/noc/devices" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-4 font-medium">{editRow ? `Ubah: ${editRow.hostname}` : "Perangkat Baru"}</h2>
            <form action={saveNetDeviceAction} className="space-y-3">
              {editRow && <input type="hidden" name="id" value={editRow.id} />}
              <div>
                <label className="label" htmlFor="hostname">Hostname</label>
                <input id="hostname" name="hostname" className="input" defaultValue={editRow?.hostname ?? ""} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="deviceType">Jenis</label>
                  <select id="deviceType" name="deviceType" className="input" defaultValue={editRow?.deviceType ?? "ROUTER"}>
                    {NET_DEVICE_TYPES.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="siteId">Site</label>
                  <select id="siteId" name="siteId" className="input" defaultValue={editRow?.siteId ?? ""} required>
                    <option value="" disabled>— pilih —</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>{s.siteCode}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="vendor">Vendor</label>
                  <input id="vendor" name="vendor" className="input" defaultValue={editRow?.vendor ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="model">Model</label>
                  <input id="model" name="model" className="input" defaultValue={editRow?.model ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="serialNumber">Serial Number</label>
                  <input id="serialNumber" name="serialNumber" className="input" defaultValue={editRow?.serialNumber ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="managementIp">Management IP</label>
                  <input id="managementIp" name="managementIp" className="input" defaultValue={editRow?.managementIp ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="criticality">Kritikalitas</label>
                  <select id="criticality" name="criticality" className="input" defaultValue={editRow?.criticality ?? "MEDIUM"}>
                    {CRITICALITY.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="status">Status</label>
                  <select id="status" name="status" className="input" defaultValue={editRow?.status ?? "ACTIVE"}>
                    <option value="ACTIVE">Aktif</option>
                    <option value="INACTIVE">Nonaktif</option>
                    <option value="MAINTENANCE">Maintenance</option>
                    <option value="DOWN">Down</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="ownerId">Owner</label>
                  <select id="ownerId" name="ownerId" className="input" defaultValue={editRow?.ownerId ?? ""}>
                    <option value="">— pilih —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="firmware">Firmware</label>
                  <input id="firmware" name="firmware" className="input" defaultValue={editRow?.firmware ?? ""} />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">{editRow ? "Simpan" : "Tambah"}</button>
                {editRow && <Link href="/noc/devices" className="btn-secondary">Batal</Link>}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
