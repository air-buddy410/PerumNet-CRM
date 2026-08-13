import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { MasterCrud } from "../master-crud";
import { parseTableQuery, type TableSearchParams } from "@/components/table-controls";

export const metadata = { title: "Area" };

export default async function AreasPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.MASTER_DATA_VIEW);
  const sp = await searchParams;
  const tableOptions = [{ value: "code", label: "Kode" }, { value: "name", label: "Nama" }] as const;
  const table = parseTableQuery(sp, { defaultSort: "code", defaultDirection: "asc", sortOptions: tableOptions });
  const orderBy: Prisma.AreaOrderByWithRelationInput[] = [{ [table.sort]: table.direction }, { id: "asc" }];

  const [rows, total, editRow] = await Promise.all([
    db.area.findMany({ orderBy, skip: (table.page - 1) * table.pageSize, take: table.pageSize }),
    db.area.count(),
    table.query.edit ? db.area.findUnique({ where: { id: table.query.edit } }) : Promise.resolve(null),
  ]);

  return (
    <MasterCrud
      entity="areas"
      title="Area Layanan"
      subtitle="Area pemasaran & operasional (lead, customer, POP)."
      rows={rows}
      editRow={editRow}
      canManage={user.permissions.has(PERMISSIONS.MASTER_DATA_MANAGE)}
      flash={table.query}
      table={{ ...table, sortOptions: tableOptions, total }}
    />
  );
}
