import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatRupiah } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";

export const metadata = { title: "Projects" };
const sortOptions: readonly TableSortOption[] = [
  { value: "createdAt", label: "Terbaru" },
  { value: "projectNumber", label: "Nomor" },
  { value: "name", label: "Nama" },
  { value: "status", label: "Status" },
];

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.PROJECTS_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "createdAt", defaultDirection: "desc", sortOptions });
  const orderBy: Prisma.ProjectOrderByWithRelationInput[] = table.sort === "projectNumber"
    ? [{ projectNumber: table.direction }, { id: "asc" }]
    : table.sort === "name"
      ? [{ name: table.direction }, { id: "asc" }]
      : table.sort === "status"
        ? [{ status: table.direction }, { id: "asc" }]
        : [{ createdAt: table.direction }, { id: "asc" }];

  const [projects, total] = await Promise.all([
    db.project.findMany({
      include: {
        manager: true,
        customer: true,
        cashTransactions: { where: { status: "POSTED", reversedById: null, reversalOfId: null, type: { in: ["EXPENSE", "REIMBURSEMENT", "ADVANCE_SETTLEMENT"] } } },
      },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.project.count(),
  ]);

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Proyek hanya dapat ditutup setelah material dan biaya direkonsiliasi."
        action={
          user.permissions.has(PERMISSIONS.PROJECTS_MANAGE) ? (
            <Link href="/projects/new" className="btn-primary">+ Proyek</Link>
          ) : undefined
        }
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="card overflow-x-auto">
        {projects.length === 0 ? (
          <EmptyState message="Belum ada proyek." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/projects" currentDirection={table.direction} currentSort={table.sort} label="Nomor" query={table.query} sortKey="projectNumber" /></th>
                <th className="th"><SortableTableHeader basePath="/projects" currentDirection={table.direction} currentSort={table.sort} label="Nama" query={table.query} sortKey="name" /></th>
                <th className="th">Manager</th>
                <th className="th text-right">Budget</th>
                <th className="th text-right">Realisasi Biaya</th>
                <th className="th"><SortableTableHeader basePath="/projects" currentDirection={table.direction} currentSort={table.sort} label="Status" query={table.query} sortKey="status" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projects.map((p) => {
                const actual = p.cashTransactions.reduce((s, t) => s + t.amount, BigInt(0));
                const over = p.budget > BigInt(0) && actual > p.budget;
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="td whitespace-nowrap">
                      <Link
                        href={`/projects/${p.id}`}
                        className="font-medium text-brand-600 hover:underline"
                      >
                        {p.projectNumber}
                      </Link>
                    </td>
                    <td className="td">
                      <div className="font-medium">{p.name}</div>
                      {p.customer && (
                        <div className="text-xs text-slate-500">{p.customer.name}</div>
                      )}
                    </td>
                    <td className="td text-xs">{p.manager.name}</td>
                    <td className="td text-right">{formatRupiah(p.budget)}</td>
                    <td className={`td text-right font-semibold ${over ? "text-red-600" : ""}`}>
                      {formatRupiah(actual)}
                    </td>
                    <td className="td">
                      <Badge value={p.status} label={statusLabel(p.status)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <TableControls basePath="/projects" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />
    </div>
  );
}
