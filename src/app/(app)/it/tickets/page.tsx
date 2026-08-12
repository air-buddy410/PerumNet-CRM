import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, IT_TICKET_TYPES, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";

export const metadata = { title: "IT Tickets" };

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.IT_TICKETS_CREATE);
  const sp = await searchParams;
  const seesAll =
    user.permissions.has(PERMISSIONS.IT_TICKETS_MANAGE) ||
    user.permissions.has(PERMISSIONS.IT_VIEW);

  const tickets = await db.itTicket.findMany({
    where: seesAll ? {} : { OR: [{ requesterId: user.id }, { createdById: user.id }] },
    include: { requester: true, assignee: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const typeLabel = (t: string) => IT_TICKET_TYPES.find(([v]) => v === t)?.[1] ?? t;

  return (
    <div>
      <PageHeader
        title="IT Service Desk"
        subtitle={seesAll ? "Seluruh tiket IT yang dapat Anda pantau." : "Tiket yang Anda buat atau laporkan."}
        action={
          <Link href="/it/tickets/new" className="btn-primary">
            Buat Tiket
          </Link>
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="card overflow-x-auto">
        {tickets.length === 0 ? (
          <EmptyState message="Belum ada tiket." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Nomor</th>
                <th className="th">Judul</th>
                <th className="th">Jenis</th>
                <th className="th">Prioritas</th>
                <th className="th">Pelapor</th>
                <th className="th">Petugas</th>
                <th className="th">Dibuat</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="td font-mono text-xs">
                    <Link href={`/it/tickets/${t.id}`} className="text-brand-600 hover:underline">
                      {t.ticketNumber}
                    </Link>
                  </td>
                  <td className="td font-medium">{t.title}</td>
                  <td className="td text-xs">{typeLabel(t.type)}</td>
                  <td className="td"><Badge value={t.priority} label={statusLabel(t.priority)} /></td>
                  <td className="td text-xs">{t.requester.name}</td>
                  <td className="td text-xs">{t.assignee?.name ?? "-"}</td>
                  <td className="td text-xs">{formatDateTime(t.createdAt)}</td>
                  <td className="td"><Badge value={t.status} label={statusLabel(t.status)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
