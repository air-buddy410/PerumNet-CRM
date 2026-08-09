import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  TX_TYPE_LABELS,
  statusLabel,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge, EmptyState } from "@/components/ui";
import {
  postTransactionAction,
  cancelTransactionAction,
  reverseTransactionAction,
} from "../actions";

export const metadata = { title: "Detail Transaksi" };

export default async function TransactionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const tx = await db.stockTransaction.findUnique({
    where: { id },
    include: {
      warehouseFrom: true,
      warehouseTo: true,
      custodian: true,
      workOrder: true,
      createdBy: true,
      postedBy: true,
      reversalOf: true,
      reversedBy: true,
      lines: { include: { item: true, device: true } },
    },
  });
  if (!tx) notFound();

  const canPost = user.permissions.has(PERMISSIONS.STOCK_POST);
  const canReverse = user.permissions.has(PERMISSIONS.STOCK_REVERSE);
  const canCreate = user.permissions.has(PERMISSIONS.STOCK_CREATE);

  return (
    <div className="max-w-4xl">
      <BackLink href="/inventory/transactions" label="Kembali ke daftar transaksi" />
      <PageHeader
        title={tx.txNumber}
        subtitle={`${TX_TYPE_LABELS[tx.type] ?? tx.type} · dibuat ${tx.createdBy.name}, ${formatDateTime(tx.createdAt)}`}
        action={
          <Badge
            value={tx.reversedById ? "REVERSED" : tx.status}
            label={tx.reversedById ? "Di-reverse" : statusLabel(tx.status)}
          />
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      {tx.reversalOf && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Transaksi ini adalah reversal dari{" "}
          <Link href={`/inventory/transactions/${tx.reversalOf.id}`} className="font-semibold underline">
            {tx.reversalOf.txNumber}
          </Link>.
        </div>
      )}
      {tx.reversedBy && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Transaksi ini telah di-reverse oleh{" "}
          <Link href={`/inventory/transactions/${tx.reversedBy.id}`} className="font-semibold underline">
            {tx.reversedBy.txNumber}
          </Link>.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <div className="card p-6">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Gudang Asal</dt>
                <dd className="mt-0.5 text-sm">{tx.warehouseFrom?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Gudang Tujuan</dt>
                <dd className="mt-0.5 text-sm">{tx.warehouseTo?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Teknisi / Custodian</dt>
                <dd className="mt-0.5 text-sm">{tx.custodian?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Work Order</dt>
                <dd className="mt-0.5 text-sm">
                  {tx.workOrder ? (
                    <Link href={`/operations/work-orders/${tx.workOrder.id}`} className="text-brand-600 hover:underline">
                      {tx.workOrder.woNumber}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-slate-400">Tujuan</dt>
                <dd className="mt-0.5 text-sm">{tx.purpose}</dd>
              </div>
              {tx.referenceNote && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Referensi</dt>
                  <dd className="mt-0.5 text-sm">{tx.referenceNote}</dd>
                </div>
              )}
              {tx.postedAt && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Diposting</dt>
                  <dd className="mt-0.5 text-sm">
                    {tx.postedBy?.name} · {formatDateTime(tx.postedAt)}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="card">
            <div className="border-b border-slate-100 px-5 py-4 font-medium">
              Baris Item ({tx.lines.length})
            </div>
            {tx.lines.length === 0 ? (
              <EmptyState message="Tidak ada baris." />
            ) : (
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="th">Item</th>
                    <th className="th">Qty</th>
                    <th className="th">SN / Perangkat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tx.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="td">{line.item.name}</td>
                      <td className="td whitespace-nowrap">
                        {line.qty} {line.item.unit}
                      </td>
                      <td className="td font-mono text-xs">
                        {line.device ? (
                          <Link
                            href={`/inventory/devices/${line.device.id}`}
                            className="text-brand-600 hover:underline"
                          >
                            {line.device.serialNumber}
                          </Link>
                        ) : (
                          line.snInput ?? "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {tx.status === "DRAFT" && canPost && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Posting</h2>
              <p className="mb-3 text-xs text-slate-500">
                Posting memvalidasi saldo (tidak boleh negatif) lalu mengubah stock &amp;
                status perangkat. Setelah posting, transaksi immutable.
              </p>
              <form action={postTransactionAction}>
                <input type="hidden" name="txId" value={tx.id} />
                <button type="submit" className="btn-primary w-full justify-center">
                  Posting Sekarang
                </button>
              </form>
            </div>
          )}
          {tx.status === "DRAFT" && canCreate && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Batalkan Draft</h2>
              <form action={cancelTransactionAction}>
                <input type="hidden" name="txId" value={tx.id} />
                <button type="submit" className="btn-danger w-full justify-center">
                  Batalkan
                </button>
              </form>
            </div>
          )}
          {tx.status === "POSTED" && !tx.reversedById && !tx.reversalOfId && canReverse && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Reversal</h2>
              <p className="mb-3 text-xs text-slate-500">
                Membuat transaksi koreksi kebalikan. Transaksi asal tetap tercatat.
              </p>
              <form action={reverseTransactionAction} className="space-y-3">
                <input type="hidden" name="txId" value={tx.id} />
                <textarea
                  name="reason"
                  rows={2}
                  className="input"
                  placeholder="Alasan reversal (wajib)"
                  required
                />
                <button type="submit" className="btn-danger w-full justify-center">
                  Reverse Transaksi
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
