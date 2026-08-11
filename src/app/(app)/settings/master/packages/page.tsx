import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatRupiah } from "@/lib/constants";
import { MasterCrud, type MasterRow } from "../master-crud";

export const metadata = { title: "Paket Internet" };

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.MASTER_DATA_VIEW);
  const sp = await searchParams;

  const packages = await db.package.findMany({ orderBy: { monthlyPrice: "asc" } });
  const rows: MasterRow[] = packages.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    isActive: p.isActive,
    extraCols: [
      `${p.downloadMbps}/${p.uploadMbps} Mbps`,
      formatRupiah(p.monthlyPrice),
      formatRupiah(p.installationFee),
    ],
    extraFields: {
      downloadMbps: p.downloadMbps,
      uploadMbps: p.uploadMbps,
      monthlyPrice: Number(p.monthlyPrice),
      installationFee: Number(p.installationFee),
    },
  }));
  const editRow = sp.edit ? (rows.find((r) => r.id === sp.edit) ?? null) : null;

  return (
    <MasterCrud
      entity="packages"
      title="Paket Internet"
      subtitle="Kelola paket layanan yang digunakan untuk quotation dan subscription."
      extraHeaders={["Kecepatan", "Harga/bulan", "Biaya Instalasi"]}
      rows={rows}
      editRow={editRow}
      canManage={user.permissions.has(PERMISSIONS.MASTER_DATA_MANAGE)}
      isPackage
      flash={sp}
    />
  );
}
