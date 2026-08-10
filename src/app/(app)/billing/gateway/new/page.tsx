import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, GATEWAY_PROVIDERS, formatRupiah, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, BackLink, EmptyState } from "@/components/ui";
import { createGatewayTxAction } from "../../actions";

export const metadata = { title: "Bundle Gateway Baru" };

export default async function NewGatewayTxPage({
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
  const gatewayIntegrations = await db.integration.findMany({
    where: { category: "CRM_CUSTOMER" },
    orderBy: { code: "asc" },
  });

  return (
    <div className="max-w-3xl">
      <BackLink href="/billing/gateway" label="Kembali ke daftar bundle" />
      <PageHeader
        title="Bundle Gateway Baru"
        subtitle="Gabungkan beberapa invoice menjadi satu tagihan gateway. Nominal = total sisa tagihan invoice terpilih."
      />
      <Flash error={sp.error} />

      <form method="GET" className="card mb-6 flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="customerId">Pelanggan</label>
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
        <form action={createGatewayTxAction} className="card space-y-4 p-6">
          <input type="hidden" name="customerId" value={selected.id} />
          <h2 className="font-medium">{selected.name}</h2>

          {selected.invoices.length === 0 ? (
            <EmptyState message="Tidak ada invoice berjalan." />
          ) : (
            <div className="space-y-2">
              {selected.invoices.map((inv) => (
                <label key={inv.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <input type="checkbox" name="invoiceIds" value={inv.id} className="h-4 w-4" defaultChecked />
                  <span className="font-mono text-xs">{inv.invoiceNumber}</span>
                  <span className="flex-1 text-xs text-slate-500">
                    tempo {formatDateTime(inv.dueAt)}
                  </span>
                  <span className="font-medium">{formatRupiah(inv.totalAmount - inv.paidAmount)}</span>
                </label>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="provider">Provider</label>
              <select id="provider" name="provider" className="input" required defaultValue="">
                <option value="" disabled>— pilih —</option>
                {GATEWAY_PROVIDERS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="integrationId">Integrasi (webhook)</label>
              <select id="integrationId" name="integrationId" className="input" defaultValue="">
                <option value="">— belum tersambung —</option>
                {gatewayIntegrations.map((i) => (
                  <option key={i.id} value={i.id}>{i.code}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="expiresAt">Kedaluwarsa</label>
              <input id="expiresAt" name="expiresAt" type="datetime-local" className="input" />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Payment URL akan terisi saat adapter gateway live tersambung (butuh kredensial provider — keputusan §11.7).
          </p>
          <button type="submit" className="btn-primary">Buat Bundle</button>
        </form>
      )}
    </div>
  );
}
