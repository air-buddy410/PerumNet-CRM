import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge } from "@/components/ui";
import {
  assignCustomerTicketAction,
  addTicketMemberAction,
  removeTicketMemberAction,
  startCustomerTicketAction,
  pauseCustomerTicketAction,
  resumeCustomerTicketAction,
  startWorkflowAction,
  completeStepAction,
  solveCustomerTicketAction,
  closeCustomerTicketAction,
  linkWorkOrderAction,
} from "../../actions";

export const metadata = { title: "Detail Tiket Pelanggan" };

const ctStatusLabel = (s: string) => (s === "OPEN" ? "Baru" : s === "PENDING" ? "Dijeda" : statusLabel(s));

export default async function CustomerTicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.CTICKETS_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const ticket = await db.customerTicket.findUnique({
    where: { id },
    include: {
      customer: true,
      subscription: true,
      category: { include: { workflow: { include: { steps: { orderBy: { order: "asc" } } } } } },
      assignee: true,
      createdBy: true,
      parent: true,
      children: { include: { category: true } },
      members: { include: { user: true } },
      progress: { include: { step: true, doneBy: true } },
      pauses: { include: { createdBy: true }, orderBy: { pausedAt: "asc" } },
      workOrder: true,
    },
  });
  if (!ticket) notFound();

  const canManage = user.permissions.has(PERMISSIONS.CTICKETS_MANAGE);
  const isActor =
    canManage || ticket.assigneeId === user.id || ticket.members.some((m) => m.userId === user.id);
  const activeStates = ["OPEN", "IN_PROGRESS", "PENDING"];
  const isActive = activeStates.includes(ticket.status);
  const workflow = ticket.category.workflow;
  const progressByStep = new Map(ticket.progress.map((p) => [p.stepId, p]));
  const pauseMinutes = ticket.pauses.reduce(
    (acc, p) => acc + Math.round(((p.resumedAt?.getTime() ?? Date.now()) - p.pausedAt.getTime()) / 60000),
    0
  );

  const [technicians, workOrders] = await Promise.all([
    db.user.findMany({
      where: { isActive: true, roles: { some: { role: { code: { in: ["technician", "operational_coordinator", "customer_service", "noc_engineer"] } } } } },
      orderBy: { name: "asc" },
    }),
    canManage
      ? db.workOrder.findMany({
          where: { customerId: ticket.customerId },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="max-w-5xl">
      <BackLink href="/helpdesk/tickets" label="Kembali ke daftar tiket" />
      <PageHeader
        title={`${ticket.ticketNumber} — ${ticket.title}`}
        subtitle={`${ticket.category.name} · ${ticket.customer.name}${ticket.subscription ? ` · ${ticket.subscription.serviceNumber}` : ""} · dibuat ${ticket.createdBy.name}, ${formatDateTime(ticket.createdAt)}`}
        action={<Badge value={ticket.status} label={ctStatusLabel(ticket.status)} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      {ticket.parent && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Sub-tiket dari{" "}
          <Link href={`/helpdesk/tickets/${ticket.parent.id}`} className="font-semibold underline">
            {ticket.parent.ticketNumber}
          </Link>.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <div className="card p-6">
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Prioritas</dt>
                <dd className="mt-0.5"><Badge value={ticket.priority} label={statusLabel(ticket.priority)} /></dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Petugas</dt>
                <dd className="mt-0.5 text-sm">{ticket.assignee?.name ?? "Belum di-assign"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Jadwal</dt>
                <dd className="mt-0.5 text-sm">{ticket.scheduledAt ? formatDateTime(ticket.scheduledAt) : "-"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">MTTR (bersih pause)</dt>
                <dd className="mt-0.5 text-sm">
                  {ticket.mttrMinutes !== null ? (
                    <span className={ticket.slaBreached ? "font-semibold text-red-600" : "font-medium"}>
                      {ticket.mttrMinutes} menit{ticket.slaBreached ? " — SLA terlewati" : ""}
                    </span>
                  ) : (
                    `berjalan · jeda ${pauseMinutes} mnt`
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">SLA Kategori</dt>
                <dd className="mt-0.5 text-sm">{ticket.category.slaHours ? `${ticket.category.slaHours} jam` : "-"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Tags</dt>
                <dd className="mt-0.5 text-sm">{ticket.tags ?? "-"}</dd>
              </div>
              {ticket.description && (
                <div className="sm:col-span-3">
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Deskripsi</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-sm">{ticket.description}</dd>
                </div>
              )}
              {ticket.resolution && (
                <div className="sm:col-span-3">
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Resolusi</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-sm">{ticket.resolution}</dd>
                </div>
              )}
            </dl>
          </div>

          {workflow && (
            <div className="card p-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium">Workflow: {workflow.name}</h2>
                {isActor && isActive && ticket.progress.length === 0 && (
                  <form action={startWorkflowAction}>
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <button type="submit" className="btn-secondary">Mulai Workflow</button>
                  </form>
                )}
              </div>
              <ol className="space-y-2">
                {workflow.steps.map((s) => {
                  const prog = progressByStep.get(s.id);
                  return (
                    <li key={s.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm">
                      <div>
                        <span className={prog?.doneAt ? "line-through opacity-60" : ""}>
                          {s.order}. {s.name}
                          {s.isRequired && <span className="ml-1 text-[10px] text-red-500">wajib</span>}
                        </span>
                        {prog?.doneAt && (
                          <span className="block text-xs text-slate-400">
                            ✓ {prog.doneBy?.name} · {formatDateTime(prog.doneAt)}{prog.note ? ` — ${prog.note}` : ""}
                          </span>
                        )}
                      </div>
                      {isActor && isActive && prog && !prog.doneAt && (
                        <form action={completeStepAction} className="flex items-center gap-1">
                          <input type="hidden" name="ticketId" value={ticket.id} />
                          <input type="hidden" name="progressId" value={prog.id} />
                          <input name="note" className="input w-36 px-1 py-0.5 text-xs" placeholder="catatan" />
                          <button type="submit" className="text-xs text-brand-600 hover:underline">Selesai</button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {ticket.pauses.length > 0 && (
            <div className="card p-6">
              <h2 className="mb-3 text-sm font-medium">Riwayat Jeda (MTTR berhenti dihitung)</h2>
              <ul className="space-y-1 text-sm">
                {ticket.pauses.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span>{p.reason} <span className="text-xs text-slate-400">— {p.createdBy.name}</span></span>
                    <span className="whitespace-nowrap text-xs text-slate-500">
                      {formatDateTime(p.pausedAt)} → {p.resumedAt ? formatDateTime(p.resumedAt) : "masih dijeda"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ticket.children.length > 0 && (
            <div className="card p-6">
              <h2 className="mb-3 text-sm font-medium">Sub-Tiket</h2>
              <ul className="space-y-1 text-sm">
                {ticket.children.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <Link href={`/helpdesk/tickets/${c.id}`} className="text-brand-600 hover:underline">
                      <span className="font-mono text-xs">{c.ticketNumber}</span> {c.title}
                    </Link>
                    <Badge value={c.status} label={ctStatusLabel(c.status)} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {isActor && ticket.status === "OPEN" && (
            <div className="card p-5">
              <form action={startCustomerTicketAction}>
                <input type="hidden" name="ticketId" value={ticket.id} />
                <button type="submit" className="btn-primary w-full justify-center">Mulai Kerjakan</button>
              </form>
            </div>
          )}

          {isActor && ticket.status === "IN_PROGRESS" && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Hentikan Sementara</h2>
              <form action={pauseCustomerTicketAction} className="space-y-3">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <textarea name="reason" rows={2} className="input" placeholder="Alasan (wajib) — mis. menunggu pelanggan" required />
                <button type="submit" className="btn-secondary w-full justify-center">Jeda</button>
              </form>
            </div>
          )}

          {isActor && ticket.status === "PENDING" && (
            <div className="card p-5">
              <form action={resumeCustomerTicketAction}>
                <input type="hidden" name="ticketId" value={ticket.id} />
                <button type="submit" className="btn-primary w-full justify-center">Lanjutkan</button>
              </form>
            </div>
          )}

          {isActor && ticket.status === "IN_PROGRESS" && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Solve</h2>
              <form action={solveCustomerTicketAction} className="space-y-3">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <textarea name="resolution" rows={3} className="input" placeholder="Resolusi (wajib)" required />
                <button type="submit" className="btn-primary w-full justify-center">Tandai Solved</button>
              </form>
            </div>
          )}

          {canManage && ticket.status === "SOLVED" && (
            <div className="card p-5">
              <form action={closeCustomerTicketAction}>
                <input type="hidden" name="ticketId" value={ticket.id} />
                <button type="submit" className="btn-primary w-full justify-center">Tutup Tiket</button>
              </form>
            </div>
          )}

          {canManage && isActive && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Assign Petugas</h2>
              <form action={assignCustomerTicketAction} className="space-y-3">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <select name="assigneeId" className="input" required defaultValue={ticket.assigneeId ?? ""}>
                  <option value="" disabled>— pilih —</option>
                  {technicians.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <button type="submit" className="btn-secondary w-full justify-center">Assign</button>
              </form>
            </div>
          )}

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-medium">Member</h2>
            {ticket.members.length === 0 ? (
              <p className="mb-3 text-xs text-slate-500">Belum ada member tambahan.</p>
            ) : (
              <ul className="mb-3 space-y-1 text-sm">
                {ticket.members.map((m) => (
                  <li key={m.userId} className="flex items-center justify-between gap-2">
                    <span>{m.user.name}</span>
                    {canManage && isActive && (
                      <form action={removeTicketMemberAction}>
                        <input type="hidden" name="ticketId" value={ticket.id} />
                        <input type="hidden" name="userId" value={m.userId} />
                        <button type="submit" className="text-xs text-red-600 hover:underline">Lepas</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canManage && isActive && (
              <form action={addTicketMemberAction} className="flex gap-2">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <select name="userId" className="input" required defaultValue="">
                  <option value="" disabled>— pilih —</option>
                  {technicians.filter((u) => u.id !== ticket.assigneeId).map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <button type="submit" className="btn-secondary">Tambah</button>
              </form>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-medium">Work Order Terkait</h2>
            {ticket.workOrder ? (
              <p className="mb-3 text-sm">
                <Link href={`/operations/work-orders/${ticket.workOrder.id}`} className="font-mono text-xs text-brand-600 hover:underline">
                  {ticket.workOrder.woNumber}
                </Link>{" "}
                <Badge value={ticket.workOrder.status} label={statusLabel(ticket.workOrder.status)} />
              </p>
            ) : (
              <p className="mb-3 text-xs text-slate-500">
                Belum tertaut — material gudang tercatat lewat WO.
              </p>
            )}
            {canManage && isActive && (
              <form action={linkWorkOrderAction} className="flex gap-2">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <select name="workOrderId" className="input" defaultValue={ticket.workOrderId ?? ""}>
                  <option value="">— lepas tautan —</option>
                  {workOrders.map((wo) => (
                    <option key={wo.id} value={wo.id}>{wo.woNumber}</option>
                  ))}
                </select>
                <button type="submit" className="btn-secondary">Simpan</button>
              </form>
            )}
          </div>

          {canManage && isActive && (
            <div className="card p-5">
              <h2 className="mb-1 text-sm font-medium">Sub-Tiket Baru</h2>
              <p className="mb-3 text-xs text-slate-500">Pecah pekerjaan besar menjadi sub-tiket (maks. 1 tingkat).</p>
              <Link href={`/helpdesk/tickets/new?parentId=${ticket.id}`} className="btn-secondary w-full justify-center">
                Buat Sub-Tiket
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
