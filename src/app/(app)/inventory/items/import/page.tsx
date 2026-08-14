import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { BackLink, PageHeader } from "@/components/ui";
import { ItemCatalogImportWorkbench } from "@/components/item-catalog-import-workbench";

export const metadata = { title: "Impor Katalog Material" };

export default async function ItemCatalogImportPage() {
  const user = await requirePermission(PERMISSIONS.ITEMS_MANAGE);
  const warehouses = await db.warehouse.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
  const canPostOpeningBalance =
    user.permissions.has(PERMISSIONS.STOCK_CREATE) && user.permissions.has(PERMISSIONS.STOCK_POST);

  return (
    <div className="crm-page max-w-7xl">
      <BackLink href="/inventory/items" label="Kembali ke Item Master" />
      <PageHeader
        title="Impor Katalog Material"
        subtitle="Pratinjau kategori, vendor, material, dan saldo awal sebelum katalog diterapkan ke gudang."
        action={<Link href="/inventory/items" className="btn-secondary">Item Master</Link>}
      />
      <ItemCatalogImportWorkbench
        warehouses={warehouses}
        canPostOpeningBalance={canPostOpeningBalance}
      />
    </div>
  );
}
