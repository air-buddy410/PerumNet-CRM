import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import {
  PERMISSIONS,
  CASH_TX_TYPES,
  CASH_TX_LABELS,
  CASH_TYPES_NEED_APPROVAL,
  statusLabel,
  formatRupiah,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge, EmptyState } from "@/components/ui";
import {
  submitCashAction,
  postCashAction,
  cancelCashAction,
  reverseCashAction,
  uploadCashEvidenceAction,
} from "../actions";

export const metadata = { title: "Detail Transaksi Kas" };

export default async function CashTransactionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;

  const tx = await db.cashTransaction.findUnique({
    where: { id },
    include: {
      cashbook: true,
      cashbookTo: true,
      category: true,
      costCenter: true,
      workOrder: true,
      project: true,
      advance: true,
      settlements: { orderBy: { createdAt: "desc" } },
      claimant: true,
      createdBy: true,
      postedBy: true,
      reversalOf: true,
      reversedBy: true,
    },
  });
  if (!tx) notFound();

  const isFinanceViewer = user.permissions.has(PERMISSIONS.FINANCE_VIEW);
  if (!isFinanceViewer && tx.createdById !== user.id) notFound();

  const [attachments, approval] = await Promise.all([
    db.attachment.findMany({
      where: { entityType: "CashTransaction", entityId: id },
      include: { uploadedBy: true },
      orderBy: { createdAt: "desc" },
    }),
    tx.approvalRequestId
      ? db.approvalRequest.findUnique({ where: { id: tx.approvalRequestId } })
      : Promise.resolve(null),
  ]);

  const canPost = user.permissions.has(PERMISSIONS.CASH_POST);
  const canReverse = user.permissions.has(PERMISSIONS.CASH_REVERSE);
  const isCreator = tx.createdById === user.id;
  const needsApproval = CASH_TYPES_NEED_APPROVAL.includes(tx.type as never);
  const isAdvance = tx.type === CASH_TX_TYPES.CASH_ADVANCE;
  const overdue =
    isAdvance && tx.status === "POSTED" && !tx.settledAt && tx.dueDate && tx.dueDate < new Date();

  return (
    <div className="max-w-4xl">
      <BackLink href="/finance/transactions" label="Kembali ke daftar transaksi" />
      <PageHeader
        title={tx.txNumber}
        subtitle={`${CASH_TX_LABELS[tx.type]} · ${tx.cashbook.name} · dibuat ${tx.createdBy.name}, ${formatDateTime(tx.createdAt)}`}
        action={
          <Badge
            value={tx.reversedById ? "REVERSED" : tx.status}
            label={tx.reversedById ? "Di-reverse" : statusLabel(tx.status)}
          />
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      {overdue && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Advance ini melewati jatuh tempo ({tx.dueDate!.toLocaleDateString("id-ID")}) dan belum
          diselesaikan — pengajuan advance baru oleh pembuat diblokir (business rule 13).
        </div>
      )}
      {tx.reversalOf && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Reversal dari{" "}
          <Link href={`/finance/transactions/${tx.reversalOf.id}`} className="font-semibold underline">
            {tx.reversalOf.txNumber}
          </Link>.
        </div>
      )}
      {tx.reversedBy && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Telah di-reverse oleh{" "}
          <Link href={`/finance/transactions/${tx.reversedBy.id}`} className="font-semibold underline">
            {tx.reversedBy.txNumber}
          </Link>.
        </div>
      )}
      {approval && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Approval:{" "}
          <Link href={`/approvals/${approval.id}`} className="font-semibold underline">
            {approval.requestNumber}
          </Link>{" "}
          ({statusLabel(approval.status)})
          {approval.status === "APPROVED" && tx.status === "WAITING_APPROVAL"
            ? " — siap diposting Finance."
            : ""}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <div className="card p-6">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Nominal</dt>
                <dd className="mt-0.5 text-sm font-semibold">{formatRupiah(tx.amount)}</dd>
              </div>
              {tx.type === CASH_TX_TYPES.ADVANCE_SETTLEMENT && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Kas Dikembalikan</dt>
                  <dd className="mt-0.5 text-sm">{formatRupiah(tx.cashReturnAmount)}</dd>
                </div>
              )}
              {tx.cashbookTo && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Ke Cashbook</dt>
                  <dd className="mt-0.5 text-sm">{tx.cashbookTo.name}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Kategori</dt>
                <dd className="mt-0.5 text-sm">{tx.category?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Cost Center</dt>
                <dd className="mt-0.5 text-sm">
                  {tx.costCenter ? `${tx.costCenter.code} — ${tx.costCenter.name}` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Penerima</dt>
                <dd className="mt-0.5 text-sm">{tx.recipient ?? tx.claimant?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">No. Nota</dt>
                <dd className="mt-0.5 text-sm">{tx.receiptRef ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-slate-400">Tujuan</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm">{tx.purpose}</dd>
              </div>
              {isAdvance && (
                <>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Jatuh Tempo</dt>
                    <dd className="mt-0.5 text-sm">
                      {tx.dueDate ? tx.dueDate.toLocaleDateString("id-ID") : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">
                      Dipertanggungjawabkan
                    </dt>
                    <dd className="mt-0.5 text-sm">
                      {formatRupiah(tx.settledAmount)} / {formatRupiah(tx.amount)}{" "}
                      {tx.settledAt ? (
                        <Badge value="APPROVED" label="Selesai" />
                      ) : (
                        <Badge value="PENDING" label="Berjalan" />
                      )}
                    </dd>
                  </div>
                </>
              )}
              {tx.workOrder && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Work Order</dt>
                  <dd className="mt-0.5 text-sm">
                    <Link
                      href={`/operations/work-orders/${tx.workOrder.id}`}
                      className="text-brand-600 hover:underline"
                    >
                      {tx.workOrder.woNumber}
                    </Link>
                  </dd>
                </div>
              )}
              {tx.project && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Proyek</dt>
                  <dd className="mt-0.5 text-sm">
                    <Link
                      href={`/projects/${tx.project.id}`}
                      className="text-brand-600 hover:underline"
                    >
                      {tx.project.projectNumber}
                    </Link>
                  </dd>
                </div>
              )}
              {tx.advance && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Advance Induk</dt>
                  <dd className="mt-0.5 text-sm">
                    <Link
                      href={`/finance/transactions/${tx.advance.id}`}
                      className="text-brand-600 hover:underline"
                    >
                      {tx.advance.txNumber}
                    </Link>
                  </dd>
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

          {isAdvance && tx.settlements.length > 0 && (
            <div className="card">
              <div className="border-b border-slate-100 px-5 py-4 font-medium">
                Settlement ({tx.settlements.length})
              </div>
              <ul className="divide-y divide-slate-100">
                {tx.settlements.map((s) => (
                  <li key={s.id} className="flex items-center justify-between px-5 py-3">
                    <Link
                      href={`/finance/transactions/${s.id}`}
                      className="text-sm font-medium text-brand-600 hover:underline"
                    >
                      {s.txNumber}
                    </Link>
                    <span className="text-sm">
                      belanja {formatRupiah(s.amount)} · kas kembali {formatRupiah(s.cashReturnAmount)}
                    </span>
                    <Badge value={s.status} label={statusLabel(s.status)} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card">
            <div className="border-b border-slate-100 px-5 py-4 font-medium">
              Bukti ({attachments.length})
            </div>
            {["DRAFT", "WAITING_APPROVAL"].includes(tx.status) && (isCreator || canPost) && (
              <form
                action={uploadCashEvidenceAction}
                className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4"
              >
                <input type="hidden" name="txId" value={tx.id} />
                <input
                  type="file"
                  name="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="text-sm"
                  required
                />
                <button type="submit" className="btn-secondary">Unggah Bukti</button>
              </form>
            )}
            {attachments.length === 0 ? (
              <EmptyState message="Belum ada bukti — wajib sebelum diajukan/diposting (PRD §7.4)." />
            ) : (
              <div className="grid gap-4 p-5 sm:grid-cols-3">
                {attachments.map((a) => (
                  <a key={a.id} href={`/api/files/${a.id}`} target="_blank" className="block">
                    {a.mimeType.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/files/${a.id}`}
                        alt={a.filename}
                        className="h-32 w-full rounded-lg border border-slate-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-32 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-500">
                        {a.filename}
                      </div>
                    )}
                    <div className="mt-1 truncate text-xs text-slate-500">
                      {a.filename} · {a.uploadedBy.name}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {tx.status === "DRAFT" && needsApproval && isCreator && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Ajukan Approval</h2>
              <p className="mb-3 text-xs text-slate-500">
                Diarahkan ke approver sesuai matrix petty cash (nilai {formatRupiah(tx.amount)}).
              </p>
              <form action={submitCashAction}>
                <input type="hidden" name="txId" value={tx.id} />
                <button type="submit" className="btn-primary w-full justify-center">
                  Ajukan
                </button>
              </form>
            </div>
          )}

          {canPost &&
            ((tx.status === "DRAFT" && !needsApproval) ||
              (tx.status === "WAITING_APPROVAL" && approval?.status === "APPROVED")) && (
              <div className="card p-5">
                <h2 className="mb-3 text-sm font-medium">Posting</h2>
                <p className="mb-3 text-xs text-slate-500">
                  Memvalidasi saldo (tidak boleh negatif) lalu mengubah saldo cashbook.
                  Setelah posting, transaksi immutable.
                </p>
                <form action={postCashAction}>
                  <input type="hidden" name="txId" value={tx.id} />
                  <button type="submit" className="btn-primary w-full justify-center">
                    Posting Sekarang
                  </button>
                </form>
              </div>
            )}

          {tx.status === "DRAFT" && (isCreator || canPost) && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Batalkan Draft</h2>
              <form action={cancelCashAction}>
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
                Membuat transaksi koreksi kebalikan. Periode yang sudah ditutup bulanan terkunci.
              </p>
              <form action={reverseCashAction} className="space-y-3">
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

          {isAdvance && tx.status === "POSTED" && !tx.settledAt && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Settlement</h2>
              <Link
                href={`/finance/transactions/new?type=ADVANCE_SETTLEMENT`}
                className="btn-secondary w-full justify-center"
              >
                Buat Settlement
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
