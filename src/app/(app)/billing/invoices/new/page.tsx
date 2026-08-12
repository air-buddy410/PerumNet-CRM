import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, INVOICE_LINE_KINDS } from "@/lib/constants";
import { PageHeader, Flash, BackLink } from "@/components/ui";
import { createManualInvoiceAction } from "../../actions";

export const metadata = { title: "Invoice Manual" };

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermission(PERMISSIONS.INVOICES_CREATE);
  const sp = await searchParams;
  const customers = await db.customer.findMany({
    where: { status: "ACTIVE" },
    include: { subscriptions: { where: { status: { notIn: ["TERMINATED"] } } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-3xl">
      <BackLink href="/billing/invoices" label="Kembali ke daftar invoice" />
      <PageHeader
        title="Invoice Manual"
        subtitle="Untuk biaya instalasi, penyesuaian, atau tagihan di luar siklus bulanan. Tagihan bulanan dibuat via Invoice Run."
      />
      <Flash error={sp.error} />

      <form action={createManualInvoiceAction} className="card space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="customerId">Pelanggan</label>
            <select id="customerId" name="customerId" className="input" required defaultValue="">
              <option value="" disabled>— pilih —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.customerNumber} · {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="subscriptionId">Langganan (opsional)</label>
            <select id="subscriptionId" name="subscriptionId" className="input" defaultValue="">
              <option value="">— tidak terkait langganan —</option>
              {customers.flatMap((c) =>
                c.subscriptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.serviceNumber} ({c.name})</option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="type">Jenis</label>
            <select id="type" name="type" className="input" required defaultValue="MANUAL">
              <option value="INSTALLATION">Biaya Instalasi</option>
              <option value="ADJUSTMENT">Penyesuaian</option>
              <option value="MANUAL">Manual</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="taxPercent">PPN (%)</label>
            <input id="taxPercent" name="taxPercent" type="number" step="0.01" min={0} max={100} className="input" required defaultValue={11} />
          </div>
          <div>
            <label className="label" htmlFor="dueAt">Jatuh Tempo</label>
            <input id="dueAt" name="dueAt" type="date" className="input" required />
          </div>
        </div>

        <div>
          <p className="label">Baris Tagihan (isi deskripsi untuk baris yang dipakai)</p>
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="crm-invoice-line-grid grid grid-cols-[8rem_1fr_4rem_8rem] gap-2">
                <select name={`line${i}_kind`} className="input" defaultValue={i === 0 ? "INSTALLATION" : "ADJUSTMENT"}>
                  {INVOICE_LINE_KINDS.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <input name={`line${i}_description`} className="input" placeholder={`Deskripsi baris ${i + 1}`} />
                <input name={`line${i}_quantity`} type="number" min={1} className="input" defaultValue={1} />
                <input name={`line${i}_unitPrice`} inputMode="numeric" className="input" placeholder="Harga (Rp)" />
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Harga negatif hanya untuk baris Diskon/Penyesuaian. Total akhir harus lebih dari nol.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="notes">Catatan</label>
          <textarea id="notes" name="notes" rows={2} className="input" />
        </div>
        <button type="submit" className="btn-primary">Terbitkan Invoice</button>
      </form>
    </div>
  );
}
