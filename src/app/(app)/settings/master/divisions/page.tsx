import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { MasterCrud } from "../master-crud";

export const metadata = { title: "Divisi" };

export default async function DivisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.MASTER_DATA_VIEW);
  const sp = await searchParams;

  const rows = await db.division.findMany({ orderBy: { name: "asc" } });
  const editRow = sp.edit ? (rows.find((r) => r.id === sp.edit) ?? null) : null;

  return (
    <MasterCrud
      entity="divisions"
      title="Divisi"
      subtitle="Struktur organisasi: staff → supervisor → owner. Supervisor divisi menyetujui pengajuan staff divisinya."
      rows={rows}
      editRow={editRow}
      canManage={user.permissions.has(PERMISSIONS.MASTER_DATA_MANAGE)}
      flash={sp}
    />
  );
}
