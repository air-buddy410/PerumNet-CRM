import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, LEAVE_TYPES, statusLabel, formatDateTime } from "@/lib/constants";
import { dayStart } from "@/lib/hrd";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { ClockInForm } from "../clock-in-form";
import { clockOutAction, submitLeaveAction, submitOvertimeAction } from "../actions";

export const metadata = { title: "Absensi Saya" };

export default async function MyAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.ATTENDANCE_SELF);
  const sp = await searchParams;

  const employee = await db.employee.findFirst({
    where: { userId: user.id, isActive: true },
    include: { supervisor: true },
  });

  if (!employee) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Absensi Saya" subtitle="Absen mandiri, jadwal, izin & lembur." />
        <Flash error="Akun Anda belum tertaut data karyawan — hubungi HRD untuk menautkannya." />
      </div>
    );
  }

  const today = dayStart(new Date());
  const monthFrom = new Date(today.getFullYear(), today.getMonth(), 1);
  const [todayAtt, todaySchedule, recent, myLeaves, myOvertimes] = await Promise.all([
    db.attendance.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: today } },
      include: { clockInLocation: true, shift: true },
    }),
    db.shiftSchedule.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: today } },
      include: { shift: true },
    }),
    db.attendance.findMany({
      where: { employeeId: employee.id, date: { gte: monthFrom } },
      orderBy: { date: "desc" },
      take: 31,
    }),
    db.leaveRequest.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.overtimeRequest.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Absensi Saya"
        subtitle={`${employee.employeeNo} · ${employee.fullName}${employee.supervisor ? ` · atasan ${employee.supervisor.fullName}` : ""}${todaySchedule?.shift ? ` · shift hari ini ${todaySchedule.shift.name} ${todaySchedule.shift.startTime}–${todaySchedule.shift.endTime}` : ""}`}
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <div className="card overflow-x-auto">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-medium">Absensi Bulan Ini</h2>
            {recent.length === 0 ? (
              <EmptyState message="Belum ada absensi bulan ini." />
            ) : (
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="th">Tanggal</th>
                    <th className="th">Masuk</th>
                    <th className="th">Pulang</th>
                    <th className="th">Terlambat</th>
                    <th className="th">Kerja</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recent.map((r) => (
                    <tr key={r.id}>
                      <td className="td whitespace-nowrap text-xs">{formatDateTime(r.date).split(",")[0]}</td>
                      <td className="td whitespace-nowrap text-xs">{r.clockInAt ? formatDateTime(r.clockInAt).split(", ")[1] : "-"}</td>
                      <td className="td whitespace-nowrap text-xs">{r.clockOutAt ? formatDateTime(r.clockOutAt).split(", ")[1] : "-"}</td>
                      <td className="td whitespace-nowrap text-xs">{r.lateMinutes > 0 ? `${r.lateMinutes} mnt` : "-"}</td>
                      <td className="td whitespace-nowrap text-xs">{r.workMinutes > 0 ? `${r.workMinutes} mnt` : "-"}</td>
                      <td className="td"><Badge value={r.status} label={statusLabel(r.status)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Ajukan Izin / Cuti</h2>
              <form action={submitLeaveAction} className="space-y-3">
                <select name="type" className="input" required defaultValue="ANNUAL">
                  {LEAVE_TYPES.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input name="startDate" type="date" className="input" required />
                  <input name="endDate" type="date" className="input" required />
                </div>
                <textarea name="reason" rows={2} className="input" placeholder="Alasan (wajib)" required />
                <button type="submit" className="btn-secondary w-full justify-center">Ajukan</button>
              </form>
              {myLeaves.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs">
                  {myLeaves.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-2">
                      <span className="font-mono">{l.requestNumber}</span>
                      <span>{l.days} hari</span>
                      <Badge value={l.status} label={statusLabel(l.status)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Ajukan Lembur</h2>
              <form action={submitOvertimeAction} className="space-y-3">
                <input name="date" type="date" className="input" required />
                <div className="grid grid-cols-2 gap-2">
                  <input name="startTime" className="input" placeholder="18:00" required />
                  <input name="endTime" className="input" placeholder="21:00" required />
                </div>
                <textarea name="reason" rows={2} className="input" placeholder="Alasan (wajib)" required />
                <button type="submit" className="btn-secondary w-full justify-center">Ajukan</button>
              </form>
              {myOvertimes.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs">
                  {myOvertimes.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2">
                      <span className="font-mono">{o.requestNumber}</span>
                      <span>{o.minutes} mnt</span>
                      <Badge value={o.status} label={statusLabel(o.status)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="card h-fit p-5">
          <h2 className="mb-1 font-medium">Absen Hari Ini</h2>
          <p className="mb-3 text-xs text-slate-500">
            Absen masuk memerlukan lokasi — Anda harus berada dalam radius titik absen.
          </p>
          {todaySchedule && todaySchedule.dayType !== "WORK" ? (
            <p className="text-sm text-slate-500">
              Hari ini dijadwalkan <strong>{statusLabel(todaySchedule.dayType)}</strong> — absen tidak diperlukan.
            </p>
          ) : !todayAtt?.clockInAt ? (
            <ClockInForm />
          ) : (
            <div className="space-y-3 text-sm">
              <p>
                Masuk <strong>{formatDateTime(todayAtt.clockInAt).split(", ")[1]}</strong>
                {todayAtt.clockInLocation && (
                  <span className="block text-xs text-slate-500">
                    {todayAtt.clockInLocation.name} · {todayAtt.clockInDistanceM} m dari titik
                  </span>
                )}
                {todayAtt.lateMinutes > 0 && (
                  <span className="block text-xs font-semibold text-amber-700">
                    Terlambat {todayAtt.lateMinutes} menit
                  </span>
                )}
              </p>
              {todayAtt.clockOutAt ? (
                <p>
                  Pulang <strong>{formatDateTime(todayAtt.clockOutAt).split(", ")[1]}</strong>
                  <span className="block text-xs text-slate-500">{todayAtt.workMinutes} menit kerja</span>
                </p>
              ) : (
                <form action={clockOutAction}>
                  <button type="submit" className="btn-primary w-full justify-center">Absen Pulang</button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
