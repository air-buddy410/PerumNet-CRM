import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams } from "@/components/table-controls";
import { queueMessageAction, broadcastAction, runQueueAction, retryMessageAction } from "../actions";

export const metadata = { title: "Antrian Pesan" };

export default async function OutboxPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.CHANNELS_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.CHANNELS_MANAGE);
  const tableOptions = [
    { value: "createdAt", label: "Dibuat" },
    { value: "status", label: "Status" },
    { value: "sentAt", label: "Terkirim" },
  ] as const;
  const table = parseTableQuery(sp, { defaultSort: "createdAt", sortOptions: tableOptions });
  const where: Prisma.OutboundMessageWhereInput = table.query.status ? { status: table.query.status } : {};
  const orderBy: Prisma.OutboundMessageOrderByWithRelationInput[] = [
    { [table.sort]: table.direction },
    { id: "asc" },
  ];

  const [messages, totalCount, queued, failed, templates, customers, integrations] = await Promise.all([
    db.outboundMessage.findMany({
      where,
      include: { customer: true, template: true },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.outboundMessage.count({ where }),
    db.outboundMessage.count({ where: { status: "QUEUED" } }),
    db.outboundMessage.count({ where: { status: "FAILED" } }),
    db.messageTemplate.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    canManage
      ? db.customer.findMany({
          where: { status: "ACTIVE", notifyChannel: { not: "NONE" } },
          orderBy: { name: "asc" },
          take: 300,
        })
      : Promise.resolve([]),
    db.integration.findMany({ where: { category: "CRM_CUSTOMER" }, orderBy: { code: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Antrian Pesan Keluar"
        subtitle={`${queued} antri · ${failed} gagal. Adapter WA/SMTP menunggu kredensial gateway — pengiriman akan gagal dengan pesan jelas dan bisa diulang setelah adapter aktif.`}
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      {canManage && (
        <div className="mb-4 grid gap-4 lg:grid-cols-3">
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-medium">Kirim ke Satu Pelanggan</h2>
            <form action={queueMessageAction} className="space-y-2">
              <select name="customerId" className="input" required defaultValue="">
                <option value="" disabled>— pelanggan —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.customerNumber} · {c.name} ({statusLabel(c.notifyChannel)})</option>
                ))}
              </select>
              <select name="templateCode" className="input" defaultValue="">
                <option value="">— tanpa template (tulis sendiri) —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.code}>{t.code} · {t.name}</option>
                ))}
              </select>
              <textarea name="body" rows={2} className="input" placeholder="Isi pesan (bila tanpa template)" />
              <select name="integrationId" className="input" defaultValue="">
                <option value="">— adapter belum dipilih —</option>
                {integrations.map((i) => (
                  <option key={i.id} value={i.id}>{i.code}</option>
                ))}
              </select>
              <button type="submit" className="btn-secondary w-full justify-center">Antrikan</button>
            </form>
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-medium">Blast (menghormati preferensi)</h2>
            <form action={broadcastAction} className="space-y-2">
              <select name="templateCode" className="input" required defaultValue="">
                <option value="" disabled>— template —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.code}>{t.code} · {t.name}</option>
                ))}
              </select>
              <select name="customerIds" multiple size={5} className="input" required>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({statusLabel(c.notifyChannel)})</option>
                ))}
              </select>
              <p className="text-xs text-slate-500">Tahan Ctrl/Cmd untuk memilih beberapa pelanggan.</p>
              <button type="submit" className="btn-secondary w-full justify-center">Antrikan Blast</button>
            </form>
          </div>

          <div className="card h-fit p-5">
            <h2 className="mb-3 text-sm font-medium">Jalankan Antrian</h2>
            <form action={runQueueAction} className="space-y-2">
              <label className="label" htmlFor="rateLimit">Rate limit (pesan per eksekusi)</label>
              <input id="rateLimit" name="rateLimit" type="number" min={1} max={500} className="input" defaultValue={20} />
              <button type="submit" className="btn-primary w-full justify-center">Kirim Antrian</button>
            </form>
          </div>
        </div>
      )}

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input w-40" defaultValue={table.query.status ?? ""}>
            <option value="">Semua</option>
            <option value="QUEUED">Antri</option>
            <option value="SENT">Terkirim</option>
            <option value="FAILED">Gagal</option>
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {messages.length === 0 ? (
          <EmptyState message="Belum ada pesan keluar." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Pelanggan</th>
                <th className="th">Kanal</th>
                <th className="th">Tujuan</th>
                <th className="th">Template</th>
                <th className="th">Isi</th>
                <th className="th">Percobaan</th>
                <th className="th">Error / Terkirim</th>
                <th className="th"><SortableTableHeader basePath="/channels/outbox" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="status" label="Status" /></th>
                {canManage && <th className="th"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {messages.map((m) => (
                <tr key={m.id} className={m.status === "FAILED" ? "bg-red-50/40" : "hover:bg-slate-50"}>
                  <td className="td whitespace-nowrap text-xs font-medium">{m.customer?.name ?? "-"}</td>
                  <td className="td"><Badge value={m.channel} label={statusLabel(m.channel)} /></td>
                  <td className="td whitespace-nowrap font-mono text-xs">{m.recipient}</td>
                  <td className="td whitespace-nowrap font-mono text-xs">{m.template?.code ?? "-"}</td>
                  <td className="td max-w-64 text-xs">
                    <span className="block truncate" title={m.body}>{m.body}</span>
                  </td>
                  <td className="td text-xs">{m.attempts}</td>
                  <td className="td max-w-56 text-xs">
                    {m.sentAt ? (
                      formatDateTime(m.sentAt)
                    ) : (
                      <span className="block truncate text-red-600" title={m.lastError ?? ""}>{m.lastError ?? "-"}</span>
                    )}
                  </td>
                  <td className="td"><Badge value={m.status} label={statusLabel(m.status)} /></td>
                  {canManage && (
                    <td className="td text-right text-xs">
                      {m.status === "FAILED" && (
                        <form action={retryMessageAction} className="inline">
                          <input type="hidden" name="messageId" value={m.id} />
                          <button type="submit" className="text-brand-600 hover:underline">Ulangi</button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          )}
          <TableControls
            basePath="/channels/outbox"
            query={table.query}
            page={table.page}
            pageSize={table.pageSize}
            sort={table.sort}
            direction={table.direction}
            sortOptions={tableOptions}
            total={totalCount}
          />
        </div>
    </div>
  );
}
