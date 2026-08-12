import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  EMPLOYEE_TYPES,
  JOB_LEVELS,
  PERMISSIONS,
  USER_LEVEL_LABELS,
  WORK_PATTERNS,
  formatDateTime,
} from "@/lib/constants";
import {
  ACCOUNT_STATE_LABELS,
  accountState,
  archiveDueAt,
  contractPhase,
  contractRemainingDays,
} from "@/lib/employment";
import { ActiveBadge, BackLink, Flash, PageHeader } from "@/components/ui";
import { EmployeeForm, type EmployeeFormRow } from "../employee-form";

export const metadata = { title: "Detail Karyawan" };

const employeeTypeLabels = Object.fromEntries(EMPLOYEE_TYPES) as Record<string, string>;
const jobLevelLabels = Object.fromEntries(JOB_LEVELS) as Record<string, string>;
const workPatternLabels = Object.fromEntries(WORK_PATTERNS) as Record<string, string>;

const iso = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-700">{value || "—"}</dd>
    </div>
  );
}

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const actor = await requirePermission(PERMISSIONS.HRD_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const [employee, employees, users] = await Promise.all([
    db.employee.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            email: true,
            phone: true,
            level: true,
            isActive: true,
            frozenAt: true,
            freezeReason: true,
            division: { select: { name: true } },
            roles: { select: { role: { select: { code: true, name: true } } } },
          },
        },
        supervisor: { select: { id: true, employeeNo: true, fullName: true, jobTitle: true } },
        subordinates: {
          select: { id: true, employeeNo: true, fullName: true, jobTitle: true },
          orderBy: { employeeNo: "asc" },
        },
      },
    }),
    db.employee.findMany({ orderBy: { employeeNo: "asc" } }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  if (!employee) notFound();

  const canManage = actor.permissions.has(PERMISSIONS.HRD_MANAGE);
  const canViewUser = actor.permissions.has(PERMISSIONS.USERS_VIEW);
  const now = new Date();
  const phase = contractPhase(employee, now);
  const account = employee.user ? accountState(employee.user) : null;
  const formRow: EmployeeFormRow = {
    id: employee.id,
    employeeNo: employee.employeeNo,
    fullName: employee.fullName,
    jobTitle: employee.jobTitle,
    employeeType: employee.employeeType,
    supervisorId: employee.supervisorId,
    userId: employee.userId,
    joinedAt: iso(employee.joinedAt)!,
    isActive: employee.isActive,
    address: employee.address,
    workPattern: employee.workPattern,
    jobLevel: employee.jobLevel,
    contractStartAt: iso(employee.contractStartAt),
    contractEndAt: iso(employee.contractEndAt),
  };

  return (
    <div className="max-w-6xl">
      <BackLink href="/hrd/employees" label="Kembali ke daftar karyawan" />
      <PageHeader
        title={employee.fullName}
        subtitle={`${employee.employeeNo} · ${employee.jobTitle ?? "Jabatan belum diisi"}`}
        action={<ActiveBadge isActive={employee.isActive} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      {phase === "DUE_SOON" && employee.contractEndAt && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Kontrak berakhir dalam {contractRemainingDays(employee.contractEndAt, now)} hari
          ({employee.contractEndAt.toLocaleDateString("id-ID")}). Pastikan HRD menindaklanjuti sebelum
          akun dibekukan otomatis.
        </div>
      )}
      {phase === "ENDED" && employee.contractEndAt && (
        <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          Kontrak berakhir {Math.abs(contractRemainingDays(employee.contractEndAt, now))} hari lalu.
          Status dan akses perlu ditinjau sesuai proses HRD.
        </div>
      )}
      {employee.user?.frozenAt && (
        <div className="mb-5 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <p className="font-medium">
            Akun {employee.user.username} beku sejak {employee.user.frozenAt.toLocaleDateString("id-ID")}.
          </p>
          <p className="mt-1">
            {employee.user.freezeReason ?? "Tanpa keterangan."} Akan diarsipkan pada {archiveDueAt(employee.user.frozenAt).toLocaleDateString("id-ID")}.
          </p>
          {canViewUser && (
            <Link href={`/settings/users/${employee.user.id}`} className="mt-2 inline-block text-sky-700 underline">
              Buka detail akun
            </Link>
          )}
        </div>
      )}

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <section className="card p-6" aria-labelledby="employee-identity-title">
            <h2 id="employee-identity-title" className="mb-5 text-lg font-semibold text-slate-700">Identitas dan pekerjaan</h2>
            <dl className="grid min-w-0 gap-x-6 gap-y-5 sm:grid-cols-2">
              <DetailField label="NIK / No. pegawai" value={employee.employeeNo} />
              <DetailField label="Nama lengkap" value={employee.fullName} />
              <DetailField label="Jabatan" value={employee.jobTitle} />
              <DetailField label="Jenjang jabatan" value={jobLevelLabels[employee.jobLevel] ?? employee.jobLevel} />
              <DetailField label="Jenis karyawan" value={employeeTypeLabels[employee.employeeType] ?? employee.employeeType} />
              <DetailField label="Pola kerja" value={workPatternLabels[employee.workPattern] ?? employee.workPattern} />
              <DetailField label="Tanggal bergabung" value={employee.joinedAt.toLocaleDateString("id-ID")} />
              <DetailField label="Status data pegawai" value={employee.isActive ? "Aktif" : "Nonaktif"} />
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Alamat</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-slate-700">{employee.address || "—"}</dd>
              </div>
            </dl>
          </section>

          <section className="card p-6" aria-labelledby="contract-title">
            <h2 id="contract-title" className="mb-5 text-lg font-semibold text-slate-700">Masa kontrak</h2>
            {phase === "NONE" ? (
              <p className="text-sm text-slate-500">Karyawan ini tidak memiliki masa kontrak.</p>
            ) : (
              <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
                <DetailField label="Status" value={phase === "ENDED" ? "Berakhir" : phase === "DUE_SOON" ? "Segera berakhir" : "Berjalan"} />
                <DetailField label="Mulai" value={employee.contractStartAt?.toLocaleDateString("id-ID")} />
                <DetailField label="Berakhir" value={employee.contractEndAt?.toLocaleDateString("id-ID")} />
              </dl>
            )}
          </section>

          <section className="card p-6" aria-labelledby="account-title">
            <h2 id="account-title" className="mb-5 text-lg font-semibold text-slate-700">Akun dan struktur organisasi</h2>
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <DetailField label="Username" value={employee.user ? `@${employee.user.username}` : "Belum tertaut"} />
              <DetailField label="Email" value={employee.user?.email} />
              <DetailField label="Divisi" value={employee.user?.division?.name} />
              <DetailField label="Level approval" value={employee.user ? (USER_LEVEL_LABELS[employee.user.level] ?? employee.user.level) : null} />
              <DetailField label="Status akun" value={account ? ACCOUNT_STATE_LABELS[account] : "Belum tertaut"} />
              <DetailField label="Role" value={employee.user?.roles.map((entry) => entry.role.name).join(", ")} />
              <DetailField label="Atasan" value={employee.supervisor ? `${employee.supervisor.fullName} (${employee.supervisor.employeeNo})` : null} />
              <DetailField label="Jumlah anggota tim" value={String(employee.subordinates.length)} />
            </dl>
          </section>

          {employee.subordinates.length > 0 && (
            <section className="card overflow-hidden" aria-labelledby="team-title">
              <div className="border-b border-slate-100 px-6 py-4">
                <h2 id="team-title" className="font-semibold text-slate-700">Anggota tim</h2>
              </div>
              <ul className="divide-y divide-slate-100">
                {employee.subordinates.map((member) => (
                  <li key={member.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-6 py-4 text-sm">
                    <div className="min-w-0">
                      <Link href={`/hrd/employees/${member.id}`} className="font-medium text-brand-700 hover:underline">
                        {member.fullName}
                      </Link>
                      <p className="truncate text-xs text-slate-500">{member.employeeNo} · {member.jobTitle ?? "Jabatan belum diisi"}</p>
                    </div>
                    <span className="text-xs text-slate-400">Lihat detail</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="min-w-0">
          {canManage ? (
            <section className="card p-5 xl:sticky xl:top-24" aria-labelledby="edit-employee-title">
              <h2 id="edit-employee-title" className="mb-1 text-lg font-semibold text-slate-700">Ubah data karyawan</h2>
              <p className="mb-4 text-xs leading-relaxed text-slate-500">Perubahan sensitif tetap melewati validasi dan audit yang sudah ada.</p>
              <EmployeeForm
                editRow={formRow}
                employees={employees.map((item) => ({ id: item.id, fullName: item.fullName }))}
                users={users.map((item) => ({ id: item.id, username: item.username, name: item.name }))}
              />
              <Link href="/hrd/employees" className="mt-3 inline-block text-xs text-slate-500 hover:underline">Kembali tanpa mengubah</Link>
            </section>
          ) : (
            <section className="card p-5">
              <h2 className="mb-2 text-lg font-semibold text-slate-700">Akses data</h2>
              <p className="text-sm leading-relaxed text-slate-500">Anda dapat melihat data karyawan, tetapi tidak memiliki izin untuk mengubahnya.</p>
            </section>
          )}
          <p className="mt-3 text-xs leading-relaxed text-slate-500">Terakhir diperbarui {formatDateTime(employee.updatedAt)}.</p>
        </aside>
      </div>
    </div>
  );
}
