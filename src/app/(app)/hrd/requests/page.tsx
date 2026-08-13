import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, LEAVE_TYPES, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams } from "@/components/table-controls";
import { syncRequestsAction } from "../actions";

export const metadata = { title: "Izin & Lembur" };

export default async function HrdRequestsPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  await requirePermission(PERMISSIONS.HRD_VIEW);
  const sp = await searchParams;
  const tableOptions = [
    { value: "createdAt", label: "Dibuat" },
    { value: "requestNumber", label: "Nomor" },
    { value: "status", label: "Status" },
  ] as const;
  const table = parseTableQuery(sp, { defaultSort: "createdAt", sortOptions: tableOptions });
  const leaveOrderBy: Prisma.LeaveRequestOrderByWithRelationInput[] = [
    { [table.sort]: table.direction },
    { id: "asc" },
  ];
  const overtimeOrderBy: Prisma.OvertimeRequestOrderByWithRelationInput[] = [
    { [table.sort]: table.direction },
    { id: "asc" },
  ];

  const [leaves, leaveTotal, overtimes, overtimeTotal] = await Promise.all([
    db.leaveRequest.findMany({
      include: { employee: true },
      orderBy: leaveOrderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.leaveRequest.count(),
    db.overtimeRequest.findMany({
      include: { employee: true },
      orderBy: overtimeOrderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.overtimeRequest.count(),
  ]);
  const approvalIds = [
    ...leaves.map((l) => l.approvalRequestId),
    ...overtimes.map((o) => o.approvalRequestId),
  ].filter((x): x is string => !!x);
  const approvals = await db.approvalRequest.findMany({
    where: { id: { in: approvalIds } },
    include: { steps: { include: { role: true, division: true }, orderBy: { stepOrder: "asc" } } },
  });
  const approvalOf = (id: string | null) => (id ? approvals.find((a) => a.id === id) : null);
  const typeLabel = (t: string) => LEAVE_TYPES.find(([v]) => v === t)?.[1] ?? t;

  return (
    <div>
      <PageHeader
        title="Izin & Lembur"
        subtitle="Pengajuan diproses bertahap melalui atasan lalu HRD."
        action={
          <form action={syncRequestsAction}>
            <button type="submit" className="btn-secondary">Sinkronkan Keputusan</button>
          </form>
        }
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="space-y-6">
        <div className="card overflow-x-auto">
          <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-medium">Izin / Cuti / Sakit</h2>
          {leaves.length === 0 ? (
            <EmptyState message="Belum ada pengajuan izin." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th"><SortableTableHeader basePath="/hrd/requests" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="requestNumber" label="Nomor" /></th>
                  <th className="th">Karyawan</th>
                  <th className="th">Jenis</th>
                  <th className="th">Periode</th>
                  <th className="th">Hari</th>
                  <th className="th">Approval</th>
                  <th className="th"><SortableTableHeader basePath="/hrd/requests" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="status" label="Status" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaves.map((l) => {
                  const ap = approvalOf(l.approvalRequestId);
                  return (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="td whitespace-nowrap font-mono text-xs">{l.requestNumber}</td>
                      <td className="td whitespace-nowrap text-xs font-medium">{l.employee.fullName}</td>
                      <td className="td whitespace-nowrap text-xs">{typeLabel(l.type)}</td>
                      <td className="td whitespace-nowrap text-xs">
                        {formatDateTime(l.startDate).split(",")[0]} – {formatDateTime(l.endDate).split(",")[0]}
                      </td>
                      <td className="td">{l.days}</td>
                      <td className="td whitespace-nowrap text-xs">
                        {ap ? (
                          <Link href={`/approvals/${ap.id}`} className="text-brand-600 hover:underline">
                            {ap.requestNumber} (step {ap.currentStep}/{ap.steps.length})
                          </Link>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="td"><Badge value={l.status} label={statusLabel(l.status)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <TableControls
            basePath="/hrd/requests"
            query={table.query}
            page={table.page}
            pageSize={table.pageSize}
            sort={table.sort}
            direction={table.direction}
            sortOptions={tableOptions}
            total={leaveTotal}
          />
        </div>

        <div className="card overflow-x-auto">
          <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-medium">Lembur</h2>
          {overtimes.length === 0 ? (
            <EmptyState message="Belum ada pengajuan lembur." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th"><SortableTableHeader basePath="/hrd/requests" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="requestNumber" label="Nomor" /></th>
                  <th className="th">Karyawan</th>
                  <th className="th">Tanggal</th>
                  <th className="th">Jam</th>
                  <th className="th">Durasi</th>
                  <th className="th">Approval</th>
                  <th className="th"><SortableTableHeader basePath="/hrd/requests" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="status" label="Status" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overtimes.map((o) => {
                  const ap = approvalOf(o.approvalRequestId);
                  return (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="td whitespace-nowrap font-mono text-xs">{o.requestNumber}</td>
                      <td className="td whitespace-nowrap text-xs font-medium">{o.employee.fullName}</td>
                      <td className="td whitespace-nowrap text-xs">{formatDateTime(o.date).split(",")[0]}</td>
                      <td className="td whitespace-nowrap font-mono text-xs">{o.startTime}–{o.endTime}</td>
                      <td className="td whitespace-nowrap text-xs">{o.minutes} mnt</td>
                      <td className="td whitespace-nowrap text-xs">
                        {ap ? (
                          <Link href={`/approvals/${ap.id}`} className="text-brand-600 hover:underline">
                            {ap.requestNumber}
                          </Link>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="td"><Badge value={o.status} label={statusLabel(o.status)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <TableControls
            basePath="/hrd/requests"
            query={table.query}
            page={table.page}
            pageSize={table.pageSize}
            sort={table.sort}
            direction={table.direction}
            sortOptions={tableOptions}
            total={overtimeTotal}
          />
        </div>
      </div>
    </div>
  );
}
