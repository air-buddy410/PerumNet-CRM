import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Badge, EmptyState, Flash } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";

export const metadata = { title: "Surveys" };
const sortOptions: readonly TableSortOption[] = [
  { value: "createdAt", label: "Dibuat" },
  { value: "surveyNumber", label: "Nomor" },
  { value: "status", label: "Status" },
];

export default async function SurveysPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.SURVEYS_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "createdAt", defaultDirection: "desc", sortOptions });
  const orderBy: Prisma.SurveyOrderByWithRelationInput[] = table.sort === "surveyNumber"
    ? [{ surveyNumber: table.direction }, { id: "asc" }]
    : table.sort === "status"
      ? [{ status: table.direction }, { id: "asc" }]
      : [{ createdAt: table.direction }, { id: "asc" }];

  const [surveys, total] = await Promise.all([
    db.survey.findMany({
      include: { lead: true, customer: true, technician: true, package: true },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.survey.count(),
  ]);

  return (
    <div>
      <PageHeader
        title="Survey Management"
        subtitle="Ikuti proses survey dari pengajuan hingga selesai dengan hasil kelayakan dan foto bukti."
        action={
          user.permissions.has(PERMISSIONS.SURVEYS_CREATE) ? (
            <Link href="/sales/surveys/new" className="btn-primary">+ Ajukan Survey</Link>
          ) : undefined
        }
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="card overflow-x-auto">
        {surveys.length === 0 ? (
          <EmptyState message="Belum ada survey." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/sales/surveys" currentDirection={table.direction} currentSort={table.sort} label="Nomor" query={table.query} sortKey="surveyNumber" /></th>
                <th className="th">Lead / Customer</th>
                <th className="th">Alamat</th>
                <th className="th">Paket</th>
                <th className="th">Jadwal</th>
                <th className="th">Teknisi</th>
                <th className="th">Feasibility</th>
                <th className="th"><SortableTableHeader basePath="/sales/surveys" currentDirection={table.direction} currentSort={table.sort} label="Status" query={table.query} sortKey="status" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {surveys.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="td">
                    <Link
                      href={`/sales/surveys/${s.id}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {s.surveyNumber}
                    </Link>
                  </td>
                  <td className="td">{s.lead?.name ?? s.customer?.name ?? "-"}</td>
                  <td className="td max-w-56 truncate text-xs">{s.address}</td>
                  <td className="td text-xs">{s.package?.name ?? "-"}</td>
                  <td className="td whitespace-nowrap text-xs">
                    {s.scheduledAt ? formatDateTime(s.scheduledAt) : "-"}
                  </td>
                  <td className="td text-xs">{s.technician?.name ?? "-"}</td>
                  <td className="td">
                    {s.feasibility ? (
                      <Badge value={s.feasibility} label={statusLabel(s.feasibility)} />
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="td">
                    <Badge value={s.status} label={statusLabel(s.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <TableControls basePath="/sales/surveys" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />
    </div>
  );
}
