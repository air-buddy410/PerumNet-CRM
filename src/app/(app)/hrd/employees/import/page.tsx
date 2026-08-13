import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { BackLink, PageHeader } from "@/components/ui";
import { EmployeeImportWorkbench } from "@/components/employee-import-workbench";

export const metadata = { title: "Impor Karyawan" };

export default async function EmployeeImportPage() {
  await requirePermission(PERMISSIONS.HRD_MANAGE);

  return (
    <div className="crm-page max-w-6xl">
      <BackLink href="/hrd/employees" label="Kembali ke daftar karyawan" />
      <PageHeader
        title="Impor Karyawan"
        subtitle="Pratinjau data Excel terlebih dahulu sebelum karyawan baru dibuat ke dalam sistem."
        action={<Link href="/hrd/employees" className="btn-secondary">Daftar karyawan</Link>}
      />
      <EmployeeImportWorkbench />
    </div>
  );
}
