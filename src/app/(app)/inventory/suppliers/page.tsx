import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PageHeader, Flash, ActiveBadge, EmptyState } from "@/components/ui";
import {
  buildTableHref,
  parseTableQuery,
  SortableTableHeader,
  TableControls,
  type TableSearchParams,
  type TableSortOption,
} from "@/components/table-controls";
import { saveSupplierAction, toggleSupplierAction } from "../actions";

export const metadata = { title: "Pemasok" };

const sortOptions: readonly TableSortOption[] = [
  { value: "code", label: "Kode" },
  { value: "name", label: "Nama" },
  { value: "isActive", label: "Status" },
];

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.ITEMS_MANAGE);
  const sp = await searchParams;
  const table = parseTableQuery(sp, {
    defaultSort: "code",
    defaultDirection: "asc",
    sortOptions,
  });
  const orderBy: Prisma.SupplierOrderByWithRelationInput[] = table.sort === "name"
    ? [{ name: table.direction }, { code: "asc" }, { id: "asc" }]
    : table.sort === "isActive"
      ? [{ isActive: table.direction }, { name: "asc" }, { id: "asc" }]
      : [{ code: table.direction }, { id: "asc" }];

  const canManage = user.permissions.has(PERMISSIONS.ITEMS_MANAGE);
  const [suppliers, total, editRow] = await Promise.all([
    db.supplier.findMany({
      orderBy,
      include: { _count: { select: { items: true } } },
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.supplier.count(),
    table.query.edit
      ? db.supplier.findUnique({ where: { id: table.query.edit } })
      : Promise.resolve(null),
  ]);

  return (
    <div>
      <PageHeader
        title="Pemasok"
        subtitle="Lihat kontak pemasok material dan item yang terhubung."
        action={
          <Link href="/inventory/items/import" className="btn-secondary">
            Impor Katalog
          </Link>
        }
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="crm-list-column">
        <div className="card overflow-x-auto">
          {suppliers.length === 0 ? (
            <EmptyState message="Belum ada pemasok. Pemasok dibuat melalui Impor Katalog." />
          ) : (
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">
                    <SortableTableHeader
                      basePath="/inventory/suppliers"
                      currentDirection={table.direction}
                      currentSort={table.sort}
                      label="Kode"
                      query={table.query}
                      sortKey="code"
                    />
                  </th>
                  <th className="th">
                    <SortableTableHeader
                      basePath="/inventory/suppliers"
                      currentDirection={table.direction}
                      currentSort={table.sort}
                      label="Nama"
                      query={table.query}
                      sortKey="name"
                    />
                  </th>
                  <th className="th">Kontak</th>
                  <th className="th">Website</th>
                  <th className="th">Item Terhubung</th>
                  <th className="th">
                    <SortableTableHeader
                      basePath="/inventory/suppliers"
                      currentDirection={table.direction}
                      currentSort={table.sort}
                      label="Status"
                      query={table.query}
                      sortKey="isActive"
                    />
                  </th>
                  {canManage && <th className="th"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suppliers.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-slate-50">
                    <td className="td whitespace-nowrap font-mono text-xs">{supplier.code}</td>
                    <td className="td">
                      <div className="min-w-[13rem]">
                        <p className="m-0 font-medium">{supplier.name}</p>
                        {supplier.address && <p className="m-0 max-w-[20rem] text-xs text-slate-500">{supplier.address}</p>}
                        {supplier.notes && <p className="m-0 max-w-[20rem] text-xs text-slate-500">{supplier.notes}</p>}
                      </div>
                    </td>
                    <td className="td">
                      <div className="min-w-[12rem] text-xs">
                        <p className="m-0">{supplier.phone ?? "—"}</p>
                        <p className="m-0">{supplier.email ?? "—"}</p>
                      </div>
                    </td>
                    <td className="td max-w-[15rem] text-xs">{supplier.website ?? "—"}</td>
                    <td className="td">{supplier._count.items}</td>
                    <td className="td"><ActiveBadge isActive={supplier.isActive} /></td>
                    {canManage && (
                      <td className="td whitespace-nowrap text-right text-xs">
                        <Link
                          href={buildTableHref("/inventory/suppliers", table.query, { edit: supplier.id })}
                          className="text-brand-600 hover:underline"
                        >
                          Ubah
                        </Link>
                        <form action={toggleSupplierAction} className="ml-3 inline">
                          <input type="hidden" name="id" value={supplier.id} />
                          <button type="submit" className="text-slate-500 hover:underline">
                            {supplier.isActive ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <TableControls
          basePath="/inventory/suppliers"
          direction={table.direction}
          page={table.page}
          pageSize={table.pageSize}
          query={table.query}
          sort={table.sort}
          sortOptions={sortOptions}
          total={total}
        />

        <div className="card p-4 text-xs text-slate-500">
          Pemasok dapat ditambahkan dari form di samping tabel atau dilengkapi melalui
          Impor Katalog. Pemasok yang pernah dipakai dinonaktifkan, bukan dihapus, agar
          riwayat pembelian tetap utuh.
        </div>
      </div>

        {canManage && (
          <div className="card h-fit min-w-0 p-5">
            <h2 className="mb-1 font-medium">{editRow ? `Ubah: ${editRow.code}` : "Pemasok baru"}</h2>
            <p className="mb-4 text-xs leading-relaxed text-slate-500">
              Kode pemasok harus unik. Data ini menjadi sumber vendor material, bukan merek perangkat.
            </p>
            <form action={saveSupplierAction} className="space-y-3">
              {editRow && <input type="hidden" name="id" value={editRow.id} />}
              <div>
                <label className="label" htmlFor="supplier-code">Kode</label>
                <input id="supplier-code" name="code" className="input" defaultValue={editRow?.code ?? ""} required />
              </div>
              <div>
                <label className="label" htmlFor="supplier-name">Nama</label>
                <input id="supplier-name" name="name" className="input" defaultValue={editRow?.name ?? ""} required />
              </div>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div>
                  <label className="label" htmlFor="supplier-phone">Telepon</label>
                  <input id="supplier-phone" name="phone" className="input" defaultValue={editRow?.phone ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="supplier-email">Email</label>
                  <input id="supplier-email" name="email" type="email" className="input" defaultValue={editRow?.email ?? ""} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="supplier-address">Alamat</label>
                <textarea id="supplier-address" name="address" rows={2} className="input" defaultValue={editRow?.address ?? ""} />
              </div>
              <div>
                <label className="label" htmlFor="supplier-website">Website</label>
                <input id="supplier-website" name="website" type="url" className="input" defaultValue={editRow?.website ?? ""} placeholder="https://" />
              </div>
              <div>
                <label className="label" htmlFor="supplier-notes">Catatan</label>
                <textarea id="supplier-notes" name="notes" rows={3} className="input" defaultValue={editRow?.notes ?? ""} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn-primary">{editRow ? "Simpan perubahan" : "Tambah pemasok"}</button>
                {editRow && <Link href="/inventory/suppliers" className="btn-secondary">Batal</Link>}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
