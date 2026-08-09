import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge } from "@/components/ui";
import { saveCountsAction, submitOpnameAction, postOpnameAction } from "../actions";

export const metadata = { title: "Detail Opname" };

export default async function OpnameDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const session = await db.opnameSession.findUnique({
    where: { id },
    include: {
      warehouse: true,
      createdBy: true,
      lines: { include: { item: true }, orderBy: { id: "asc" } },
    },
  });
  if (!session) notFound();

  const approval = session.approvalRequestId
    ? await db.approvalRequest.findUnique({ where: { id: session.approvalRequestId } })
    : null;
  const adjustmentTx = session.adjustmentTxId
    ? await db.stockTransaction.findUnique({ where: { id: session.adjustmentTxId } })
    : null;

  const canManage = user.permissions.has(PERMISSIONS.OPNAME_MANAGE);
  const canPost = user.permissions.has(PERMISSIONS.STOCK_POST);
  const isOpen = session.status === "OPEN";
  const counted = session.lines.filter((l) => l.countedQty !== null).length;

  return (
    <div className="max-w-4xl">
      <BackLink href="/inventory/opname" label="Kembali ke daftar opname" />
      <PageHeader
        title={session.opnameNumber}
        subtitle={`${session.warehouse.name} · cut-off ${formatDateTime(session.createdAt)} · ${counted}/${session.lines.length} item dihitung`}
        action={<Badge value={session.status} label={statusLabel(session.status)} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      {approval && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Approval adjustment:{" "}
          <Link href={`/approvals/${approval.id}`} className="font-semibold underline">
            {approval.requestNumber}
          </Link>{" "}
          ({statusLabel(approval.status)})
          {approval.status === "APPROVED" && session.status === "WAITING_APPROVAL"
            ? " — siap diposting."
            : ""}
        </div>
      )}
      {adjustmentTx && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Adjustment diposting:{" "}
          <Link
            href={`/inventory/transactions/${adjustmentTx.id}`}
            className="font-semibold underline"
          >
            {adjustmentTx.txNumber}
          </Link>
        </div>
      )}

      <form action={saveCountsAction}>
        <input type="hidden" name="sessionId" value={session.id} />
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Item</th>
                <th className="th text-right">Qty Sistem</th>
                <th className="th">Qty Fisik</th>
                <th className="th">Variance</th>
                <th className="th">Alasan (wajib bila variance)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {session.lines.map((line) => {
                const variance =
                  line.countedQty !== null ? line.countedQty - line.systemQty : null;
                return (
                  <tr key={line.id}>
                    <td className="td">
                      <input type="hidden" name="lineId" value={line.id} />
                      <span className="font-mono text-xs">{line.item.code}</span>{" "}
                      {line.item.name}
                    </td>
                    <td className="td text-right">{line.systemQty} {line.item.unit}</td>
                    <td className="td w-32">
                      {isOpen && canManage ? (
                        <input
                          name={`counted_${line.id}`}
                          type="number"
                          min={0}
                          className="input px-2 py-1"
                          defaultValue={line.countedQty ?? ""}
                        />
                      ) : (
                        (line.countedQty ?? "-")
                      )}
                    </td>
                    <td className={`td font-semibold ${variance ? (variance > 0 ? "text-emerald-600" : "text-red-600") : ""}`}>
                      {variance === null ? "-" : variance === 0 ? "0" : variance > 0 ? `+${variance}` : variance}
                    </td>
                    <td className="td">
                      {isOpen && canManage ? (
                        <input
                          name={`reason_${line.id}`}
                          className="input px-2 py-1"
                          defaultValue={line.reason ?? ""}
                          placeholder="alasan variance"
                        />
                      ) : (
                        (line.reason ?? "-")
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {isOpen && canManage && (
          <div className="mt-4 flex gap-3">
            <button type="submit" className="btn-secondary">Simpan Hitungan</button>
            <button type="submit" formAction={submitOpnameAction} className="btn-primary">
              Selesai Hitung — Ajukan
            </button>
          </div>
        )}
      </form>

      {session.status === "WAITING_APPROVAL" && canPost && approval?.status === "APPROVED" && (
        <form action={postOpnameAction} className="mt-4">
          <input type="hidden" name="sessionId" value={session.id} />
          <button type="submit" className="btn-primary">
            Posting Adjustment
          </button>
        </form>
      )}
    </div>
  );
}
