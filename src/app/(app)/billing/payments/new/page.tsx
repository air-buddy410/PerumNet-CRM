import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatRupiah, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, BackLink, EmptyState } from "@/components/ui";
import { createPaymentAction } from "../../actions";

export const metadata = { title: "Catat Pembayaran" };

// Alur dua langkah server-rendered: pilih pelanggan (?customerId=) → form
// alokasi menampilkan invoice OPEN/PARTIAL milik pelanggan itu.
export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; customerId?: string }>;
}) {
  await requirePermission(PERMISSIONS.PAYMENTS_CREATE);
  const sp = await searchParams;

  const customers = await db.customer.findMany({
    where: { invoices: { some: { status: { in: ["OPEN", "PARTIAL"] } } } },
    orderBy: { name: "asc" },
  });
  const selected = sp.customerId
    ? await db.customer.findUnique({
        where: { id: sp.customerId },
        include: {
          invoices: {
            where: { status: { in: ["OPEN", "PARTIAL"] } },
            orderBy: { dueAt: "asc" },
          },
        },
      })
    : null;
  const [merchants, cashbooks] = await Promise.all([
    db.merchant.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.cashbook.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
  ]);
  const totalOutstanding =
    selected?.invoices.reduce((acc, i) => acc + (i.totalAmount - i.paidAmount), 0n) ?? 0n;

  return (
    <div className="max-w-3xl">
      <BackLink href="/billing/payments" label="Kembali ke daftar pembayaran" />
      <PageHeader
        title="Catat Pembayaran"
        subtitle="Jumlah alokasi wajib sama dengan nominal pembayaran (§3.2). Pembayaran gateway dibuat otomatis dari webhook bundle."
      />
      <Flash error={sp.error} />

      <form method="GET" className="card mb-6 flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="customerId">Pelanggan (punya tagihan berjalan)</label>
          <select id="customerId" name="customerId" className="input" defaultValue={sp.customerId ?? ""}>
            <option value="">— pilih —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.customerNumber} · {c.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Tampilkan Tagihan</button>
      </form>

      {selected && (
        <form action={createPaymentAction} className="card space-y-4 p-6">
          <input type="hidden" name="customerId" value={selected.id} />
          <h2 className="font-medium">
            {selected.name} — sisa tagihan {formatRupiah(totalOutstanding)}
          </h2>

          {selected.invoices.length === 0 ? (
            <EmptyState message="Tidak ada invoice berjalan." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="th">Invoice</th>
                    <th className="th">Jatuh Tempo</th>
                    <th className="th">Total</th>
                    <th className="th">Sisa</th>
                    <th className="th">Alokasi (Rp)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selected.invoices.map((inv) => {
                    const outstanding = inv.totalAmount - inv.paidAmount;
                    return (
                      <tr key={inv.id}>
                        <td className="td whitespace-nowrap font-mono text-xs">{inv.invoiceNumber}</td>
                        <td className="td whitespace-nowrap text-xs">{formatDateTime(inv.dueAt)}</td>
                        <td className="td whitespace-nowrap text-xs">{formatRupiah(inv.totalAmount)}</td>
                        <td className="td whitespace-nowrap text-xs font-medium">{formatRupiah(outstanding)}</td>
                        <td className="td">
                          <input
                            name={`alloc_${inv.id}`}
                            inputMode="numeric"
                            className="input w-36"
                            placeholder={outstanding.toString()}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-slate-500">
                Kosongkan baris yang tidak dibayar. Isi sebagian untuk pembayaran parsial.
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="amount">Nominal Diterima (Rp)</label>
              <input id="amount" name="amount" inputMode="numeric" className="input" required />
            </div>
            <div>
              <label className="label" htmlFor="method">Metode</label>
              <select id="method" name="method" className="input" required defaultValue="CASH">
                <option value="CASH">Tunai</option>
                <option value="TRANSFER">Transfer Bank</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="cashbookId">Kas Tujuan Setoran</label>
              <select id="cashbookId" name="cashbookId" className="input" required defaultValue="">
                <option value="" disabled>— pilih —</option>
                {cashbooks.map((cb) => (
                  <option key={cb.id} value={cb.id}>{cb.code} · {cb.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="merchantId">Merchant / Kolektor</label>
              <select id="merchantId" name="merchantId" className="input" defaultValue="">
                <option value="">— langsung kantor —</option>
                {merchants.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} (fee {m.feePercent}%)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="feeAmount">Fee (Rp — kosongkan = otomatis dari % merchant)</label>
              <input id="feeAmount" name="feeAmount" inputMode="numeric" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="paidAt">Tanggal Bayar</label>
              <input id="paidAt" name="paidAt" type="datetime-local" className="input" required />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="notes">Catatan</label>
            <textarea id="notes" name="notes" rows={2} className="input" />
          </div>
          <button type="submit" className="btn-primary">Buat Draft Pembayaran</button>
        </form>
      )}
    </div>
  );
}
