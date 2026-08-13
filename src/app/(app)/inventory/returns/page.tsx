import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { PERMISSIONS, formatDateTime } from "@/lib/constants";
import { PageHeader, Badge, EmptyState, Flash } from "@/components/ui";
import { parseTableQuery, TableControls, type TableSearchParams } from "@/components/table-controls";
import { verifyReturnAction } from "./actions";

export const metadata = { title: "Pengembalian Material" };

const CONDITION_LABELS: Record<string, string> = {
  GOOD: "Baik",
  USED: "Terpakai",
  DAMAGED: "Rusak",
  RMA: "RMA",
};

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;

  const canVerify = user.permissions.has(PERMISSIONS.STOCK_POST);
  const tableOptions = [
    { value: "createdAt", label: "Dibuat" },
    { value: "returnNumber", label: "Nomor" },
    { value: "status", label: "Status" },
  ] as const;
  const table = parseTableQuery(sp, { defaultSort: "createdAt", sortOptions: tableOptions });
  const where: Prisma.ReturnRequestWhereInput = canVerify ? {} : { requesterId: user.id };
  const orderBy: Prisma.ReturnRequestOrderByWithRelationInput[] = [
    { [table.sort]: table.direction },
    { id: "asc" },
  ];
  const [requests, totalCount, pending] = await Promise.all([
    db.returnRequest.findMany({
      // Pemegang barang hanya melihat pengajuannya sendiri.
      where,
      include: {
        requester: true,
        warehouseTo: true,
        verifiedBy: true,
        lines: { include: { item: true, device: true } },
      },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.returnRequest.count({ where }),
    db.returnRequest.count({ where: { ...where, status: "PENDING" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Pengembalian Material"
        subtitle={`Pengajuan oleh pemegang barang, diverifikasi admin gudang. ${pending} menunggu verifikasi.`}
        action={
          <Link href="/inventory/returns/new" className="btn-primary">
            Ajukan Pengembalian
          </Link>
        }
      />

      <Flash ok={table.query.ok} error={table.query.error} />

      {requests.length === 0 ? (
        <div className="card">
          <EmptyState message="Belum ada pengajuan pengembalian." />
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <div key={req.id} className="card p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-sm font-medium">{req.returnNumber}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {req.requester.name} → {req.warehouseTo.name} · {formatDateTime(req.createdAt)}
                  </span>
                </div>
                <Badge value={req.status} />
              </div>

              <ul className="mb-3 space-y-1 text-xs">
                {req.lines.map((line) => (
                  <li key={line.id} className="flex justify-between gap-3">
                    <span>
                      {line.item.name}
                      {line.device ? ` · ${line.device.serialNumber}` : ""}
                    </span>
                    <span className="text-slate-500">
                      {line.qty} · {CONDITION_LABELS[line.condition] ?? line.condition}
                    </span>
                  </li>
                ))}
              </ul>

              {req.note && <p className="mb-3 text-xs text-slate-500">Catatan: {req.note}</p>}
              {req.status !== "PENDING" && (
                <p className="text-xs text-slate-500">
                  {req.status === "ACCEPTED" ? "Diterima" : "Ditolak"} oleh{" "}
                  {req.verifiedBy?.name ?? "-"}
                  {req.verifyNote ? ` — ${req.verifyNote}` : ""}
                </p>
              )}

              {req.status === "PENDING" && canVerify && req.requesterId !== user.id && (
                <form action={verifyReturnAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="requestId" value={req.id} />
                  <input
                    type="text"
                    name="verifyNote"
                    placeholder="Catatan (wajib bila menolak)"
                    className="input flex-1"
                  />
                  <button type="submit" name="accept" value="yes" className="btn-primary">
                    Terima
                  </button>
                  <button type="submit" name="accept" value="no" className="btn-danger">
                    Tolak
                  </button>
                </form>
              )}
              {req.status === "PENDING" && canVerify && req.requesterId === user.id && (
                <p className="text-xs text-amber-600">
                  Anda pengajunya — verifikasi harus dilakukan orang lain.
                </p>
              )}
            </div>
          ))}
          <TableControls
            basePath="/inventory/returns"
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
