import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { MasterCrud } from "../master-crud";

export const metadata = { title: "Kategori" };

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.MASTER_DATA_VIEW);
  const sp = await searchParams;

  const rows = await db.category.findMany({ orderBy: { code: "asc" } });
  const editRow = sp.edit ? (rows.find((r) => r.id === sp.edit) ?? null) : null;

  return (
    <MasterCrud
      entity="categories"
      title="Kategori Pengeluaran"
      subtitle="Kategori wajib pada setiap expense (PRD §23). Tipe: EXPENSE."
      rows={rows}
      editRow={editRow}
      canManage={user.permissions.has(PERMISSIONS.MASTER_DATA_MANAGE)}
      flash={sp}
    />
  );
}
