import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatRupiah, formatDateTime } from "@/lib/constants";
import { agingSummary } from "@/lib/billing";
import { PageHeader, EmptyState } from "@/components/ui";

export const metadata = { title: "Aging Piutang" };

export default async function ReceivablesPage() {
  await requirePermission(PERMISSIONS.BILLING_VIEW);
  const rows = await agingSummary();
  const totalOutstanding = rows.reduce((acc, r) => acc + r.totalOutstanding, 0n);
  const overdueCustomers = rows.filter((r) => r.overdueCount > 0).length;

  return (
    <div>
      <PageHeader
        title="Aging Piutang"
        subtitle={`Daftar pelanggan menunggak untuk pemantauan piutang dan tindak lanjut isolir. ${overdueCustomers} pelanggan menunggak · total piutang ${formatRupiah(totalOutstanding)}.`}
      />

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState message="Tidak ada piutang berjalan. 🎉" />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Pelanggan</th>
                <th className="th">Invoice Belum Lunas</th>
                <th className="th">Menunggak (lewat tempo)</th>
                <th className="th">Total Piutang</th>
                <th className="th">Jatuh Tempo Tertua</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.customerId} className={r.overdueCount > 0 ? "bg-red-50/40" : "hover:bg-slate-50"}>
                  <td className="td whitespace-nowrap text-xs">
                    <span className="font-mono">{r.customerNumber}</span>{" "}
                    <span className="font-medium">{r.customerName}</span>
                  </td>
                  <td className="td">{r.unpaidCount}</td>
                  <td className="td">
                    {r.overdueCount > 0 ? (
                      <span className="font-semibold text-red-600">{r.overdueCount} invoice</span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="td whitespace-nowrap text-xs font-medium">{formatRupiah(r.totalOutstanding)}</td>
                  <td className="td whitespace-nowrap text-xs">{formatDateTime(r.oldestDueAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
