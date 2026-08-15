import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { BackLink, PageHeader } from "@/components/ui";
import { CustomerImportWorkbench } from "@/components/customer-import-workbench";

export const metadata = { title: "Impor Pelanggan" };

export default async function CustomerImportPage() {
  await requirePermission(PERMISSIONS.CUSTOMERS_CREATE);
  await requirePermission(PERMISSIONS.SUBSCRIPTIONS_CREATE);

  return (
    <div className="crm-page max-w-7xl">
      <BackLink href="/crm/customers" label="Kembali ke daftar customer" />
      <PageHeader
        title="Impor Pelanggan"
        subtitle="Pratinjau pelanggan, subscription, dan ODP dari satu berkas sebelum data diterapkan."
        action={<Link href="/crm/customers" className="btn-secondary">Daftar customer</Link>}
      />
      <CustomerImportWorkbench />
    </div>
  );
}
