import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  CASH_TX_TYPES,
  CASH_TX_LABELS,
  formatRupiah,
} from "@/lib/constants";
import { PageHeader, Flash, BackLink } from "@/components/ui";
import { createCashAction } from "../actions";

export const metadata = { title: "Transaksi Kas Baru" };

export default async function NewCashTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; error?: string; projectId?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.CASH_CREATE);
  const sp = await searchParams;
  const type = sp.type ?? "";
  if (!Object.values(CASH_TX_TYPES).includes(type as never)) notFound();
  if (
    (type === CASH_TX_TYPES.TOP_UP || type === CASH_TX_TYPES.CASH_TRANSFER) &&
    !user.permissions.has(PERMISSIONS.CASH_MANAGE)
  ) {
    notFound();
  }

  const [cashbooks, categories, costCenters, workOrders, projects, myAdvances] =
    await Promise.all([
      db.cashbook.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
      db.category.findMany({
        where: { type: "EXPENSE", isActive: true },
        orderBy: { name: "asc" },
      }),
      db.costCenter.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
      db.workOrder.findMany({
        where: { status: { notIn: ["CANCELLED"] } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.project.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" } }),
      type === CASH_TX_TYPES.ADVANCE_SETTLEMENT
        ? db.cashTransaction.findMany({
            where: {
              type: CASH_TX_TYPES.CASH_ADVANCE,
              status: "POSTED",
              reversedById: null,
              settledAt: null,
            },
            include: { cashbook: true },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
    ]);

  const isExpenseLike =
    type === CASH_TX_TYPES.EXPENSE || type === CASH_TX_TYPES.REIMBURSEMENT;
  const isSettlement = type === CASH_TX_TYPES.ADVANCE_SETTLEMENT;
  const isAdvance = type === CASH_TX_TYPES.CASH_ADVANCE;
  const isTransfer = type === CASH_TX_TYPES.CASH_TRANSFER;

  return (
    <div className="max-w-2xl">
      <BackLink href="/finance/transactions" label="Kembali ke daftar transaksi" />
      <PageHeader
        title={`${CASH_TX_LABELS[type]} Baru`}
        subtitle="Draft belum mengubah saldo. Bukti diunggah di halaman detail setelah draft dibuat."
      />
      <Flash error={sp.error} />

      <form action={createCashAction} className="card space-y-4 p-6">
        <input type="hidden" name="type" value={type} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="cashbookId">
              {isTransfer ? "Cashbook Asal" : "Cashbook"}
            </label>
            <select id="cashbookId" name="cashbookId" className="input" required defaultValue="">
              <option value="" disabled>— pilih —</option>
              {cashbooks.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name} ({formatRupiah(c.balance)})
                </option>
              ))}
            </select>
          </div>
          {isTransfer && (
            <div>
              <label className="label" htmlFor="cashbookToId">Cashbook Tujuan</label>
              <select id="cashbookToId" name="cashbookToId" className="input" required defaultValue="">
                <option value="" disabled>— pilih —</option>
                {cashbooks.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                ))}
              </select>
            </div>
          )}
          {isSettlement && (
            <div className="sm:col-span-2">
              <label className="label" htmlFor="advanceId">Advance yang Di-settle</label>
              <select id="advanceId" name="advanceId" className="input" required defaultValue="">
                <option value="" disabled>— pilih advance —</option>
                {myAdvances.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.txNumber} — {formatRupiah(a.amount)} (sisa {formatRupiah(a.amount - a.settledAmount)}) · {a.cashbook.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="label" htmlFor="amount">
              {isSettlement ? "Porsi Belanja / Terpakai (Rp)" : "Nominal (Rp)"}
            </label>
            <input id="amount" name="amount" inputMode="numeric" className="input" required={!isSettlement} defaultValue={isSettlement ? "0" : ""} />
          </div>
          {isSettlement && (
            <div>
              <label className="label" htmlFor="cashReturnAmount">Kas Dikembalikan (Rp)</label>
              <input id="cashReturnAmount" name="cashReturnAmount" inputMode="numeric" className="input" defaultValue="0" />
            </div>
          )}
          {isAdvance && (
            <div>
              <label className="label" htmlFor="dueDate">Tanggal Settlement (wajib)</label>
              <input id="dueDate" name="dueDate" type="date" className="input" required />
            </div>
          )}
          {(isExpenseLike || isSettlement) && (
            <>
              <div>
                <label className="label" htmlFor="categoryId">Kategori</label>
                <select id="categoryId" name="categoryId" className="input" defaultValue="">
                  <option value="">— pilih —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="costCenterId">Cost Center</label>
                <select id="costCenterId" name="costCenterId" className="input" defaultValue="">
                  <option value="">— pilih —</option>
                  {costCenters.map((c) => (
                    <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          {type === CASH_TX_TYPES.EXPENSE && (
            <div>
              <label className="label" htmlFor="recipient">Penerima Dana</label>
              <input id="recipient" name="recipient" className="input" required />
            </div>
          )}
          {(isExpenseLike || isSettlement) && (
            <div>
              <label className="label" htmlFor="receiptRef">No. Nota</label>
              <input id="receiptRef" name="receiptRef" className="input" placeholder="deteksi duplikasi nota" />
            </div>
          )}
          <div className="sm:col-span-2">
            <label className="label" htmlFor="purpose">Tujuan (wajib)</label>
            <input id="purpose" name="purpose" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="workOrderId">Referensi Work Order</label>
            <select id="workOrderId" name="workOrderId" className="input" defaultValue="">
              <option value="">— tidak terkait —</option>
              {workOrders.map((wo) => (
                <option key={wo.id} value={wo.id}>{wo.woNumber}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="projectId">Referensi Proyek</label>
            <select id="projectId" name="projectId" className="input" defaultValue={sp.projectId ?? ""}>
              <option value="">— tidak terkait —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.projectNumber} — {p.name}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="referenceNote">Catatan Referensi</label>
            <input id="referenceNote" name="referenceNote" className="input" />
          </div>
        </div>
        <button type="submit" className="btn-primary">Simpan Draft</button>
      </form>
    </div>
  );
}
