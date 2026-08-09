import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  CASH_TX_LABELS,
  statusLabel,
  formatRupiah,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge, EmptyState } from "@/components/ui";
import { projectReconciliation } from "@/lib/project";
import {
  saveBomLineAction,
  closeProjectAction,
  cancelProjectAction,
  uploadProjectDocAction,
} from "../actions";

export const metadata = { title: "Detail Proyek" };

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.PROJECTS_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const project = await db.project.findUnique({
    where: { id },
    include: {
      manager: true,
      customer: true,
      area: true,
      closedBy: true,
      bomLines: { include: { item: true }, orderBy: { id: "asc" } },
      stockTransactions: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) notFound();

  const [recon, items, docs] = await Promise.all([
    projectReconciliation(id),
    db.item.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.attachment.findMany({
      where: { entityType: "Project", entityId: id },
      include: { uploadedBy: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const canManage = user.permissions.has(PERMISSIONS.PROJECTS_MANAGE);
  const canClose = user.permissions.has(PERMISSIONS.PROJECTS_CLOSE);
  const isOpen = project.status === "OPEN";
  const materialByItem = new Map(recon.materials.map((m) => [m.itemId, m]));
  const readyToClose =
    recon.outstandingDevices.length === 0 &&
    recon.unsettledAdvances.length === 0 &&
    recon.pendingCash.length === 0 &&
    recon.docsCount > 0;

  return (
    <div className="max-w-5xl">
      <BackLink href="/projects" label="Kembali ke daftar proyek" />
      <PageHeader
        title={`${project.projectNumber} — ${project.name}`}
        subtitle={`Manager: ${project.manager.name}${project.customer ? ` · ${project.customer.name}` : ""}${project.area ? ` · ${project.area.name}` : ""}`}
        action={<Badge value={project.status} label={statusLabel(project.status)} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      {isOpen && (
        <div
          className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
            readyToClose
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {readyToClose
            ? "Rekonsiliasi lengkap — proyek siap ditutup."
            : `Belum siap ditutup: ${[
                recon.outstandingDevices.length
                  ? `${recon.outstandingDevices.length} perangkat di custody`
                  : null,
                recon.unsettledAdvances.length
                  ? `${recon.unsettledAdvances.length} advance belum selesai`
                  : null,
                recon.pendingCash.length
                  ? `${recon.pendingCash.length} transaksi kas menggantung`
                  : null,
                recon.docsCount === 0 ? "dokumentasi belum diunggah" : null,
              ]
                .filter(Boolean)
                .join(" · ")}`}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <div className="card p-6">
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Budget</dt>
                <dd className="mt-0.5 text-sm font-semibold">{formatRupiah(project.budget)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Realisasi Biaya</dt>
                <dd
                  className={`mt-0.5 text-sm font-semibold ${
                    project.budget > BigInt(0) && recon.totalActualCost > project.budget
                      ? "text-red-600"
                      : ""
                  }`}
                >
                  {formatRupiah(recon.totalActualCost)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Periode</dt>
                <dd className="mt-0.5 text-sm">
                  {project.startDate ? project.startDate.toLocaleDateString("id-ID") : "—"} s.d.{" "}
                  {project.endDate ? project.endDate.toLocaleDateString("id-ID") : "—"}
                </dd>
              </div>
              {project.closedAt && (
                <div className="sm:col-span-3">
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Ditutup</dt>
                  <dd className="mt-0.5 text-sm">
                    {project.closedBy?.name} · {formatDateTime(project.closedAt)}
                  </dd>
                </div>
              )}
              {project.notes && (
                <div className="sm:col-span-3">
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Catatan</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-sm">{project.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="card">
            <div className="border-b border-slate-100 px-5 py-4 font-medium">
              Bill of Materials vs Realisasi
            </div>
            {project.bomLines.length === 0 && recon.materials.length === 0 ? (
              <EmptyState message="Belum ada BoM / pemakaian material." />
            ) : (
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="th">Item</th>
                    <th className="th text-right">Rencana</th>
                    <th className="th text-right">Keluar</th>
                    <th className="th text-right">Kembali</th>
                    <th className="th text-right">Terpakai (netto)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {project.bomLines.map((line) => {
                    const actual = materialByItem.get(line.itemId);
                    const net = (actual?.issued ?? 0) - (actual?.returned ?? 0);
                    return (
                      <tr key={line.id}>
                        <td className="td">{line.item.name}</td>
                        <td className="td text-right">{line.plannedQty} {line.item.unit}</td>
                        <td className="td text-right">{actual?.issued ?? 0}</td>
                        <td className="td text-right">{actual?.returned ?? 0}</td>
                        <td className={`td text-right font-semibold ${net > line.plannedQty ? "text-red-600" : ""}`}>
                          {net}
                        </td>
                      </tr>
                    );
                  })}
                  {recon.materials
                    .filter((m) => !project.bomLines.some((b) => b.itemId === m.itemId))
                    .map((m) => (
                      <tr key={m.itemId} className="bg-amber-50/40">
                        <td className="td">
                          {m.name} <span className="text-xs text-amber-600">(di luar BoM)</span>
                        </td>
                        <td className="td text-right">—</td>
                        <td className="td text-right">{m.issued}</td>
                        <td className="td text-right">{m.returned}</td>
                        <td className="td text-right font-semibold">{m.issued - m.returned}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
            {isOpen && canManage && (
              <form
                action={saveBomLineAction}
                className="flex flex-wrap items-end gap-3 border-t border-slate-100 px-5 py-4"
              >
                <input type="hidden" name="projectId" value={project.id} />
                <div className="min-w-52 flex-1">
                  <label className="label" htmlFor="itemId">Item</label>
                  <select id="itemId" name="itemId" className="input" required defaultValue="">
                    <option value="" disabled>— pilih item —</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                    ))}
                  </select>
                </div>
                <div className="w-32">
                  <label className="label" htmlFor="plannedQty">Qty Rencana</label>
                  <input id="plannedQty" name="plannedQty" type="number" min={0} className="input" required />
                </div>
                <button type="submit" className="btn-secondary">Simpan BoM</button>
              </form>
            )}
          </div>

          <div className="card">
            <div className="border-b border-slate-100 px-5 py-4 font-medium">
              Transaksi Kas Proyek ({recon.cashTxs.length})
            </div>
            {recon.cashTxs.length === 0 ? (
              <EmptyState message="Belum ada biaya proyek." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {recon.cashTxs.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <Link
                      href={`/finance/transactions/${t.id}`}
                      className="text-sm font-medium text-brand-600 hover:underline"
                    >
                      {t.txNumber}
                    </Link>
                    <span className="text-xs text-slate-500">{CASH_TX_LABELS[t.type]}</span>
                    <span className="text-sm">{formatRupiah(t.amount)}</span>
                    <Badge value={t.status} label={statusLabel(t.status)} />
                  </li>
                ))}
              </ul>
            )}
            {isOpen && (
              <div className="border-t border-slate-100 px-5 py-3">
                <Link
                  href={`/finance/transactions/new?type=EXPENSE&projectId=${project.id}`}
                  className="text-sm text-brand-600 hover:underline"
                >
                  + Catat pengeluaran proyek
                </Link>
              </div>
            )}
          </div>

          <div className="card">
            <div className="border-b border-slate-100 px-5 py-4 font-medium">
              Transaksi Material Proyek ({project.stockTransactions.length})
            </div>
            {project.stockTransactions.length === 0 ? (
              <EmptyState message="Belum ada transaksi material dengan referensi proyek ini." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {project.stockTransactions.map((t) => (
                  <li key={t.id} className="flex items-center justify-between px-5 py-3">
                    <Link
                      href={`/inventory/transactions/${t.id}`}
                      className="text-sm font-medium text-brand-600 hover:underline"
                    >
                      {t.txNumber}
                    </Link>
                    <Badge value={t.status} label={statusLabel(t.status)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-medium">Dokumentasi ({docs.length})</h2>
            {isOpen && canManage && (
              <form action={uploadProjectDocAction} className="mb-3 space-y-2">
                <input type="hidden" name="projectId" value={project.id} />
                <input
                  type="file"
                  name="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="text-sm"
                  required
                />
                <button type="submit" className="btn-secondary w-full justify-center">
                  Unggah
                </button>
              </form>
            )}
            {docs.length === 0 ? (
              <p className="text-xs text-slate-400">
                Belum ada — wajib sebelum proyek ditutup (PRD §19).
              </p>
            ) : (
              <ul className="space-y-1">
                {docs.map((d) => (
                  <li key={d.id} className="truncate text-sm">
                    <a
                      href={`/api/files/${d.id}`}
                      target="_blank"
                      className="text-brand-600 hover:underline"
                    >
                      {d.filename}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {isOpen && canClose && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Tutup Proyek</h2>
              <p className="mb-3 text-xs text-slate-500">
                Syarat (PRD §19): material dipertanggungjawabkan, advance selesai, tidak ada
                transaksi menggantung, dokumentasi ada.
              </p>
              <form action={closeProjectAction}>
                <input type="hidden" name="projectId" value={project.id} />
                <button type="submit" className="btn-primary w-full justify-center">
                  Tutup Proyek
                </button>
              </form>
            </div>
          )}

          {isOpen && canManage && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Batalkan Proyek</h2>
              <form action={cancelProjectAction} className="space-y-3">
                <input type="hidden" name="projectId" value={project.id} />
                <textarea name="reason" rows={2} className="input" placeholder="Alasan (wajib)" required />
                <button type="submit" className="btn-danger w-full justify-center">
                  Batalkan
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
