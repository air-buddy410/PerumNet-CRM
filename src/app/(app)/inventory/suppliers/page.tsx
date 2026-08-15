import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PageHeader, Flash, ActiveBadge, EmptyState } from "@/components/ui";
import {
  parseTableQuery,
  SortableTableHeader,
  TableControls,
  type TableSearchParams,
  type TableSortOption,
} from "@/components/table-controls";

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
  await requirePermission(PERMISSIONS.ITEMS_MANAGE);
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

  const [suppliers, total] = await Promise.all([
    db.supplier.findMany({
      orderBy,
      include: { _count: { select: { items: true } } },
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.supplier.count(),
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
          Pemasok pada halaman ini bersumber dari Impor Katalog. Form tambah, ubah, dan
          nonaktifkan akan diaktifkan setelah action master pemasok resmi tersedia.
        </div>
      </div>
    </div>
  );
}
