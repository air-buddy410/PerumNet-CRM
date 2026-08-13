import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  statusLabel,
  formatRupiah,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge } from "@/components/ui";
import { formatUiDate } from "@/components/ui-formatters";
import {
  updateQuotationAction,
  sendQuotationAction,
  decideQuotationAction,
  reviseQuotationAction,
} from "../actions";
import { QuotationFields } from "../quotation-fields";

export const metadata = { title: "Detail Quotation" };

export default async function QuotationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.QUOTATIONS_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const quotation = await db.quotation.findUnique({
    where: { id },
    include: { lead: true, package: true, createdBy: true },
  });
  if (!quotation) notFound();

  const [versions, approvalRequest, packages] = await Promise.all([
    db.quotation.findMany({
      where: { quotationNumber: quotation.quotationNumber },
      orderBy: { version: "asc" },
    }),
    db.approvalRequest.findFirst({
      where: { entityType: "Quotation", entityId: quotation.id },
      orderBy: { createdAt: "desc" },
    }),
    db.package.findMany({ where: { isActive: true }, orderBy: { monthlyPrice: "asc" } }),
  ]);

  const canCreate = user.permissions.has(PERMISSIONS.QUOTATIONS_CREATE);
  const canManage = user.permissions.has(PERMISSIONS.QUOTATIONS_MANAGE);
  const q = quotation;

  const oneTimeGross = q.installationFee + q.deviceFee + q.networkBuildFee;
  const oneTimeNet = oneTimeGross - q.discount;
  const taxFactor = q.taxPercent / 100;
  const oneTimeTax = BigInt(Math.round(Number(oneTimeNet) * taxFactor));
  const monthlyTax = BigInt(Math.round(Number(q.monthlyPrice) * taxFactor));

  return (
    <div className="max-w-4xl">
      <BackLink href="/sales/quotations" label="Kembali ke daftar quotation" />
      <PageHeader
        title={`${q.quotationNumber} v${q.version}`}
        subtitle={`Lead: ${q.lead.leadNumber} — ${q.lead.name} · dibuat ${q.createdBy.name}, ${formatDateTime(q.createdAt)}`}
        action={<Badge value={q.status} label={statusLabel(q.status)} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      {q.status === "ACCEPTED" && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Quotation ini telah diterima pelanggan dan bersifat immutable (rule 16).{" "}
          <Link href={`/sales/leads/${q.leadId}`} className="font-semibold underline">
            Lanjutkan konversi dari halaman lead
          </Link>
          .
        </div>
      )}
      {q.status === "WAITING_APPROVAL" && approvalRequest && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Diskon menunggu approval:{" "}
          <Link href={`/approvals/${approvalRequest.id}`} className="font-semibold underline">
            {approvalRequest.requestNumber}
          </Link>{" "}
          ({statusLabel(approvalRequest.status)}). Setelah disetujui, tekan Kirim lagi.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {q.status === "DRAFT" && canCreate ? (
            <form action={updateQuotationAction} className="card space-y-4 p-6">
              <input type="hidden" name="quotationId" value={q.id} />
              <input type="hidden" name="leadId" value={q.leadId} />
              <h2 className="font-medium">Edit Draft</h2>
              <QuotationFields packages={packages} defaults={q} />
              <button type="submit" className="btn-primary">Simpan Draft</button>
            </form>
          ) : (
            <div className="card p-6">
              <h2 className="mb-4 font-medium">Rincian Penawaran</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-2 text-slate-500">Paket</td>
                    <td className="py-2 text-right font-medium">
                      {q.package.name} ({q.package.downloadMbps}/{q.package.uploadMbps} Mbps)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-500">Biaya bulanan</td>
                    <td className="py-2 text-right">{formatRupiah(q.monthlyPrice)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-500">PPN bulanan ({q.taxPercent}%)</td>
                    <td className="py-2 text-right">{formatRupiah(monthlyTax)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-medium">Total bulanan termasuk PPN</td>
                    <td className="py-2 text-right font-semibold">
                      {formatRupiah(q.monthlyPrice + monthlyTax)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-500">Instalasi</td>
                    <td className="py-2 text-right">{formatRupiah(q.installationFee)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-500">Perangkat tambahan</td>
                    <td className="py-2 text-right">{formatRupiah(q.deviceFee)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-500">Pembangunan jaringan</td>
                    <td className="py-2 text-right">{formatRupiah(q.networkBuildFee)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-500">Diskon</td>
                    <td className="py-2 text-right text-red-600">
                      {q.discount > BigInt(0) ? `- ${formatRupiah(q.discount)}` : "-"}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-500">PPN biaya awal ({q.taxPercent}%)</td>
                    <td className="py-2 text-right">{formatRupiah(oneTimeTax)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-medium">Total biaya awal termasuk PPN</td>
                    <td className="py-2 text-right font-semibold">
                      {formatRupiah(oneTimeNet + oneTimeTax)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-500">Masa kontrak</td>
                    <td className="py-2 text-right">{q.contractMonths} bulan</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-500">Berlaku sampai</td>
                    <td className="py-2 text-right">
                      {formatUiDate(q.validUntil, "-")}
                    </td>
                  </tr>
                </tbody>
                </table>
              </div>
              {q.notes && (
                <p className="mt-4 whitespace-pre-wrap border-t border-slate-100 pt-4 text-sm text-slate-600">
                  {q.notes}
                </p>
              )}
            </div>
          )}

          <div className="card">
            <div className="border-b border-slate-100 px-5 py-4 font-medium">
              Riwayat Versi ({versions.length})
            </div>
            <ul className="divide-y divide-slate-100">
              {versions.map((v) => (
                <li key={v.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    {v.id === q.id ? (
                      <span className="text-sm font-semibold">v{v.version} (sedang dilihat)</span>
                    ) : (
                      <Link
                        href={`/sales/quotations/${v.id}`}
                        className="text-sm font-medium text-brand-600 hover:underline"
                      >
                        v{v.version}
                      </Link>
                    )}
                    <span className="ml-2 text-xs text-slate-400">
                      {formatDateTime(v.createdAt)} · {formatRupiah(v.monthlyPrice)}/bln
                      {v.discount > BigInt(0) ? ` · diskon ${formatRupiah(v.discount)}` : ""}
                    </span>
                  </div>
                  <Badge value={v.status} label={statusLabel(v.status)} />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-6">
          {canManage && ["DRAFT", "WAITING_APPROVAL"].includes(q.status) && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Kirim ke Pelanggan</h2>
              <p className="mb-3 text-xs text-slate-500">
                {q.discount > BigInt(0)
                  ? "Diskon terisi — pengiriman membutuhkan approval yang disetujui."
                  : "Tanpa diskon — dapat langsung dikirim."}
              </p>
              <form action={sendQuotationAction}>
                <input type="hidden" name="quotationId" value={q.id} />
                <button type="submit" className="btn-primary w-full justify-center">
                  Kirim
                </button>
              </form>
            </div>
          )}

          {canManage && q.status === "SENT" && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Keputusan Pelanggan</h2>
              <form action={decideQuotationAction} className="space-y-2">
                <input type="hidden" name="quotationId" value={q.id} />
                <button
                  type="submit"
                  name="decision"
                  value="ACCEPTED"
                  className="btn-primary w-full justify-center"
                >
                  Diterima
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="REJECTED"
                  className="btn-danger w-full justify-center"
                >
                  Ditolak
                </button>
              </form>
            </div>
          )}

          {canManage && !["ACCEPTED", "SUPERSEDED", "DRAFT"].includes(q.status) && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Revisi</h2>
              <p className="mb-3 text-xs text-slate-500">
                Membuat versi baru berstatus Draft; versi ini ditandai Direvisi.
              </p>
              <form action={reviseQuotationAction}>
                <input type="hidden" name="quotationId" value={q.id} />
                <button type="submit" className="btn-secondary w-full justify-center">
                  Buat Versi Baru
                </button>
              </form>
            </div>
          )}

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-medium">Terkait</h2>
            <Link
              href={`/sales/leads/${q.leadId}`}
              className="text-sm text-brand-600 hover:underline"
            >
              Lead {q.lead.leadNumber}
            </Link>
            {approvalRequest && (
              <p className="mt-2 text-sm">
                <Link
                  href={`/approvals/${approvalRequest.id}`}
                  className="text-brand-600 hover:underline"
                >
                  Approval {approvalRequest.requestNumber}
                </Link>{" "}
                <Badge
                  value={approvalRequest.status}
                  label={statusLabel(approvalRequest.status)}
                />
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
