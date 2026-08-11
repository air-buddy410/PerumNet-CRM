import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";

export const metadata = { title: "Deployments" };

export default async function DeploymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.IT_VIEW);
  const sp = await searchParams;
  const canCreate = user.permissions.has(PERMISSIONS.DEPLOYMENTS_CREATE);

  const deployments = await db.deployment.findMany({
    include: { application: true, createdBy: true, executedBy: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title="Deployment Management"
        subtitle="Deployment production memerlukan change record, rencana rollback, hasil testing, backup terverifikasi, dan persetujuan."
        action={
          canCreate ? (
            <Link href="/it/deployments/new" className="btn-primary">
              Deployment Baru
            </Link>
          ) : undefined
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="card overflow-x-auto">
        {deployments.length === 0 ? (
          <EmptyState message="Belum ada deployment." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Nomor</th>
                <th className="th">Aplikasi</th>
                <th className="th">Versi</th>
                <th className="th">Environment</th>
                <th className="th">Pembuat</th>
                <th className="th">Eksekutor</th>
                <th className="th">Selesai</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deployments.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="td font-mono text-xs">
                    <Link href={`/it/deployments/${d.id}`} className="text-brand-600 hover:underline">
                      {d.deployNumber}
                    </Link>
                  </td>
                  <td className="td font-medium">{d.application.name}</td>
                  <td className="td font-mono text-xs">{d.version}</td>
                  <td className="td">
                    <Badge value={d.environment} label={statusLabel(d.environment)} />
                    {d.environment === "PRODUCTION" && d.isMajor ? (
                      <span className="ml-1 text-xs text-slate-500">major</span>
                    ) : null}
                  </td>
                  <td className="td text-xs">{d.createdBy.name}</td>
                  <td className="td text-xs">{d.executedBy?.name ?? "-"}</td>
                  <td className="td text-xs">{d.finishedAt ? formatDateTime(d.finishedAt) : "-"}</td>
                  <td className="td"><Badge value={d.status} label={statusLabel(d.status)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
