import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PageHeader, Flash, EmptyState } from "@/components/ui";
import { loadMailboxOverview } from "@/lib/mailserver";
import { SYNC_STATE_LABELS, type MailboxSyncState } from "@/lib/mailbox-tag";
import { pushTagAction, pushAllTagsAction } from "../mailserver/actions";

export const metadata = { title: "Mailbox" };

const STATE_STYLE: Record<MailboxSyncState, string> = {
  MATCHED: "bg-emerald-100 text-emerald-800",
  TAG_MISMATCH: "bg-amber-100 text-amber-900",
  TAG_MISSING: "bg-amber-100 text-amber-900",
  TAG_AMBIGUOUS: "bg-rose-100 text-rose-800",
  NO_DIVISION_IN_CRM: "bg-rose-100 text-rose-800",
  NO_CRM_ACCOUNT: "bg-slate-200 text-slate-700",
  NO_MAILBOX: "bg-slate-200 text-slate-700",
};

export default async function MailboxesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requirePermission(PERMISSIONS.ACCESS_MANAGE);
  const sp = await searchParams;
  const overview = await loadMailboxOverview();
  const { rows, summary, divisionNames } = overview;

  return (
    <div>
      <PageHeader
        title="Mailbox"
        subtitle="Divisi ditetapkan di CRM lalu didorong ke mailcow sebagai tag. Yang berbeda ditampilkan lebih dulu — tidak ada yang diterapkan diam-diam."
        action={
          summary.actionable > 0 ? (
            <form action={pushAllTagsAction}>
              <button type="submit" className="btn-primary">
                Terapkan {summary.actionable} perubahan
              </button>
            </form>
          ) : undefined
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      {overview.error && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-medium text-amber-900">Mailserver belum bisa dibaca</p>
          <p className="mt-1 text-amber-800">{overview.error}</p>
          <Link href="/it/mailserver" className="mt-2 inline-block text-amber-900 underline">
            Buka setting mailserver
          </Link>
        </div>
      )}

      {!overview.error && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Total", summary.total],
            ["Sesuai", summary.matched],
            ["Perlu ditindak", summary.actionable],
            ["Tanpa akun CRM", summary.noCrmAccount],
            ["Tanpa mailbox", summary.noMailbox],
          ].map(([label, value]) => (
            <div key={String(label)} className="card p-3">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState
            message={
              overview.error
                ? "Belum ada data — perbaiki sambungan mailserver dulu."
                : "Tidak ada mailbox maupun akun untuk dibandingkan."
            }
          />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Alamat</th>
                <th className="th">Divisi di CRM</th>
                <th className="th">Tag di mailcow</th>
                <th className="th">Tag lain</th>
                <th className="th">Keadaan</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.email} className="hover:bg-slate-50">
                  <td className="td whitespace-nowrap font-mono text-xs">{r.email}</td>
                  {/* Divisi CRM dan tag mailcow ditampilkan BERDAMPINGAN.
                      Menampilkan satu nilai gabungan menyembunyikan justru
                      hal yang perlu diputuskan orangnya. */}
                  <td className="td whitespace-nowrap text-xs">
                    {r.crmDivisionCode ? (
                      <>
                        {divisionNames[r.crmDivisionCode] ?? r.crmDivisionCode}
                        <span className="ml-1 font-mono text-[10px] text-slate-400">
                          {r.crmDivisionCode}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="td whitespace-nowrap text-xs">
                    {r.divisionTags.length === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className={r.divisionTags.length > 1 ? "text-rose-700" : ""}>
                        {r.divisionTags.join(", ")}
                      </span>
                    )}
                  </td>
                  <td className="td text-xs text-slate-500">
                    {r.foreignTags.length ? r.foreignTags.join(", ") : "—"}
                  </td>
                  <td className="td whitespace-nowrap">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${STATE_STYLE[r.state]}`}>
                      {SYNC_STATE_LABELS[r.state]}
                    </span>
                  </td>
                  <td className="td text-right text-xs">
                    {r.actionable && (
                      <form action={pushTagAction}>
                        <input type="hidden" name="email" value={r.email} />
                        <button type="submit" className="text-brand-600 hover:underline">
                          Terapkan
                        </button>
                      </form>
                    )}
                    {r.state === "NO_DIVISION_IN_CRM" && (
                      <span className="text-slate-400" title="Isi divisinya di CRM dulu">
                        isi divisi di CRM
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Tag milik IT yang bukan <span className="font-mono">divisi-*</span> selalu dipertahankan
        saat CRM menulis. Mailbox bersama seperti{" "}
        <span className="font-mono">info@</span> muncul sebagai &ldquo;Tanpa akun CRM&rdquo; — itu
        bukan kesalahan, jadi tidak ada aksi yang ditawarkan.
      </p>
    </div>
  );
}
