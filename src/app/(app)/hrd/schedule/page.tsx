import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, DAY_TYPES } from "@/lib/constants";
import { PageHeader, Flash, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";
import { saveScheduleAction } from "../actions";

export const metadata = { title: "Jadwal Shift" };

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams & { ok?: string; error?: string; period?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.HRD_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.HRD_MANAGE);

  const now = new Date();
  const period = sp.period ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [y, m] = period.split("-").map(Number);
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 0);
  const daysInMonth = to.getDate();
  const sortOptions: readonly TableSortOption[] = [
    { value: "employeeNo", label: "NIK" },
    { value: "fullName", label: "Nama" },
  ];
  const table = parseTableQuery(sp, { defaultSort: "employeeNo", defaultDirection: "asc", sortOptions });
  const orderBy = table.sort === "fullName" ? [{ fullName: table.direction }, { id: "asc" as const }] : [{ employeeNo: table.direction }, { id: "asc" as const }];

  const employeeWhere = { isActive: true };
  const [employees, employeeCount, employeesForForm, shifts] = await Promise.all([
    db.employee.findMany({ where: employeeWhere, orderBy, skip: (table.page - 1) * table.pageSize, take: table.pageSize }),
    db.employee.count({ where: employeeWhere }),
    canManage ? db.employee.findMany({ where: employeeWhere, orderBy: { employeeNo: "asc" } }) : Promise.resolve([]),
    db.shift.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const schedules = await db.shiftSchedule.findMany({
    where: {
      employeeId: { in: employees.map((employee) => employee.id) },
      date: { gte: from, lte: new Date(y, m - 1, daysInMonth, 23, 59, 59) },
    },
    include: { shift: true },
  });
  const scheduleByCell = new Map(schedules.map((schedule) => [
    `${schedule.employeeId}:${schedule.date.getDate()}`,
    schedule,
  ]));
  const cell = (empId: string, day: number) => scheduleByCell.get(`${empId}:${day}`);

  return (
    <div>
      <PageHeader
        title="Jadwal Shift"
        subtitle="Grid karyawan × tanggal sebulan penuh. Hari kerja wajib punya shift; jadwal menentukan perhitungan keterlambatan."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="period">Periode</label>
          <input id="period" name="period" type="month" className="input" defaultValue={period} />
        </div>
        <button type="submit" className="btn-secondary">Tampilkan</button>
      </form>

      <div className="card overflow-x-auto">
        {employees.length === 0 ? (
          <EmptyState message="Belum ada karyawan aktif." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th sticky left-0 bg-slate-50">
                  <SortableTableHeader basePath="/hrd/schedule" currentDirection={table.direction} currentSort={table.sort} label="Karyawan" query={{ ...table.query, period }} sortKey="employeeNo" />
                </th>
                {Array.from({ length: daysInMonth }, (_, i) => (
                  <th key={i} className="th text-center">{i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((e) => (
                <tr key={e.id}>
                  <td className="td sticky left-0 whitespace-nowrap bg-white text-xs font-medium">
                    <span className="font-mono">{e.employeeNo}</span> {e.fullName}
                  </td>
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const s = cell(e.id, i + 1);
                    return (
                      <td key={i} className="td text-center text-[10px]">
                        {s
                          ? s.dayType === "WORK"
                            ? (s.shift?.name.slice(0, 2) ?? "K")
                            : s.dayType === "OFF"
                              ? "—"
                              : "L"
                          : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <TableControls
        basePath="/hrd/schedule"
        direction={table.direction}
        page={table.page}
        pageSize={table.pageSize}
        query={{ ...table.query, period }}
        sort={table.sort}
        sortOptions={sortOptions}
        total={employeeCount}
      />
      <p className="mt-2 text-xs text-slate-500">
        Keterangan: dua huruf pertama nama shift = hari kerja · &ldquo;—&rdquo; libur · &ldquo;L&rdquo; hari besar.
      </p>

      {canManage && (
        <div className="card mt-6 p-5">
          <h2 className="mb-3 font-medium">Atur Jadwal</h2>
          <form action={saveScheduleAction} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label" htmlFor="employeeId">Karyawan</label>
              <select id="employeeId" name="employeeId" className="input w-56" required defaultValue="">
                <option value="" disabled>— pilih —</option>
                {employeesForForm.map((e) => (
                  <option key={e.id} value={e.id}>{e.employeeNo} · {e.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="date">Tanggal</label>
              <input id="date" name="date" type="date" className="input" required />
            </div>
            <div>
              <label className="label" htmlFor="dayType">Tipe Hari</label>
              <select id="dayType" name="dayType" className="input w-36" defaultValue="WORK">
                {DAY_TYPES.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="shiftId">Shift</label>
              <select id="shiftId" name="shiftId" className="input w-40" defaultValue="">
                <option value="">— (untuk hari kerja) —</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} {s.startTime}–{s.endTime}</option>
                ))}
              </select>
            </div>
            <input name="note" className="input w-40" placeholder="Catatan" />
            <button type="submit" className="btn-primary">Simpan Jadwal</button>
          </form>
        </div>
      )}
    </div>
  );
}
