import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";

export const metadata = { title: "Absensi Harian" };
const sortOptions: readonly TableSortOption[] = [
  { value: "employeeNo", label: "NIK" },
  { value: "clockInAt", label: "Jam masuk" },
  { value: "status", label: "Status" },
];

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  await requirePermission(PERMISSIONS.HRD_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "employeeNo", defaultDirection: "asc", sortOptions });
  const dateStr = table.query.date ?? new Date().toISOString().slice(0, 10);
  const from = new Date(`${dateStr}T00:00:00`);
  const to = new Date(`${dateStr}T23:59:59`);

  const where = { date: { gte: from, lte: to } };
  const orderBy: Prisma.AttendanceOrderByWithRelationInput[] = table.sort === "clockInAt"
    ? [{ clockInAt: table.direction }, { id: "asc" }]
    : table.sort === "status"
      ? [{ status: table.direction }, { id: "asc" }]
      : [{ employee: { employeeNo: table.direction } }, { id: "asc" }];
  const [rows, total, employees, attended] = await Promise.all([
    db.attendance.findMany({ where, include: { employee: true, shift: true, clockInLocation: true }, orderBy, skip: (table.page - 1) * table.pageSize, take: table.pageSize }),
    db.attendance.count({ where }),
    db.employee.count({ where: { isActive: true } }),
    db.attendance.count({ where: { ...where, clockInAt: { not: null } } }),
  ]);
  const notYet = employees - attended;

  return (
    <div>
      <PageHeader
        title="Absensi Harian"
        subtitle={`${rows.filter((r) => r.clockInAt).length} dari ${employees} karyawan sudah absen · ${notYet} belum absen. Jarak = bukti geofence saat clock-in.`}
      />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="date">Tanggal</label>
          <input id="date" name="date" type="date" className="input" defaultValue={dateStr} />
        </div>
        <button type="submit" className="btn-secondary">Tampilkan</button>
      </form>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState message="Belum ada absensi pada tanggal ini." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/hrd/attendance" currentDirection={table.direction} currentSort={table.sort} label="NIK" query={table.query} sortKey="employeeNo" /></th>
                <th className="th">Nama</th>
                <th className="th">Shift</th>
                <th className="th"><SortableTableHeader basePath="/hrd/attendance" currentDirection={table.direction} currentSort={table.sort} label="Masuk" query={table.query} sortKey="clockInAt" /></th>
                <th className="th">Lokasi / Jarak</th>
                <th className="th">Pulang</th>
                <th className="th">Terlambat</th>
                <th className="th">Kerja</th>
                <th className="th"><SortableTableHeader basePath="/hrd/attendance" currentDirection={table.direction} currentSort={table.sort} label="Status" query={table.query} sortKey="status" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className={r.status === "LATE" ? "bg-amber-50/40" : "hover:bg-slate-50"}>
                  <td className="td whitespace-nowrap font-mono text-xs">{r.employee.employeeNo}</td>
                  <td className="td whitespace-nowrap text-xs font-medium">{r.employee.fullName}</td>
                  <td className="td whitespace-nowrap text-xs">{r.shift?.name ?? "-"}</td>
                  <td className="td whitespace-nowrap text-xs">
                    {r.clockInAt ? formatDateTime(r.clockInAt).split(", ")[1] : "-"}
                  </td>
                  <td className="td whitespace-nowrap text-xs">
                    {r.clockInLocation ? `${r.clockInLocation.name} · ${r.clockInDistanceM} m` : "-"}
                  </td>
                  <td className="td whitespace-nowrap text-xs">
                    {r.clockOutAt ? formatDateTime(r.clockOutAt).split(", ")[1] : "-"}
                  </td>
                  <td className="td whitespace-nowrap text-xs">
                    {r.lateMinutes > 0 ? <span className="font-semibold text-amber-700">{r.lateMinutes} mnt</span> : "-"}
                  </td>
                  <td className="td whitespace-nowrap text-xs">{r.workMinutes > 0 ? `${r.workMinutes} mnt` : "-"}</td>
                  <td className="td"><Badge value={r.status} label={statusLabel(r.status)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <TableControls basePath="/hrd/attendance" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />
    </div>
  );
}
