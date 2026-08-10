import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, EMPLOYEE_TYPES, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, ActiveBadge, EmptyState } from "@/components/ui";
import { saveEmployeeAction } from "../actions";

export const metadata = { title: "Karyawan" };

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.HRD_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.HRD_MANAGE);

  const [employees, users] = await Promise.all([
    db.employee.findMany({
      include: { user: true, supervisor: true, _count: { select: { subordinates: true } } },
      orderBy: { employeeNo: "asc" },
    }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const editRow = sp.edit ? (employees.find((e) => e.id === sp.edit) ?? null) : null;

  return (
    <div>
      <PageHeader
        title="Karyawan"
        subtitle="Master karyawan dengan hierarki atasan — dipakai approval berjenjang izin/lembur (§8)."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="card overflow-x-auto">
          {employees.length === 0 ? (
            <EmptyState message="Belum ada karyawan." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">NIK</th>
                  <th className="th">Nama</th>
                  <th className="th">Jabatan</th>
                  <th className="th">Jenis</th>
                  <th className="th">Atasan</th>
                  <th className="th">Akun</th>
                  <th className="th">Bergabung</th>
                  <th className="th">Status</th>
                  {canManage && <th className="th"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="td whitespace-nowrap font-mono text-xs">{e.employeeNo}</td>
                    <td className="td whitespace-nowrap text-xs font-medium">
                      {e.fullName}
                      {e._count.subordinates > 0 && (
                        <span className="ml-1 text-[10px] text-slate-400">{e._count.subordinates} anggota tim</span>
                      )}
                    </td>
                    <td className="td whitespace-nowrap text-xs">{e.jobTitle ?? "-"}</td>
                    <td className="td whitespace-nowrap text-xs">{statusLabel(e.employeeType)}</td>
                    <td className="td whitespace-nowrap text-xs">{e.supervisor?.fullName ?? "-"}</td>
                    <td className="td whitespace-nowrap text-xs">{e.user?.username ?? "-"}</td>
                    <td className="td whitespace-nowrap text-xs">{formatDateTime(e.joinedAt).split(",")[0]}</td>
                    <td className="td"><ActiveBadge isActive={e.isActive} /></td>
                    {canManage && (
                      <td className="td text-right text-xs">
                        <Link href={`/hrd/employees?edit=${e.id}`} className="text-brand-600 hover:underline">
                          Ubah
                        </Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-4 font-medium">{editRow ? `Ubah: ${editRow.employeeNo}` : "Karyawan Baru"}</h2>
            <form action={saveEmployeeAction} className="space-y-3">
              {editRow && <input type="hidden" name="id" value={editRow.id} />}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="employeeNo">NIK</label>
                  <input id="employeeNo" name="employeeNo" className="input" required defaultValue={editRow?.employeeNo ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="employeeType">Jenis</label>
                  <select id="employeeType" name="employeeType" className="input" defaultValue={editRow?.employeeType ?? "FULL_TIME"}>
                    {EMPLOYEE_TYPES.map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="fullName">Nama Lengkap</label>
                <input id="fullName" name="fullName" className="input" required defaultValue={editRow?.fullName ?? ""} />
              </div>
              <div>
                <label className="label" htmlFor="jobTitle">Jabatan</label>
                <input id="jobTitle" name="jobTitle" className="input" defaultValue={editRow?.jobTitle ?? ""} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="supervisorId">Atasan</label>
                  <select id="supervisorId" name="supervisorId" className="input" defaultValue={editRow?.supervisorId ?? ""}>
                    <option value="">— tidak ada —</option>
                    {employees.filter((e) => e.id !== editRow?.id).map((e) => (
                      <option key={e.id} value={e.id}>{e.fullName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="userId">Akun Sistem</label>
                  <select id="userId" name="userId" className="input" defaultValue={editRow?.userId ?? ""}>
                    <option value="">— belum tertaut —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.username} · {u.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="joinedAt">Tanggal Bergabung</label>
                <input id="joinedAt" name="joinedAt" type="date" className="input" required defaultValue={editRow ? editRow.joinedAt.toISOString().slice(0, 10) : ""} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isActive" className="h-4 w-4" defaultChecked={editRow?.isActive ?? true} />
                Aktif
              </label>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">{editRow ? "Simpan" : "Tambah"}</button>
                {editRow && <Link href="/hrd/employees" className="btn-secondary">Batal</Link>}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
