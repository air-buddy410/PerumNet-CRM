import Link from "next/link";
import { PageHeader, BackLink } from "@/components/ui";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { loadStatusSistem } from "@/lib/system-status-service";
import { SystemStatusSummaryCard, SystemStatusView } from "@/components/system-status-view";

export const metadata = { title: "Status Sistem" };
export const dynamic = "force-dynamic";

export default async function SystemStatusPage() {
  await requirePermission(PERMISSIONS.NOC_VIEW);
  let status: Awaited<ReturnType<typeof loadStatusSistem>> | null = null;
  try {
    status = await loadStatusSistem();
  } catch {
    // Jangan tampilkan framework error kepada operator ketika sumber status sementara gagal.
  }

  return (
    <div className="max-w-6xl">
      <BackLink href="/dashboard" label="Kembali ke dashboard" />
      <PageHeader
        title="Status Sistem"
        subtitle="Ringkasan kesehatan worker, router, antrean, LibreNMS, dan jaringan FTTH."
        action={
          <Link href="/settings/status" prefetch={false} className="btn-secondary whitespace-nowrap">
            Segarkan
          </Link>
        }
      />
      {status ? <SystemStatusView status={status} /> : <SystemStatusSummaryCard status={null} canOpen />}
    </div>
  );
}
