import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  OPP_STAGES,
  statusLabel,
  formatRupiah,
} from "@/lib/constants";
import { PageHeader, Flash } from "@/components/ui";
import { moveStageAction } from "./actions";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.OPPORTUNITIES_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.OPPORTUNITIES_MANAGE);

  const opportunities = await db.opportunity.findMany({
    include: { lead: { include: { salesOwner: true } } },
    orderBy: { updatedAt: "desc" },
  });

  const totalActive = opportunities.filter(
    (o) => !["WON", "LOST", "ACTIVATED"].includes(o.stage)
  ).length;
  const totalValue = opportunities
    .filter((o) => !["LOST"].includes(o.stage))
    .reduce((sum, o) => sum + (o.estMonthlyValue ?? BigInt(0)), BigInt(0));

  return (
    <div>
      <PageHeader
        title="Sales Pipeline"
        subtitle={`${totalActive} opportunity berjalan · estimasi nilai bulanan ${formatRupiah(totalValue)} · stage Lost diubah dari halaman lead (wajib alasan)`}
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4" style={{ minWidth: "max-content" }}>
          {OPP_STAGES.map((stage) => {
            const items = opportunities.filter((o) => o.stage === stage);
            return (
              <div key={stage} className="w-64 shrink-0">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-[#6f817f]">
                    {statusLabel(stage)}
                  </span>
                  <span className="crm-badge is-neutral">{items.length}</span>
                </div>
                <div className="space-y-3">
                  {items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#dce8e5] p-4 text-center text-xs text-[#99a8a6]">
                      Kosong
                    </div>
                  ) : (
                    items.map((o) => (
                      <div key={o.id} className="card p-4">
                        <Link
                          href={`/sales/leads/${o.leadId}`}
                          className="text-sm font-bold text-[#04a99f] hover:underline"
                        >
                          {o.lead.name}
                        </Link>
                        <div className="mt-1 text-xs text-[#718185]">
                          {o.oppNumber}
                          {o.lead.salesOwner ? ` · ${o.lead.salesOwner.name}` : ""}
                        </div>
                        <div className="mt-1 text-xs font-semibold text-[#33484a]">
                          {o.estMonthlyValue ? `${formatRupiah(o.estMonthlyValue)}/bln` : "—"}
                        </div>
                        {canManage && !["LOST"].includes(o.stage) && (
                          <form action={moveStageAction} className="mt-3 flex gap-2">
                            <input type="hidden" name="oppId" value={o.id} />
                            <select
                              name="stage"
                              className="input px-2 py-1 text-xs"
                              defaultValue={o.stage}
                            >
                              {OPP_STAGES.filter((s) => s !== "LOST").map((s) => (
                                <option key={s} value={s}>
                                  {statusLabel(s)}
                                </option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              className="btn-secondary px-2 py-1 text-xs"
                            >
                              OK
                            </button>
                          </form>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
