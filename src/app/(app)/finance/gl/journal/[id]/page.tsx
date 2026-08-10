import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatRupiah, formatDateTime, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge } from "@/components/ui";
import { reverseJournalAction } from "../../actions";

export const metadata = { title: "Detail Jurnal" };

export default async function JournalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.GL_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const entry = await db.journalEntry.findUnique({
    where: { id },
    include: {
      lines: { include: { account: true, costCenter: true } },
      postedBy: true,
      reversalOf: true,
      reversal: true,
    },
  });
  if (!entry) notFound();

  const canPost = user.permissions.has(PERMISSIONS.GL_POST);
  const totalDebit = entry.lines.reduce((acc, l) => acc + l.debit, 0n);
  const totalCredit = entry.lines.reduce((acc, l) => acc + l.credit, 0n);

  return (
    <div className="max-w-4xl">
      <BackLink href="/finance/gl/journal" label="Kembali ke jurnal umum" />
      <PageHeader
        title={entry.entryNumber}
        subtitle={`${entry.source} · ${formatDateTime(entry.entryDate)} · ${entry.postedBy?.name ?? "Sistem"}${entry.memo ? ` · ${entry.memo}` : ""}`}
        action={<Badge value={entry.status} label={statusLabel(entry.status)} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      {entry.reversalOf && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Jurnal balik dari{" "}
          <Link href={`/finance/gl/journal/${entry.reversalOf.id}`} className="font-semibold underline">
            {entry.reversalOf.entryNumber}
          </Link>.
        </div>
      )}
      {entry.reversal && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Sudah dibalik oleh{" "}
          <Link href={`/finance/gl/journal/${entry.reversal.id}`} className="font-semibold underline">
            {entry.reversal.entryNumber}
          </Link>.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Akun</th>
                <th className="th">Keterangan</th>
                <th className="th">Debit</th>
                <th className="th">Kredit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entry.lines.map((l) => (
                <tr key={l.id}>
                  <td className="td whitespace-nowrap text-xs">
                    <span className="font-mono">{l.account.code}</span> {l.account.name}
                  </td>
                  <td className="td text-xs">{l.description ?? "-"}</td>
                  <td className="td whitespace-nowrap text-xs">{l.debit > 0n ? formatRupiah(l.debit) : "-"}</td>
                  <td className="td whitespace-nowrap text-xs">{l.credit > 0n ? formatRupiah(l.credit) : "-"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 font-semibold">
              <tr>
                <td colSpan={2} className="td text-right text-xs">Total</td>
                <td className="td whitespace-nowrap text-xs">{formatRupiah(totalDebit)}</td>
                <td className="td whitespace-nowrap text-xs">{formatRupiah(totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {canPost && entry.status === "POSTED" && !entry.reversalOfId && !entry.reversal && (
          <div className="card h-fit p-5">
            <h2 className="mb-3 text-sm font-medium">Jurnal Balik</h2>
            <p className="mb-3 text-xs text-slate-500">
              Jurnal tidak pernah diedit — koreksi lewat jurnal balik bersisi tukar.
            </p>
            <form action={reverseJournalAction} className="space-y-3">
              <input type="hidden" name="entryId" value={entry.id} />
              <textarea name="reason" rows={2} className="input" placeholder="Alasan (wajib)" required />
              <button type="submit" className="btn-danger w-full justify-center">Balik Jurnal</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
