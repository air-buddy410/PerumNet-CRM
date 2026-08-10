import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { monthlyRecap } from "@/lib/hrd";
import { PageHeader, EmptyState } from "@/components/ui";

export const metadata = { title: "Rekap Bulanan" };

function hours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}j ${m}m`;
}

export default async function RecapPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requirePermission(PERMISSIONS.HRD_VIEW);
  const sp = await searchParams;
  const now = new Date();
  const period = sp.period ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const rows = await monthlyRecap(period);

  return (
    <div>
      <PageHeader
        title="Rekap Bulanan"
        subtitle={`Periode ${period} — hadir, terlambat, cuti/sakit, total jam kerja, dan lembur disetujui.`}
      />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="period">Periode</label>
          <input id="period" name="period" type="month" className="input" defaultValue={period} />
        </div>
        <button type="submit" className="btn-secondary">Tampilkan</button>
      </form>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState message="Belum ada karyawan aktif / periode tidak valid." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">NIK</th>
                <th className="th">Nama</th>
                <th className="th">Hadir</th>
                <th className="th">Terlambat</th>
                <th className="th">Cuti</th>
                <th className="th">Sakit</th>
                <th className="th">Alpa</th>
                <th className="th">Total Jam Kerja</th>
                <th className="th">Total Terlambat</th>
                <th className="th">Lembur</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.employeeId} className="hover:bg-slate-50">
                  <td className="td whitespace-nowrap font-mono text-xs">{r.employeeNo}</td>
                  <td className="td whitespace-nowrap text-xs font-medium">{r.fullName}</td>
                  <td className="td">{r.present}</td>
                  <td className="td">{r.late > 0 ? <span className="font-semibold text-amber-700">{r.late}</span> : 0}</td>
                  <td className="td">{r.leave}</td>
                  <td className="td">{r.sick}</td>
                  <td className="td">{r.absent > 0 ? <span className="font-semibold text-red-600">{r.absent}</span> : 0}</td>
                  <td className="td whitespace-nowrap text-xs">{hours(r.totalWorkMinutes)}</td>
                  <td className="td whitespace-nowrap text-xs">{r.totalLateMinutes} mnt</td>
                  <td className="td whitespace-nowrap text-xs">{hours(r.overtimeMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
