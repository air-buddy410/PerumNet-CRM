import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, DEVICE_STATUSES, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";

export const metadata = { title: "Perangkat" };
const sortOptions: readonly TableSortOption[] = [
  { value: "updatedAt", label: "Terakhir diperbarui" },
  { value: "serialNumber", label: "Serial number" },
  { value: "status", label: "Status" },
];

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "updatedAt", defaultDirection: "desc", sortOptions });
  const where: Prisma.SerializedDeviceWhereInput = {
    ...(table.query.status ? { status: table.query.status } : {}),
    ...(table.query.ownership ? { ownership: table.query.ownership } : {}),
    ...(table.query.q ? { OR: [{ serialNumber: { contains: table.query.q } }, { macAddress: { contains: table.query.q } }] } : {}),
  };
  const orderBy: Prisma.SerializedDeviceOrderByWithRelationInput[] = table.sort === "serialNumber"
    ? [{ serialNumber: table.direction }, { id: "asc" }]
    : table.sort === "status"
      ? [{ status: table.direction }, { id: "asc" }]
      : [{ updatedAt: table.direction }, { id: "asc" }];

  const [devices, total] = await Promise.all([
    db.serializedDevice.findMany({ where, include: { item: true, warehouse: true, custodian: true, customer: true, subscription: true }, orderBy, skip: (table.page - 1) * table.pageSize, take: table.pageSize }),
    db.serializedDevice.count({ where }),
  ]);

  return (
    <div>
      <PageHeader
        title="Perangkat Serialized"
        subtitle="Setiap perangkat memiliki satu lokasi dan satu penanggung jawab aktif."
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-64">
          <label className="label" htmlFor="q">Cari SN / MAC</label>
          <input id="q" name="q" className="input" defaultValue={table.query.q ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input w-52" defaultValue={table.query.status ?? ""}>
            <option value="">Semua status</option>
            {DEVICE_STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ownership">Kepemilikan</label>
          <select id="ownership" name="ownership" className="input w-52" defaultValue={table.query.ownership ?? ""}>
            <option value="">Semua kepemilikan</option>
            <option value="COMPANY">Milik PERUMNET</option>
            <option value="CUSTOMER">Milik Pelanggan</option>
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {devices.length === 0 ? (
          <EmptyState message="Tidak ada perangkat yang cocok." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/inventory/devices" currentDirection={table.direction} currentSort={table.sort} label="Serial Number" query={table.query} sortKey="serialNumber" /></th>
                <th className="th">Item</th>
                <th className="th">Lokasi / Penanggung Jawab</th>
                <th className="th">Kepemilikan</th>
                <th className="th"><SortableTableHeader basePath="/inventory/devices" currentDirection={table.direction} currentSort={table.sort} label="Status" query={table.query} sortKey="status" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {devices.map((d) => {
                const location =
                  d.warehouse?.name ??
                  (d.custodian ? `Teknisi: ${d.custodian.name}` : null) ??
                  (d.customer
                    ? `Pelanggan: ${d.customer.name}${d.subscription ? ` (${d.subscription.serviceNumber})` : ""}`
                    : "—");
                return (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs">
                      <Link href={`/inventory/devices/${d.id}`} className="font-semibold text-brand-600 hover:underline">
                        {d.serialNumber}
                      </Link>
                    </td>
                    <td className="td">{d.item.name}</td>
                    <td className="td text-xs">{location}</td>
                    <td className="td text-xs">
                      {d.ownership === "COMPANY" ? "PERUMNET" : "Pelanggan"}
                    </td>
                    <td className="td">
                      <Badge value={d.status} label={statusLabel(d.status)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <TableControls basePath="/inventory/devices" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />
    </div>
  );
}
