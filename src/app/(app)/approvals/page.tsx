import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  APPROVAL_STATUS,
  APPROVAL_MODULES,
  formatRupiah,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { isEligibleApprover } from "@/lib/approval";

export const metadata = { title: "Approval Request" };

function moduleName(code: string) {
  return APPROVAL_MODULES.find((m) => m.code === code)?.name ?? code;
}

export default async function ApprovalsPage() {
  const user = await requirePermission(PERMISSIONS.APPROVALS_VIEW);

  const [pending, mine, recent] = await Promise.all([
    db.approvalRequest.findMany({
      where: {
        status: APPROVAL_STATUS.PENDING,
        requestedById: { not: user.id },
      },
      include: { requestedBy: true, steps: true },
      orderBy: { createdAt: "desc" },
    }),
    db.approvalRequest.findMany({
      where: { requestedById: user.id },
      include: { requestedBy: true, steps: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    db.approvalRequest.findMany({
      include: { requestedBy: true, steps: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  // "Menunggu keputusan saya": step aktif dapat diputus oleh saya
  // (role fungsional, supervisor divisi pengaju, atau owner), dan saya
  // belum memutus step lain pada request yang sama.
  const actionable = pending.filter((r) => {
    const current = r.steps.find((s) => s.stepOrder === r.currentStep);
    if (!current || current.status !== "PENDING") return false;
    if (r.steps.some((s) => s.actedById === user.id)) return false;
    return isEligibleApprover(user, current);
  });

  const Table = ({ rows }: { rows: typeof mine }) =>
    rows.length === 0 ? (
      <EmptyState message="Tidak ada data." />
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-100 bg-slate-50/60">
            <tr>
              <th className="th">Nomor</th>
              <th className="th">Judul</th>
              <th className="th">Modul</th>
              <th className="th">Nilai</th>
              <th className="th">Pengaju</th>
              <th className="th">Step</th>
              <th className="th">Status</th>
              <th className="th">Tanggal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="td">
                  <Link href={`/approvals/${r.id}`} className="font-medium text-brand-600 hover:underline">
                    {r.requestNumber}
                  </Link>
                </td>
                <td className="td">{r.title}</td>
                <td className="td">
                  {moduleName(r.module)}
                  {r.subtype ? ` — ${r.subtype}` : ""}
                </td>
                <td className="td">{formatRupiah(r.amount)}</td>
                <td className="td">{r.requestedBy.name}</td>
                <td className="td">
                  {r.status === "PENDING"
                    ? `${r.currentStep} / ${r.steps.length}`
                    : `${r.steps.filter((s) => s.status !== "PENDING").length} / ${r.steps.length}`}
                </td>
                <td className="td">
                  <Badge value={r.status} />
                </td>
                <td className="td whitespace-nowrap text-slate-500">
                  {formatDateTime(r.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <div>
      <PageHeader
        title="Approval Request"
        subtitle="Semua pengajuan yang memerlukan persetujuan"
        action={
          <Link href="/approvals/new" className="btn-primary">
            + Ajukan Request
          </Link>
        }
      />

      <div className="space-y-6">
        <section className="card">
          <div className="border-b border-slate-100 px-5 py-4 font-medium">
            Menunggu Keputusan Saya ({actionable.length})
          </div>
          <Table rows={actionable} />
        </section>

        <section className="card">
          <div className="border-b border-slate-100 px-5 py-4 font-medium">
            Pengajuan Saya
          </div>
          <Table rows={mine} />
        </section>

        <section className="card">
          <div className="border-b border-slate-100 px-5 py-4 font-medium">
            Riwayat Terbaru
          </div>
          <Table rows={recent} />
        </section>
      </div>
    </div>
  );
}
