import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatRupiah, formatDateTime } from "@/lib/constants";
import { PageHeader, Badge, EmptyState, Flash } from "@/components/ui";

export const metadata = { title: "Quotations" };

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.QUOTATIONS_VIEW);
  const sp = await searchParams;

  const quotations = await db.quotation.findMany({
    include: { lead: true, package: true },
    orderBy: [{ createdAt: "desc" }],
  });

  return (
    <div>
      <PageHeader
        title="Quotations"
        subtitle="Quotation Diterima bersifat immutable — revisi selalu membuat versi baru (PRD §11, rule 16). Diskon memerlukan approval."
        action={
          user.permissions.has(PERMISSIONS.QUOTATIONS_CREATE) ? (
            <Link href="/sales/quotations/new" className="btn-primary">+ Quotation</Link>
          ) : undefined
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="card overflow-x-auto">
        {quotations.length === 0 ? (
          <EmptyState message="Belum ada quotation." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Nomor</th>
                <th className="th">Lead</th>
                <th className="th">Paket</th>
                <th className="th">Bulanan</th>
                <th className="th">Diskon</th>
                <th className="th">Berlaku s.d.</th>
                <th className="th">Status</th>
                <th className="th">Dibuat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {quotations.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50">
                  <td className="td whitespace-nowrap">
                    <Link
                      href={`/sales/quotations/${q.id}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {q.quotationNumber} v{q.version}
                    </Link>
                  </td>
                  <td className="td">{q.lead.name}</td>
                  <td className="td text-xs">{q.package.name}</td>
                  <td className="td whitespace-nowrap">{formatRupiah(q.monthlyPrice)}</td>
                  <td className="td whitespace-nowrap">
                    {q.discount > BigInt(0) ? formatRupiah(q.discount) : "-"}
                  </td>
                  <td className="td whitespace-nowrap text-xs">
                    {q.validUntil ? q.validUntil.toLocaleDateString("id-ID") : "-"}
                  </td>
                  <td className="td">
                    <Badge value={q.status} label={statusLabel(q.status)} />
                  </td>
                  <td className="td whitespace-nowrap text-xs text-slate-500">
                    {formatDateTime(q.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
