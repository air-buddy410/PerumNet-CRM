import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { BackLink, PageHeader } from "@/components/ui";
import { PemetaanImportWorkbench } from "@/components/pemetaan-import-workbench";

export const metadata = { title: "Impor Pemetaan" };

export default async function PemetaanImportPage() {
  await requirePermission(PERMISSIONS.FTTH_MANAGE);

  return (
    <div className="crm-page max-w-7xl">
      <BackLink href="/noc/ftth" label="Kembali ke FTTH" />
      <PageHeader
        title="Impor Pemetaan"
        subtitle="Periksa keputusan tautan PPPoE, port ODP, dan kapasitas sebelum diterapkan ke jaringan."
        action={<Link href="/noc/ftth" className="btn-secondary">FTTH (OLT/ODP)</Link>}
      />
      <PemetaanImportWorkbench />
    </div>
  );
}
