import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, IT_TICKET_TYPES, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge } from "@/components/ui";
import {
  assignTicketAction,
  setTicketStatusAction,
  resolveTicketAction,
  closeTicketAction,
} from "../actions";

export const metadata = { title: "Detail Tiket" };

export default async function TicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.IT_TICKETS_CREATE);
  const { id } = await params;
  const sp = await searchParams;

  const ticket = await db.itTicket.findUnique({
    where: { id },
    include: { requester: true, assignee: true, createdBy: true },
  });
  if (!ticket) notFound();

  const canManage = user.permissions.has(PERMISSIONS.IT_TICKETS_MANAGE);
  const seesAll = canManage || user.permissions.has(PERMISSIONS.IT_VIEW);
  if (!seesAll && ticket.requesterId !== user.id && ticket.createdById !== user.id) {
    notFound();
  }

  const itUsers = await db.user.findMany({
    where: { isActive: true, roles: { some: { role: { code: { in: ["it_support", "it_manager", "devops_engineer", "developer"] } } } } },
    orderBy: { name: "asc" },
  });
  const typeLabel = IT_TICKET_TYPES.find(([v]) => v === ticket.type)?.[1] ?? ticket.type;
  const open = !["RESOLVED", "CLOSED"].includes(ticket.status);

  return (
    <div className="max-w-4xl">
      <BackLink href="/it/tickets" label="Kembali ke daftar tiket" />
      <PageHeader
        title={`${ticket.ticketNumber} — ${ticket.title}`}
        subtitle={`${typeLabel} · Pelapor ${ticket.requester.name} · ${formatDateTime(ticket.createdAt)}`}
        action={<Badge value={ticket.status} label={statusLabel(ticket.status)} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card p-6">
          <dl className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Prioritas</dt>
                <dd className="mt-0.5"><Badge value={ticket.priority} label={statusLabel(ticket.priority)} /></dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Petugas</dt>
                <dd className="mt-0.5 text-sm">{ticket.assignee?.name ?? "Belum di-assign"}</dd>
              </div>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Deskripsi</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-sm">{ticket.description}</dd>
            </div>
            {ticket.resolution && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">
                  Resolusi{ticket.resolvedAt ? ` (${formatDateTime(ticket.resolvedAt)})` : ""}
                </dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm">{ticket.resolution}</dd>
              </div>
            )}
          </dl>
        </div>

        {canManage && (
          <div className="space-y-6">
            {open && (
              <div className="card p-5">
                <h2 className="mb-3 text-sm font-medium">Assign Petugas</h2>
                <form action={assignTicketAction} className="space-y-3">
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <select name="assigneeId" className="input" defaultValue={ticket.assigneeId ?? ""} required>
                    <option value="" disabled>— pilih petugas —</option>
                    {itUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <button type="submit" className="btn-primary w-full justify-center">Assign</button>
                </form>
              </div>
            )}

            {open && ticket.assigneeId && (
              <div className="card p-5">
                <h2 className="mb-3 text-sm font-medium">Ubah Status</h2>
                <form action={setTicketStatusAction} className="space-y-3">
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <select name="status" className="input" defaultValue="IN_PROGRESS">
                    <option value="IN_PROGRESS">Berjalan</option>
                    <option value="WAITING_USER">Menunggu User</option>
                    <option value="WAITING_VENDOR">Menunggu Vendor</option>
                  </select>
                  <button type="submit" className="btn-secondary w-full justify-center">Simpan Status</button>
                </form>
              </div>
            )}

            {open && ticket.assigneeId && (
              <div className="card p-5">
                <h2 className="mb-3 text-sm font-medium">Resolve</h2>
                <form action={resolveTicketAction} className="space-y-3">
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <textarea name="resolution" rows={3} className="input" placeholder="Resolusi (wajib)" required />
                  <button type="submit" className="btn-primary w-full justify-center">Resolve Tiket</button>
                </form>
              </div>
            )}

            {ticket.status === "RESOLVED" && (
              <div className="card p-5">
                <h2 className="mb-3 text-sm font-medium">Tutup Tiket</h2>
                <form action={closeTicketAction}>
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <button type="submit" className="btn-primary w-full justify-center">Tutup</button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
