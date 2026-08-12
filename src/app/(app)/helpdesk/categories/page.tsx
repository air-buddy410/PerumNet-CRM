import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PageHeader, Flash, ActiveBadge, EmptyState } from "@/components/ui";
import {
  saveTicketCategoryAction,
  saveWorkflowTemplateAction,
  addWorkflowStepAction,
} from "../actions";

export const metadata = { title: "Kategori & Workflow Tiket" };

export default async function TicketCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.CTICKETS_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.CTICKETS_MANAGE);

  const [categories, workflows] = await Promise.all([
    db.ticketCategory.findMany({
      include: { workflow: true, _count: { select: { tickets: true } } },
      orderBy: { name: "asc" },
    }),
    db.workflowTemplate.findMany({
      include: { steps: { orderBy: { order: "asc" } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const editRow = sp.edit ? (categories.find((c) => c.id === sp.edit) ?? null) : null;

  return (
    <div>
      <PageHeader
        title="Kategori & Workflow Tiket"
        subtitle="Atur SLA dan workflow per kategori; seluruh langkah wajib selesai sebelum tiket diselesaikan."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <div className="card overflow-x-auto">
            {categories.length === 0 ? (
              <EmptyState message="Belum ada kategori." />
            ) : (
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="th">Kategori</th>
                    <th className="th">SLA</th>
                    <th className="th">Workflow</th>
                    <th className="th">Tiket</th>
                    <th className="th">Status</th>
                    {canManage && <th className="th"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categories.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="td whitespace-nowrap text-xs font-medium">{c.name}</td>
                      <td className="td whitespace-nowrap text-xs">{c.slaHours ? `${c.slaHours} jam` : "-"}</td>
                      <td className="td whitespace-nowrap text-xs">{c.workflow?.name ?? "-"}</td>
                      <td className="td">{c._count.tickets}</td>
                      <td className="td"><ActiveBadge isActive={c.isActive} /></td>
                      {canManage && (
                        <td className="td text-right text-xs">
                          <Link href={`/helpdesk/categories?edit=${c.id}`} className="text-brand-600 hover:underline">
                            Ubah
                          </Link>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card p-6">
            <h2 className="mb-3 text-sm font-medium">Workflow Templates</h2>
            {workflows.length === 0 ? (
              <EmptyState message="Belum ada workflow." />
            ) : (
              <div className="space-y-4">
                {workflows.map((wf) => (
                  <div key={wf.id} className="rounded-lg border border-slate-100 p-4">
                    <p className="mb-2 text-sm font-medium">{wf.name}</p>
                    <ol className="space-y-1 text-sm">
                      {wf.steps.map((s) => (
                        <li key={s.id}>
                          {s.order}. {s.name}
                          {s.isRequired && <span className="ml-1 text-[10px] text-red-500">wajib</span>}
                          {s.description && <span className="ml-1 text-xs text-slate-400">— {s.description}</span>}
                        </li>
                      ))}
                    </ol>
                    {canManage && (
                      <form action={addWorkflowStepAction} className="mt-3 flex flex-wrap items-center gap-2">
                        <input type="hidden" name="templateId" value={wf.id} />
                        <input name="name" className="input w-52 px-2 py-1 text-xs" placeholder="Step baru" required />
                        <input name="description" className="input w-44 px-2 py-1 text-xs" placeholder="Keterangan" />
                        <label className="flex items-center gap-1 text-xs">
                          <input type="checkbox" name="isRequired" className="h-3.5 w-3.5" defaultChecked />
                          wajib
                        </label>
                        <button type="submit" className="text-xs text-brand-600 hover:underline">Tambah Step</button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            )}
            {canManage && (
              <form action={saveWorkflowTemplateAction} className="mt-4 flex gap-2">
                <input name="name" className="input" placeholder="Nama workflow baru" required />
                <button type="submit" className="btn-secondary">Buat Workflow</button>
              </form>
            )}
          </div>
        </div>

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-4 font-medium">{editRow ? `Ubah: ${editRow.name}` : "Kategori Baru"}</h2>
            <form action={saveTicketCategoryAction} className="space-y-3">
              {editRow && <input type="hidden" name="id" value={editRow.id} />}
              <div>
                <label className="label" htmlFor="name">Nama</label>
                <input id="name" name="name" className="input" required defaultValue={editRow?.name ?? ""} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="slaHours">SLA (jam)</label>
                  <input id="slaHours" name="slaHours" type="number" min={1} max={720} className="input" defaultValue={editRow?.slaHours ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="workflowId">Workflow</label>
                  <select id="workflowId" name="workflowId" className="input" defaultValue={editRow?.workflowId ?? ""}>
                    <option value="">— tanpa workflow —</option>
                    {workflows.map((wf) => (
                      <option key={wf.id} value={wf.id}>{wf.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isActive" className="h-4 w-4" defaultChecked={editRow?.isActive ?? true} />
                Aktif
              </label>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">{editRow ? "Simpan" : "Tambah"}</button>
                {editRow && <Link href="/helpdesk/categories" className="btn-secondary">Batal</Link>}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
