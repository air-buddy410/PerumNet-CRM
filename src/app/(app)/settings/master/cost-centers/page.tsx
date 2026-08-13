import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { MasterCrud } from "../master-crud";
import { parseTableQuery, type TableSearchParams } from "@/components/table-controls";

export const metadata = { title: "Cost Centers" };

export default async function CostCentersPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.MASTER_DATA_VIEW);
  const sp = await searchParams;
  const tableOptions = [{ value: "code", label: "Kode" }, { value: "name", label: "Nama" }] as const;
  const table = parseTableQuery(sp, { defaultSort: "code", defaultDirection: "asc", sortOptions: tableOptions });
  const orderBy: Prisma.CostCenterOrderByWithRelationInput[] = [{ [table.sort]: table.direction }, { id: "asc" }];

  const [rows, total, editRow] = await Promise.all([
    db.costCenter.findMany({ orderBy, skip: (table.page - 1) * table.pageSize, take: table.pageSize }),
    db.costCenter.count(),
    table.query.edit ? db.costCenter.findUnique({ where: { id: table.query.edit } }) : Promise.resolve(null),
  ]);

  return (
    <MasterCrud
      entity="cost-centers"
      title="Cost Centers"
      subtitle="Setiap pengeluaran harus memiliki cost center. Data tidak dihapus, hanya dinonaktifkan."
      rows={rows}
      editRow={editRow}
      canManage={user.permissions.has(PERMISSIONS.MASTER_DATA_MANAGE)}
      flash={table.query}
      table={{ ...table, sortOptions: tableOptions, total }}
    />
  );
}
