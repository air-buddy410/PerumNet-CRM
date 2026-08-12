import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, RECOVERY_DECISIONS, statusLabel } from "@/lib/constants";
import { isOverdue } from "@/lib/recovery";
import { PageHeader, BackLink, EmptyState } from "@/components/ui";

export const metadata = { title: "Laporan Penarikan Perangkat" };

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default async function RecoveryReportPage() {
  await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const now = new Date();

  const [recoveries, items] = await Promise.all([
    db.deviceRecoveryIssue.findMany({
      select: { id: true, status: true, slaDueAt: true, createdAt: true, completedAt: true },
    }),
    db.deviceRecoveryItem.findMany({
      select: {
        status: true,
        finalDecision: true,
        snapshotSerial: true,
        actualSerial: true,
        pickedUpAt: true,
        receivedAt: true,
      },
    }),
  ]);

  const totalItems = items.length;
  const recovered = items.filter((i) => ["RECEIVED", "INSPECTED"].includes(i.status)).length;
  const notReturned = items.filter((i) => i.status === "NOT_RETURNED").length;

  // Tingkat keberhasilan dihitung atas perangkat yang kasusnya SUDAH selesai.
  // Memasukkan yang masih berjalan akan menekan angka secara palsu — sebuah
  // penarikan yang baru dibuat kemarin bukan kegagalan.
  const settled = recovered + notReturned;
  const recoveryRate = settled ? Math.round((recovered / settled) * 100) : null;

  const mismatched = items.filter(
    (i) => i.actualSerial && i.actualSerial !== i.snapshotSerial
  ).length;

  const overdue = recoveries.filter((r) => isOverdue(r, now)).length;

  const closed = recoveries.filter((r) => r.completedAt);
  const avgDays = closed.length
    ? (
        closed.reduce(
          (sum, r) => sum + (r.completedAt!.getTime() - r.createdAt.getTime()) / 86_400_000,
          0
        ) / closed.length
      ).toFixed(1)
    : null;

  const byDecision = RECOVERY_DECISIONS.map(([code, label]) => ({
    code,
    label,
    count: items.filter((i) => i.finalDecision === code).length,
  })).filter((d) => d.count > 0);

  return (
    <div>
      <BackLink href="/inventory/device-recoveries" label="Kembali ke daftar penarikan" />
      <PageHeader
        title="Laporan Penarikan Perangkat"
        subtitle="Ringkasan kinerja proses penarikan perangkat."
        action={
          <Link href="/api/export/device-recoveries" className="btn-secondary">
            Export CSV
          </Link>
        }
      />

      {totalItems === 0 ? (
        <EmptyState message="Belum ada data penarikan untuk dilaporkan." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Tingkat keberhasilan"
              value={recoveryRate === null ? "—" : `${recoveryRate}%`}
              hint={`${recovered} kembali dari ${settled} kasus selesai`}
            />
            <Kpi
              label="Rata-rata penyelesaian"
              value={avgDays === null ? "—" : `${avgDays} hari`}
              hint={`${closed.length} penarikan tuntas`}
            />
            <Kpi
              label="Melewati SLA"
              value={String(overdue)}
              hint="masih berjalan dan sudah lewat batas"
            />
            <Kpi
              label="Serial tidak cocok"
              value={String(mismatched)}
              hint="perangkat di lapangan berbeda dari catatan"
            />
          </div>

          <div className="card mt-6">
            <div className="border-b border-slate-100 px-5 py-4 font-medium">
              Keputusan Akhir Perangkat
            </div>
            {byDecision.length === 0 ? (
              <EmptyState message="Belum ada perangkat yang diputuskan." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="th">Keputusan</th>
                    <th className="th">Jumlah</th>
                    <th className="th">Porsi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {byDecision.map((d) => (
                    <tr key={d.code}>
                      <td className="td text-sm">{d.label}</td>
                      <td className="td text-sm">{d.count}</td>
                      <td className="td text-sm">
                        {Math.round((d.count / totalItems) * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card mt-6">
            <div className="border-b border-slate-100 px-5 py-4 font-medium">
              Perangkat Menurut Tahap
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">Tahap</th>
                  <th className="th">Jumlah</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {["RECOVERY_PENDING", "PICKED_UP", "RECEIVED", "INSPECTED", "NOT_RETURNED"].map(
                  (s) => (
                    <tr key={s}>
                      <td className="td text-sm">{statusLabel(s)}</td>
                      <td className="td text-sm">
                        {items.filter((i) => i.status === s).length}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
