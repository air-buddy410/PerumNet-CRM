import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Badge, EmptyState, Flash } from "@/components/ui";

export const metadata = { title: "Surveys" };

export default async function SurveysPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.SURVEYS_VIEW);
  const sp = await searchParams;

  const surveys = await db.survey.findMany({
    include: { lead: true, customer: true, technician: true, package: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Survey Management"
        subtitle="Alur: Diajukan → Terjadwal → Selesai dengan hasil feasibility + foto bukti (PRD §10)."
        action={
          user.permissions.has(PERMISSIONS.SURVEYS_CREATE) ? (
            <Link href="/sales/surveys/new" className="btn-primary">+ Ajukan Survey</Link>
          ) : undefined
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="card overflow-x-auto">
        {surveys.length === 0 ? (
          <EmptyState message="Belum ada survey." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Nomor</th>
                <th className="th">Lead / Customer</th>
                <th className="th">Alamat</th>
                <th className="th">Paket</th>
                <th className="th">Jadwal</th>
                <th className="th">Teknisi</th>
                <th className="th">Feasibility</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {surveys.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="td">
                    <Link
                      href={`/sales/surveys/${s.id}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {s.surveyNumber}
                    </Link>
                  </td>
                  <td className="td">{s.lead?.name ?? s.customer?.name ?? "-"}</td>
                  <td className="td max-w-56 truncate text-xs">{s.address}</td>
                  <td className="td text-xs">{s.package?.name ?? "-"}</td>
                  <td className="td whitespace-nowrap text-xs">
                    {s.scheduledAt ? formatDateTime(s.scheduledAt) : "-"}
                  </td>
                  <td className="td text-xs">{s.technician?.name ?? "-"}</td>
                  <td className="td">
                    {s.feasibility ? (
                      <Badge value={s.feasibility} label={statusLabel(s.feasibility)} />
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="td">
                    <Badge value={s.status} label={statusLabel(s.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
