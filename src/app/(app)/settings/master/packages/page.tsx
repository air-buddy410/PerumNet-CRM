import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatRupiah } from "@/lib/constants";
import { MasterCrud, type MasterRow } from "../master-crud";
import { parseTableQuery, type TableSearchParams } from "@/components/table-controls";

export const metadata = { title: "Paket Internet" };

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.MASTER_DATA_VIEW);
  const sp = await searchParams;
  const tableOptions = [
    { value: "monthlyPrice", label: "Harga/bulan" },
    { value: "code", label: "Kode" },
    { value: "name", label: "Nama" },
  ] as const;
  const table = parseTableQuery(sp, { defaultSort: "monthlyPrice", defaultDirection: "asc", sortOptions: tableOptions });
  const orderBy: Prisma.PackageOrderByWithRelationInput[] = [{ [table.sort]: table.direction }, { id: "asc" }];

  const [packages, total, editPackage] = await Promise.all([
    db.package.findMany({ orderBy, skip: (table.page - 1) * table.pageSize, take: table.pageSize }),
    db.package.count(),
    table.query.edit ? db.package.findUnique({ where: { id: table.query.edit } }) : Promise.resolve(null),
  ]);
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
  const editRow: MasterRow | null = editPackage ? {
    id: editPackage.id,
    code: editPackage.code,
    name: editPackage.name,
    description: editPackage.description,
    isActive: editPackage.isActive,
    extraCols: [
      `${editPackage.downloadMbps}/${editPackage.uploadMbps} Mbps`,
      formatRupiah(editPackage.monthlyPrice),
      formatRupiah(editPackage.installationFee),
    ],
    extraFields: {
      downloadMbps: editPackage.downloadMbps,
      uploadMbps: editPackage.uploadMbps,
      monthlyPrice: Number(editPackage.monthlyPrice),
      installationFee: Number(editPackage.installationFee),
    },
  } : null;

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
      flash={table.query}
      table={{ ...table, sortOptions: tableOptions, total }}
    />
  );
}
