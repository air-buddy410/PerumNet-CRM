import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { MasterCrud } from "../master-crud";
import { parseTableQuery, type TableSearchParams } from "@/components/table-controls";

export const metadata = { title: "Divisi" };

export default async function DivisionsPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.MASTER_DATA_VIEW);
  const sp = await searchParams;
  const tableOptions = [{ value: "name", label: "Nama" }, { value: "code", label: "Kode" }] as const;
  const table = parseTableQuery(sp, { defaultSort: "name", defaultDirection: "asc", sortOptions: tableOptions });
  const orderBy: Prisma.DivisionOrderByWithRelationInput[] = [{ [table.sort]: table.direction }, { id: "asc" }];

  const [rows, total, editRow] = await Promise.all([
    db.division.findMany({ orderBy, skip: (table.page - 1) * table.pageSize, take: table.pageSize }),
    db.division.count(),
    table.query.edit ? db.division.findUnique({ where: { id: table.query.edit } }) : Promise.resolve(null),
  ]);

  return (
    <MasterCrud
      entity="divisions"
      title="Divisi"
      subtitle="Struktur organisasi: staff → supervisor → owner. Supervisor divisi menyetujui pengajuan staff divisinya."
      rows={rows}
      editRow={editRow}
      canManage={user.permissions.has(PERMISSIONS.MASTER_DATA_MANAGE)}
      flash={table.query}
      table={{ ...table, sortOptions: tableOptions, total }}
    />
  );
}
