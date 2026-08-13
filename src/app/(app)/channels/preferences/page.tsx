import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, CUSTOMER_CHANNELS, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";
import { setCustomerChannelAction } from "../actions";

export const metadata = { title: "Preferensi Notifikasi" };
const sortOptions: readonly TableSortOption[] = [
  { value: "name", label: "Nama" },
  { value: "customerNumber", label: "Nomor pelanggan" },
];

export default async function PreferencesPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.CHANNELS_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "name", defaultDirection: "asc", sortOptions });
  const canManage = user.permissions.has(PERMISSIONS.CHANNELS_MANAGE);

  const where = { status: "ACTIVE" } as const;
  const orderBy: Prisma.CustomerOrderByWithRelationInput[] = table.sort === "customerNumber"
    ? [{ customerNumber: table.direction }, { id: "asc" }]
    : [{ name: table.direction }, { id: "asc" }];
  const [customers, total] = await Promise.all([
    db.customer.findMany({ where, orderBy, skip: (table.page - 1) * table.pageSize, take: table.pageSize }),
    db.customer.count({ where }),
  ]);
  const counts = CUSTOMER_CHANNELS.map(([v, l]) => ({
    value: v,
    label: l,
    count: customers.filter((c) => c.notifyChannel === v).length,
  }));

  return (
    <div>
      <PageHeader
        title="Preferensi Notifikasi Pelanggan"
        subtitle={`Preferensi kanal pelanggan. ${counts.map((c) => `${c.label}: ${c.count}`).join(" · ")}. Pelanggan yang memilih tidak menerima tidak akan dikirimi pesan.`}
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="card overflow-x-auto">
        {customers.length === 0 ? (
          <EmptyState message="Belum ada pelanggan aktif." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/channels/preferences" currentDirection={table.direction} currentSort={table.sort} label="Pelanggan" query={table.query} sortKey="customerNumber" /></th>
                <th className="th">Telepon</th>
                <th className="th">Email</th>
                <th className="th">Preferensi</th>
                {canManage && <th className="th">Ubah</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="td whitespace-nowrap text-xs">
                    <span className="font-mono">{c.customerNumber}</span>{" "}
                    <span className="font-medium">{c.name}</span>
                  </td>
                  <td className="td whitespace-nowrap text-xs">{c.phone}</td>
                  <td className="td whitespace-nowrap text-xs">{c.email ?? "-"}</td>
                  <td className="td">
                    <Badge value={c.notifyChannel} label={statusLabel(c.notifyChannel)} />
                  </td>
                  {canManage && (
                    <td className="td">
                      <form action={setCustomerChannelAction} className="flex items-center gap-1">
                        <input type="hidden" name="customerId" value={c.id} />
                        <select name="channel" className="input px-1 py-0.5 text-xs" defaultValue={c.notifyChannel}>
                          {CUSTOMER_CHANNELS.map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                        <button type="submit" className="text-xs text-brand-600 hover:underline">Simpan</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <TableControls basePath="/channels/preferences" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />
    </div>
  );
}
