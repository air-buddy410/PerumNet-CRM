import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, SUSPENSION_REASONS, formatRupiah, formatDateTime, statusLabel } from "@/lib/constants";
import { reminderList } from "@/lib/dunning";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import {
  saveDunningPolicyAction,
  evaluateDunningAction,
  suspendManualAction,
  restoreSuspensionAction,
} from "./actions";

export const metadata = { title: "Isolir & Dunning" };

export default async function IsolirPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.BILLING_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.DUNNING_MANAGE);

  const [policy, suspensions, activeSubs, reminders] = await Promise.all([
    db.dunningPolicy.findFirst({ orderBy: { name: "asc" } }),
    db.serviceSuspension.findMany({
      include: {
        subscription: { include: { customer: true } },
        policy: true,
        createdBy: true,
      },
      orderBy: { suspendedAt: "desc" },
      take: 60,
    }),
    db.subscription.findMany({
      where: { status: "ACTIVE" },
      include: { customer: true },
      orderBy: { serviceNumber: "asc" },
    }),
    reminderList(),
  ]);
  const reasonLabel = (r: string) => SUSPENSION_REASONS.find(([v]) => v === r)?.[1] ?? r;
  const active = suspensions.filter((s) => !s.restoredAt);

  return (
    <div>
      <PageHeader
        title="Isolir & Dunning"
        subtitle="Isolir adalah event bercatat lewat antrian router — tidak pernah langsung dari UI (DESIGN-PHASE-8 §4). Pemulihan otomatis saat tunggakan lunas."
        action={
          canManage ? (
            <form action={evaluateDunningAction}>
              <button type="submit" className="btn-primary">Evaluasi Sekarang</button>
            </form>
          ) : undefined
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <div className="card overflow-x-auto">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-medium">
              Isolir Aktif ({active.length}) & Riwayat
            </h2>
            {suspensions.length === 0 ? (
              <EmptyState message="Belum ada isolir. 🎉" />
            ) : (
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="th">Layanan</th>
                    <th className="th">Pelanggan</th>
                    <th className="th">Alasan</th>
                    <th className="th">Tunggakan</th>
                    <th className="th">Diisolir</th>
                    <th className="th">Status</th>
                    {canManage && <th className="th"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {suspensions.map((s) => (
                    <tr key={s.id} className={s.restoredAt ? "opacity-60" : "bg-red-50/30"}>
                      <td className="td whitespace-nowrap font-mono text-xs">{s.subscription.serviceNumber}</td>
                      <td className="td whitespace-nowrap text-xs font-medium">{s.subscription.customer.name}</td>
                      <td className="td whitespace-nowrap text-xs">
                        {reasonLabel(s.reason)}
                        <span className="block text-[10px] text-slate-400">
                          {s.triggeredBy === "SYSTEM" ? "otomatis" : (s.createdBy?.name ?? "manual")}
                          {s.policy ? ` · ${s.policy.name}` : ""}
                        </span>
                      </td>
                      <td className="td whitespace-nowrap text-xs">
                        {s.unpaidInvoices ? `${s.unpaidInvoices} inv · ${formatRupiah(s.unpaidAmount)}` : "-"}
                      </td>
                      <td className="td whitespace-nowrap text-xs">{formatDateTime(s.suspendedAt)}</td>
                      <td className="td">
                        {s.restoredAt ? (
                          <Badge value="ACTIVE" label={`Pulih ${formatDateTime(s.restoredAt)}`} />
                        ) : (
                          <Badge value="ISOLATED" label={statusLabel("ISOLATED")} />
                        )}
                      </td>
                      {canManage && (
                        <td className="td text-right text-xs">
                          {!s.restoredAt && (
                            <form action={restoreSuspensionAction} className="inline-flex items-center gap-1">
                              <input type="hidden" name="suspensionId" value={s.id} />
                              <input name="note" className="input w-32 px-1 py-0.5 text-xs" placeholder="catatan" />
                              <button type="submit" className="text-brand-600 hover:underline">Pulihkan</button>
                            </form>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card overflow-x-auto">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-medium">
              Pengingat Jatuh Tempo Hari Ini (offset kebijakan — kirim WA menyusul Fase 15)
            </h2>
            {reminders.length === 0 ? (
              <EmptyState message="Tidak ada invoice pada offset pengingat hari ini." />
            ) : (
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="th">Offset</th>
                    <th className="th">Invoice</th>
                    <th className="th">Pelanggan</th>
                    <th className="th">Jatuh Tempo</th>
                    <th className="th">Sisa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reminders.map((r) => (
                    <tr key={`${r.offset}-${r.invoiceId}`}>
                      <td className="td text-xs">
                        {r.offset < 0 ? `H${r.offset}` : r.offset === 0 ? "Hari-H" : `H+${r.offset}`}
                      </td>
                      <td className="td whitespace-nowrap font-mono text-xs">{r.invoiceNumber}</td>
                      <td className="td whitespace-nowrap text-xs">{r.customerName}</td>
                      <td className="td whitespace-nowrap text-xs">{formatDateTime(r.dueAt)}</td>
                      <td className="td whitespace-nowrap text-xs font-medium">{formatRupiah(r.outstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {canManage && (
          <div className="space-y-6">
            <div className="card h-fit p-5">
              <h2 className="mb-1 font-medium">Kebijakan Dunning</h2>
              <p className="mb-3 text-xs text-slate-500">
                Dua ambang (§11.4) — mana yang lebih dulu tercapai. Kosongkan salah satu bila tidak dipakai.
              </p>
              <form action={saveDunningPolicyAction} className="space-y-3">
                {policy && <input type="hidden" name="id" value={policy.id} />}
                <div>
                  <label className="label" htmlFor="name">Nama</label>
                  <input id="name" name="name" className="input" required defaultValue={policy?.name ?? "Kebijakan Standar"} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="graceDays">Masa Tenggang (hari)</label>
                    <input id="graceDays" name="graceDays" type="number" min={0} max={60} className="input" required defaultValue={policy?.graceDays ?? 0} />
                  </div>
                  <div>
                    <label className="label" htmlFor="reminderOffsets">Offset Pengingat</label>
                    <input id="reminderOffsets" name="reminderOffsets" className="input" required defaultValue={policy?.reminderOffsets ?? "-3,0,3"} />
                  </div>
                  <div>
                    <label className="label" htmlFor="isolateAfterDays">Ambang Hari Lewat Tempo</label>
                    <input id="isolateAfterDays" name="isolateAfterDays" type="number" min={1} max={365} className="input" defaultValue={policy?.isolateAfterDays ?? ""} />
                  </div>
                  <div>
                    <label className="label" htmlFor="maxUnpaidInvoices">Ambang Jumlah Tunggakan</label>
                    <input id="maxUnpaidInvoices" name="maxUnpaidInvoices" type="number" min={1} max={24} className="input" defaultValue={policy?.maxUnpaidInvoices ?? ""} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isActive" className="h-4 w-4" defaultChecked={policy?.isActive ?? true} />
                  Aktif
                </label>
                <button type="submit" className="btn-primary w-full justify-center">Simpan Kebijakan</button>
              </form>
            </div>

            <div className="card h-fit p-5">
              <h2 className="mb-1 font-medium">Isolir Manual</h2>
              <p className="mb-3 text-xs text-slate-500">
                Untuk permintaan pelanggan / penyalahgunaan. Tunggakan pakai tombol Evaluasi.
              </p>
              <form action={suspendManualAction} className="space-y-3">
                <select name="subscriptionId" className="input" required defaultValue="">
                  <option value="" disabled>— pilih langganan aktif —</option>
                  {activeSubs.map((s) => (
                    <option key={s.id} value={s.id}>{s.serviceNumber} · {s.customer.name}</option>
                  ))}
                </select>
                <select name="reason" className="input" required defaultValue="REQUEST">
                  {SUSPENSION_REASONS.filter(([v]) => v !== "OVERDUE").map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <textarea name="note" rows={2} className="input" placeholder="Catatan alasan (wajib)" required />
                <button type="submit" className="btn-danger w-full justify-center">Isolir</button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
