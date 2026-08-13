import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PageHeader, Flash, ActiveBadge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams } from "@/components/table-controls";
import { saveShiftAction, saveLocationAction } from "../actions";

export const metadata = { title: "Shift & Lokasi Absen" };

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.HRD_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.HRD_MANAGE);
  const tableOptions = [
    { value: "name", label: "Nama" },
    { value: "isActive", label: "Status" },
  ] as const;
  const table = parseTableQuery(sp, { defaultSort: "name", defaultDirection: "asc", sortOptions: tableOptions });
  const shiftOrderBy: Prisma.ShiftOrderByWithRelationInput[] = [
    { [table.sort]: table.direction },
    { id: "asc" },
  ];
  const locationOrderBy: Prisma.AttendanceLocationOrderByWithRelationInput[] = [
    { [table.sort]: table.direction },
    { id: "asc" },
  ];

  const [shifts, shiftTotal, editShift, locations, locationTotal, editLoc] = await Promise.all([
    db.shift.findMany({
      include: { _count: { select: { schedules: true } } },
      orderBy: shiftOrderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.shift.count(),
    table.query.editShift ? db.shift.findUnique({ where: { id: table.query.editShift } }) : Promise.resolve(null),
    db.attendanceLocation.findMany({
      include: { _count: { select: { attendances: true } } },
      orderBy: locationOrderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.attendanceLocation.count(),
    table.query.editLoc ? db.attendanceLocation.findUnique({ where: { id: table.query.editLoc } }) : Promise.resolve(null),
  ]);

  return (
    <div>
      <PageHeader
        title="Shift & Lokasi Absen"
        subtitle="Jam kerja + toleransi terlambat, dan titik geofence absensi (radius meter)."
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="card overflow-x-auto">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-medium">Shift</h2>
            {shifts.length === 0 ? (
              <EmptyState message="Belum ada shift." />
            ) : (
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="th"><SortableTableHeader basePath="/hrd/shifts" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="name" label="Nama" /></th>
                    <th className="th">Jam</th>
                    <th className="th">Toleransi</th>
                    <th className="th">Jadwal</th>
                    <th className="th"><SortableTableHeader basePath="/hrd/shifts" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="isActive" label="Status" /></th>
                    {canManage && <th className="th"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shifts.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="td whitespace-nowrap text-xs font-medium">{s.name}</td>
                      <td className="td whitespace-nowrap font-mono text-xs">{s.startTime}–{s.endTime}</td>
                      <td className="td whitespace-nowrap text-xs">{s.lateToleranceMin} mnt</td>
                      <td className="td">{s._count.schedules}</td>
                      <td className="td"><ActiveBadge isActive={s.isActive} /></td>
                      {canManage && (
                        <td className="td text-right text-xs">
                          <Link href={`/hrd/shifts?editShift=${s.id}`} className="text-brand-600 hover:underline">Ubah</Link>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
            </table>
          )}
          <TableControls
            basePath="/hrd/shifts"
            query={table.query}
            page={table.page}
            pageSize={table.pageSize}
            sort={table.sort}
            direction={table.direction}
            sortOptions={tableOptions}
            total={shiftTotal}
          />
        </div>
          {canManage && (
            <div className="card p-5">
              <h2 className="mb-3 font-medium">{editShift ? `Ubah Shift: ${editShift.name}` : "Shift Baru"}</h2>
              <form action={saveShiftAction} className="space-y-3">
                {editShift && <input type="hidden" name="id" value={editShift.id} />}
                <input name="name" className="input" placeholder="Nama shift (mis. Pagi)" required defaultValue={editShift?.name ?? ""} />
                <div className="grid grid-cols-3 gap-3">
                  <input name="startTime" className="input" placeholder="08:00" required defaultValue={editShift?.startTime ?? ""} />
                  <input name="endTime" className="input" placeholder="17:00" required defaultValue={editShift?.endTime ?? ""} />
                  <input name="lateToleranceMin" type="number" min={0} max={120} className="input" placeholder="Toleransi" required defaultValue={editShift?.lateToleranceMin ?? 15} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isActive" className="h-4 w-4" defaultChecked={editShift?.isActive ?? true} />
                  Aktif
                </label>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary">{editShift ? "Simpan" : "Tambah"}</button>
                  {editShift && <Link href="/hrd/shifts" className="btn-secondary">Batal</Link>}
                </div>
              </form>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card overflow-x-auto">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-medium">Lokasi Absen (geofence)</h2>
            {locations.length === 0 ? (
              <EmptyState message="Belum ada lokasi absen — absen mandiri akan ditolak." />
            ) : (
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="th"><SortableTableHeader basePath="/hrd/shifts" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="name" label="Nama" /></th>
                    <th className="th">Koordinat</th>
                    <th className="th">Radius</th>
                    <th className="th">Absen</th>
                    <th className="th"><SortableTableHeader basePath="/hrd/shifts" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="isActive" label="Status" /></th>
                    {canManage && <th className="th"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {locations.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="td whitespace-nowrap text-xs font-medium">{l.name}</td>
                      <td className="td whitespace-nowrap font-mono text-xs">
                        {l.latitude.toFixed(5)}, {l.longitude.toFixed(5)}
                      </td>
                      <td className="td whitespace-nowrap text-xs">{l.radiusM} m</td>
                      <td className="td">{l._count.attendances}</td>
                      <td className="td"><ActiveBadge isActive={l.isActive} /></td>
                      {canManage && (
                        <td className="td text-right text-xs">
                          <Link href={`/hrd/shifts?editLoc=${l.id}`} className="text-brand-600 hover:underline">Ubah</Link>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
            </table>
          )}
          <TableControls
            basePath="/hrd/shifts"
            query={table.query}
            page={table.page}
            pageSize={table.pageSize}
            sort={table.sort}
            direction={table.direction}
            sortOptions={tableOptions}
            total={locationTotal}
          />
        </div>
          {canManage && (
            <div className="card p-5">
              <h2 className="mb-3 font-medium">{editLoc ? `Ubah Lokasi: ${editLoc.name}` : "Lokasi Absen Baru"}</h2>
              <form action={saveLocationAction} className="space-y-3">
                {editLoc && <input type="hidden" name="id" value={editLoc.id} />}
                <input name="name" className="input" placeholder="Nama lokasi (mis. Kantor Pusat)" required defaultValue={editLoc?.name ?? ""} />
                <div className="grid grid-cols-3 gap-3">
                  <input name="latitude" type="number" step="any" className="input" placeholder="Latitude" required defaultValue={editLoc?.latitude ?? ""} />
                  <input name="longitude" type="number" step="any" className="input" placeholder="Longitude" required defaultValue={editLoc?.longitude ?? ""} />
                  <input name="radiusM" type="number" min={10} max={5000} className="input" placeholder="Radius m" required defaultValue={editLoc?.radiusM ?? 100} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isActive" className="h-4 w-4" defaultChecked={editLoc?.isActive ?? true} />
                  Aktif
                </label>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary">{editLoc ? "Simpan" : "Tambah"}</button>
                  {editLoc && <Link href="/hrd/shifts" className="btn-secondary">Batal</Link>}
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
