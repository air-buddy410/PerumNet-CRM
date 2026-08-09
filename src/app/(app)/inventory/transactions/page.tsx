import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  TX_TYPES,
  TX_TYPE_LABELS,
  statusLabel,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";

export const metadata = { title: "Transaksi Stock" };

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; type?: string; status?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const sp = await searchParams;
  const canCreate = user.permissions.has(PERMISSIONS.STOCK_CREATE);

  const transactions = await db.stockTransaction.findMany({
    where: {
      ...(sp.type ? { type: sp.type } : {}),
      ...(sp.status ? { status: sp.status } : {}),
    },
    include: {
      warehouseFrom: true,
      warehouseTo: true,
      custodian: true,
      createdBy: true,
      workOrder: true,
      _count: { select: { lines: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title="Transaksi Stock"
        subtitle="Transaksi posted immutable — koreksi hanya lewat reversal (PRD §7.2)."
      />
      {/* Toolbar berdiri sendiri: slot `action` PageHeader dirancang untuk satu
          tombol ringkas (flex: 0 0 auto), sehingga deretan tombol di sana
          mendesak judul sampai meluber di layar sempit. */}
      {canCreate && (
        <div className="mb-4 flex flex-wrap gap-2">
          {(["GOODS_RECEIPT", "STOCK_ISSUE", "STOCK_RETURN", "STOCK_TRANSFER"] as const).map((t) => (
            <Link
              key={t}
              href={`/inventory/transactions/new?type=${t}`}
              className="btn-secondary px-3 py-1.5 text-xs"
            >
              + {TX_TYPE_LABELS[t]}
            </Link>
          ))}
        </div>
      )}
      <Flash ok={sp.ok} error={sp.error} />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="type">Tipe</label>
          <select id="type" name="type" className="input w-56" defaultValue={sp.type ?? ""}>
            <option value="">Semua tipe</option>
            {Object.values(TX_TYPES).map((t) => (
              <option key={t} value={t}>{TX_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input w-44" defaultValue={sp.status ?? ""}>
            <option value="">Semua status</option>
            <option value="DRAFT">Draft</option>
            <option value="POSTED">Posted</option>
            <option value="CANCELLED">Dibatalkan</option>
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {transactions.length === 0 ? (
          <EmptyState message="Belum ada transaksi." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Nomor</th>
                <th className="th">Tipe</th>
                <th className="th">Dari → Ke</th>
                <th className="th">Tujuan</th>
                <th className="th">Baris</th>
                <th className="th">Status</th>
                <th className="th">Dibuat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((t) => {
                const from = t.warehouseFrom?.name ?? (t.custodianId && t.type === "STOCK_RETURN" ? `Teknisi ${t.custodian?.name}` : "-");
                const to =
                  t.warehouseTo?.name ??
                  (t.custodianId && t.type === "STOCK_ISSUE" ? `Teknisi ${t.custodian?.name}` : "-");
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="td whitespace-nowrap">
                      <Link
                        href={`/inventory/transactions/${t.id}`}
                        className="font-medium text-brand-600 hover:underline"
                      >
                        {t.txNumber}
                      </Link>
                      {t.reversalOfId && (
                        <span className="ml-1 text-xs text-amber-600">(reversal)</span>
                      )}
                    </td>
                    <td className="td whitespace-nowrap text-xs">{TX_TYPE_LABELS[t.type] ?? t.type}</td>
                    <td className="td whitespace-nowrap text-xs">{from} → {to}</td>
                    <td className="td max-w-56 truncate text-xs">
                      {t.purpose}
                      {t.workOrder ? ` · ${t.workOrder.woNumber}` : ""}
                    </td>
                    <td className="td">{t._count.lines}</td>
                    <td className="td">
                      <Badge
                        value={t.reversedById ? "REVERSED" : t.status}
                        label={t.reversedById ? "Di-reverse" : statusLabel(t.status)}
                      />
                    </td>
                    <td className="td whitespace-nowrap text-xs text-slate-500">
                      {t.createdBy.name} · {formatDateTime(t.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
