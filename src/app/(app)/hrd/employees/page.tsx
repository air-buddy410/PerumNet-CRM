import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { JOB_LEVELS, PERMISSIONS, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, ActiveBadge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";
import {
  contractPhase,
  contractRemainingDays,
  accountState,
  ACCOUNT_STATE_LABELS,
  archiveDueAt,
} from "@/lib/employment";
import { EmployeeForm, type EmployeeFormRow } from "./employee-form";

export const metadata = { title: "Karyawan" };
const sortOptions: readonly TableSortOption[] = [
  { value: "employeeNo", label: "NIK" },
  { value: "fullName", label: "Nama" },
  { value: "joinedAt", label: "Bergabung" },
  { value: "jobLevel", label: "Jenjang" },
];

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const jobLevelLabels = Object.fromEntries(JOB_LEVELS) as Record<string, string>;

/** Ringkasan masa kontrak untuk satu baris tabel. */
function ContractCell({
  employeeType,
  contractEndAt,
  now,
}: {
  employeeType: string;
  contractEndAt: Date | null;
  now: Date;
}) {
  const phase = contractPhase({ employeeType, contractEndAt }, now);
  // Karyawan tetap tidak punya kontrak untuk diamankan — jangan tampilkan
  // "aman" pada sesuatu yang tidak ada.
  if (phase === "NONE") return <span className="text-slate-400">—</span>;

  const due = contractEndAt!.toLocaleDateString("id-ID");
  const remaining = contractRemainingDays(contractEndAt!, now);

  if (phase === "ENDED") {
    return (
      <span className="text-rose-700">
        {due}
        <span className="block text-[10px]">berakhir {Math.abs(remaining)} hari lalu</span>
      </span>
    );
  }
  return (
    <span className={phase === "DUE_SOON" ? "text-amber-700" : "text-slate-600"}>
      {due}
      <span className="block text-[10px]">
        {phase === "DUE_SOON" ? `${remaining} hari lagi` : `sisa ${remaining} hari`}
      </span>
    </span>
  );
}

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.HRD_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "employeeNo", defaultDirection: "asc", sortOptions });
  const canManage = user.permissions.has(PERMISSIONS.HRD_MANAGE);
  const now = new Date();
  const orderBy: Prisma.EmployeeOrderByWithRelationInput[] = table.sort === "fullName"
    ? [{ fullName: table.direction }, { id: "asc" }]
    : table.sort === "joinedAt"
      ? [{ joinedAt: table.direction }, { id: "asc" }]
      : table.sort === "jobLevel"
        ? [{ jobLevel: table.direction }, { id: "asc" }]
        : [{ employeeNo: table.direction }, { id: "asc" }];

  const [employees, total, users, editRow] = await Promise.all([
    db.employee.findMany({
      include: {
        user: { select: { id: true, username: true, isActive: true, frozenAt: true, freezeReason: true } },
        supervisor: true,
        _count: { select: { subordinates: true } },
      },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.employee.count(),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    table.query.edit
      ? db.employee.findUnique({
          where: { id: table.query.edit },
          include: { user: { select: { id: true, username: true, isActive: true, frozenAt: true, freezeReason: true } }, supervisor: true, _count: { select: { subordinates: true } } },
        })
      : Promise.resolve(null),
  ]);

  const formRow: EmployeeFormRow | null = editRow
    ? {
        id: editRow.id,
        employeeNo: editRow.employeeNo,
        fullName: editRow.fullName,
        jobTitle: editRow.jobTitle,
        employeeType: editRow.employeeType,
        supervisorId: editRow.supervisorId,
        userId: editRow.userId,
        joinedAt: iso(editRow.joinedAt)!,
        isActive: editRow.isActive,
        address: editRow.address,
        workPattern: editRow.workPattern,
        jobLevel: editRow.jobLevel,
        contractStartAt: iso(editRow.contractStartAt),
        contractEndAt: iso(editRow.contractEndAt),
      }
    : null;

  return (
    <div>
      <PageHeader
        title="Karyawan"
        subtitle="Kelola data karyawan dan struktur atasan untuk pengajuan izin serta lembur."
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      {/* Akun beku muncul di daftar dengan penanda, TIDAK disembunyikan —
          menyembunyikannya membuat HRD mengira orangnya sudah hilang. */}
      {editRow?.user?.frozenAt && (
        <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm">
          <p className="font-medium text-sky-900">
            Akun {editRow.user.username} beku sejak{" "}
            {editRow.user.frozenAt.toLocaleDateString("id-ID")}
          </p>
          <p className="mt-1 text-sky-800">
            {editRow.user.freezeReason ?? "Tanpa keterangan."} Akan diarsipkan{" "}
            {archiveDueAt(editRow.user.frozenAt).toLocaleDateString("id-ID")} bila tidak dicairkan.
            Data kepegawaian tetap utuh.
          </p>
          <Link
            href={`/settings/users/${editRow.user.id}`}
            className="mt-2 inline-block text-sky-700 underline"
          >
            Cairkan dari halaman akun
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="card overflow-x-auto">
          {employees.length === 0 ? (
            <EmptyState message="Belum ada karyawan." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th"><SortableTableHeader basePath="/hrd/employees" currentDirection={table.direction} currentSort={table.sort} label="NIK" query={table.query} sortKey="employeeNo" /></th>
                  <th className="th"><SortableTableHeader basePath="/hrd/employees" currentDirection={table.direction} currentSort={table.sort} label="Nama" query={table.query} sortKey="fullName" /></th>
                  <th className="th">Jabatan</th>
                  <th className="th">Status</th>
                  <th className="th">Pola</th>
                  <th className="th">Kontrak</th>
                  <th className="th">Atasan</th>
                  <th className="th">Akun</th>
                  <th className="th">Aktif</th>
                  {canManage && <th className="th"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((e) => {
                  const state = e.user ? accountState(e.user) : null;
                  return (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="td whitespace-nowrap font-mono text-xs">{e.employeeNo}</td>
                      <td className="td whitespace-nowrap text-xs font-medium">
                        <Link href={`/hrd/employees/${e.id}`} className="text-brand-700 hover:underline">
                          {e.fullName}
                        </Link>
                        {e._count.subordinates > 0 && (
                          <span className="ml-1 text-[10px] text-slate-400">
                            {e._count.subordinates} anggota tim
                          </span>
                        )}
                      </td>
                      <td className="td whitespace-nowrap text-xs">
                        {e.jobTitle ?? "-"}
                        <span className="block text-[10px] text-slate-400">
                          {jobLevelLabels[e.jobLevel] ?? e.jobLevel}
                        </span>
                      </td>
                      <td className="td whitespace-nowrap text-xs">{statusLabel(e.employeeType)}</td>
                      <td className="td whitespace-nowrap text-xs">
                        {e.workPattern === "SHIFT" ? "Shift" : "Non-Shift"}
                      </td>
                      <td className="td whitespace-nowrap text-xs">
                        <ContractCell
                          employeeType={e.employeeType}
                          contractEndAt={e.contractEndAt}
                          now={now}
                        />
                      </td>
                      <td className="td whitespace-nowrap text-xs">{e.supervisor?.fullName ?? "-"}</td>
                      <td className="td whitespace-nowrap text-xs">
                        {e.user?.username ?? "-"}
                        {state && state !== "ACTIVE" && (
                          <span
                            className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${
                              state === "FROZEN"
                                ? "bg-sky-100 text-sky-800"
                                : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {ACCOUNT_STATE_LABELS[state]}
                          </span>
                        )}
                      </td>
                      <td className="td"><ActiveBadge isActive={e.isActive} /></td>
                      {canManage && (
                        <td className="td text-right text-xs">
                          <Link href={`/hrd/employees?edit=${e.id}`} className="text-brand-600 hover:underline">
                            Ubah
                          </Link>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <TableControls basePath="/hrd/employees" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-4 font-medium">
              {editRow ? `Ubah: ${editRow.employeeNo}` : "Karyawan Baru"}
            </h2>
            <EmployeeForm
              editRow={formRow}
              employees={employees.map((e) => ({ id: e.id, fullName: e.fullName }))}
              users={users.map((u) => ({ id: u.id, username: u.username, name: u.name }))}
            />
            {editRow && (
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                Bergabung {formatDateTime(editRow.joinedAt).split(",")[0]}.
                {editRow.address ? ` Alamat tercatat.` : " Alamat belum diisi."}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
