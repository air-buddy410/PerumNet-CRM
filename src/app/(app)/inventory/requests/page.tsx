import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatDateTime } from "@/lib/constants";
import { PageHeader, Badge, EmptyState, Flash } from "@/components/ui";
import { parseTableQuery, TableControls, type TableSearchParams } from "@/components/table-controls";
import { decideMaterialRequestAction } from "../../portal/actions";

export const metadata = { title: "Permintaan Material" };

// Fase 19 (F7) — sisi admin gudang. Persetujuan langsung menghasilkan draft
// pengeluaran yang mereservasi stock, sehingga ketersediaan divalidasi saat
// keputusan diambil, bukan nanti saat serah terima.
export default async function MaterialRequestsPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.STOCK_CREATE);
  const sp = await searchParams;
  const tableOptions = [
    { value: "status", label: "Status" },
    { value: "createdAt", label: "Dibuat" },
    { value: "requestNumber", label: "Nomor" },
  ] as const;
  const table = parseTableQuery(sp, { defaultSort: "status", sortOptions: tableOptions });
  const orderBy: Prisma.MaterialRequestOrderByWithRelationInput[] = [
    { [table.sort]: table.direction },
    { id: "asc" },
  ];

  const [requests, totalCount, pending] = await Promise.all([
    db.materialRequest.findMany({
      include: {
        requester: true,
        warehouse: true,
        decidedBy: true,
        tx: { select: { id: true, txNumber: true } },
        lines: { include: { item: true } },
      },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.materialRequest.count(),
    db.materialRequest.count({ where: { status: "SUBMITTED" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Permintaan Material"
        subtitle={`Pengajuan dari lapangan. ${pending} menunggu keputusan.`}
      />

      <Flash ok={table.query.ok} error={table.query.error} />

      {requests.length === 0 ? (
        <div className="card"><EmptyState message="Belum ada permintaan material." /></div>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <div key={req.id} className="card p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-sm font-medium">{req.requestNumber}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {req.requester.name} · {req.warehouse.name} · {formatDateTime(req.createdAt)}
                  </span>
                </div>
                <Badge value={req.status} />
              </div>

              <p className="mb-2 text-xs text-slate-500">Tujuan: {req.purpose}</p>
              <ul className="mb-3 space-y-1 text-xs">
                {req.lines.map((l) => (
                  <li key={l.id} className="flex justify-between">
                    <span>{l.item.name}</span>
                    <span className="text-slate-500">{l.qty} {l.item.unit}</span>
                  </li>
                ))}
              </ul>

              {req.tx && (
                <p className="mb-2 text-xs">
                  Draft pengeluaran:{" "}
                  <Link href={`/inventory/transactions/${req.tx.id}`} className="font-mono underline">
                    {req.tx.txNumber}
                  </Link>
                </p>
              )}
              {req.decisionNote && (
                <p className="mb-2 text-xs text-slate-500">
                  {req.decidedBy?.name}: {req.decisionNote}
                </p>
              )}

              {req.status === "SUBMITTED" &&
                (req.requesterId === user.id ? (
                  <p className="text-xs text-amber-600">
                    Anda pengajunya — keputusan harus diambil orang lain.
                  </p>
                ) : (
                  <form action={decideMaterialRequestAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="requestId" value={req.id} />
                    <input
                      type="text"
                      name="decisionNote"
                      placeholder="Catatan (wajib bila menolak)"
                      className="input flex-1"
                    />
                    <button type="submit" name="approve" value="yes" className="btn-primary">
                      Setujui
                    </button>
                    <button type="submit" name="approve" value="no" className="btn-danger">
                      Tolak
                    </button>
                  </form>
                ))}
            </div>
          ))}
          <TableControls
            basePath="/inventory/requests"
            query={table.query}
            page={table.page}
            pageSize={table.pageSize}
            sort={table.sort}
            direction={table.direction}
            sortOptions={tableOptions}
            total={totalCount}
          />
        </div>
      )}
    </div>
  );
}
