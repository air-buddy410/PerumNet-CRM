import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  APPROVAL_MODULES,
  formatRupiah,
} from "@/lib/constants";
import { PageHeader, ActiveBadge, Flash } from "@/components/ui";
import { stepApproverLabel } from "@/lib/approval";
import { toggleRuleAction } from "./actions";

export const metadata = { title: "Approval Matrix" };

export default async function ApprovalRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requirePermission(PERMISSIONS.APPROVALS_CONFIGURE);
  const sp = await searchParams;

  const rules = await db.approvalRule.findMany({
    include: {
      steps: { include: { role: true }, orderBy: { stepOrder: "asc" } },
    },
    orderBy: [{ module: "asc" }, { minAmount: "asc" }],
  });

  const grouped = APPROVAL_MODULES.map((m) => ({
    ...m,
    rules: rules.filter((r) => r.module === m.code),
  })).filter((g) => g.rules.length > 0);

  return (
    <div>
      <PageHeader
        title="Approval Matrix"
        subtitle="Atur jalur persetujuan berdasarkan modul, subtipe, dan rentang nilai. Struktur aturan dikelola melalui konfigurasi terkontrol."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="space-y-6">
        {grouped.map((group) => (
          <section key={group.code} className="card">
            <div className="border-b border-slate-100 px-5 py-4 font-medium">
              {group.name}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="th">Rule</th>
                    <th className="th">Subtipe</th>
                    <th className="th">Rentang Nilai</th>
                    <th className="th">Jalur Approval</th>
                    <th className="th">Status</th>
                    <th className="th"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {group.rules.map((r) => (
                    <tr key={r.id}>
                      <td className="td font-medium">{r.name}</td>
                      <td className="td">{r.subtype ?? "-"}</td>
                      <td className="td whitespace-nowrap">
                        {r.minAmount === BigInt(0) && r.maxAmount === null
                          ? "Semua nilai"
                          : `${formatRupiah(r.minAmount)} – ${r.maxAmount === null ? "∞" : formatRupiah(r.maxAmount)}`}
                      </td>
                      <td className="td">
                        <div className="flex flex-wrap items-center gap-1">
                          {r.steps.map((s, i) => (
                            <span key={s.id} className="inline-flex items-center gap-1">
                              {i > 0 && <span className="text-slate-300">→</span>}
                              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                                {stepApproverLabel(s)}
                              </span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="td">
                        <ActiveBadge isActive={r.isActive} />
                      </td>
                      <td className="td text-right">
                        <form action={toggleRuleAction}>
                          <input type="hidden" name="ruleId" value={r.id} />
                          <button type="submit" className="text-xs text-brand-600 hover:underline">
                            {r.isActive ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
