import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { MasterCrud } from "../master-crud";

export const metadata = { title: "Area" };

export default async function AreasPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.MASTER_DATA_VIEW);
  const sp = await searchParams;

  const rows = await db.area.findMany({ orderBy: { code: "asc" } });
  const editRow = sp.edit ? (rows.find((r) => r.id === sp.edit) ?? null) : null;

  return (
    <MasterCrud
      entity="areas"
      title="Area Layanan"
      subtitle="Area pemasaran & operasional (lead, customer, POP)."
      rows={rows}
      editRow={editRow}
      canManage={user.permissions.has(PERMISSIONS.MASTER_DATA_MANAGE)}
      flash={sp}
    />
  );
}
