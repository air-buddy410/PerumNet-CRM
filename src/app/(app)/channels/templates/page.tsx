import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, MESSAGE_CHANNELS, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, Badge, ActiveBadge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";
import { saveTemplateAction } from "../actions";

export const metadata = { title: "Template Pesan" };
const sortOptions: readonly TableSortOption[] = [
  { value: "code", label: "Kode" },
  { value: "name", label: "Nama" },
  { value: "channel", label: "Kanal" },
];

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.CHANNELS_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "code", defaultDirection: "asc", sortOptions });
  const canManage = user.permissions.has(PERMISSIONS.CHANNELS_MANAGE);
  const orderBy: Prisma.MessageTemplateOrderByWithRelationInput[] = table.sort === "name"
    ? [{ name: table.direction }, { id: "asc" }]
    : table.sort === "channel"
      ? [{ channel: table.direction }, { id: "asc" }]
      : [{ code: table.direction }, { id: "asc" }];

  const [templates, total, editRow] = await Promise.all([
    db.messageTemplate.findMany({
      include: { _count: { select: { messages: true } } },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.messageTemplate.count(),
    table.query.edit ? db.messageTemplate.findUnique({ where: { id: table.query.edit } }) : Promise.resolve(null),
  ]);

  return (
    <div>
      <PageHeader
        title="Template Pesan"
        subtitle="Template pesan untuk WhatsApp, email, dan aplikasi dengan placeholder yang diisi saat pesan masuk antrean."
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="card overflow-x-auto">
          {templates.length === 0 ? (
            <EmptyState message="Belum ada template." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th"><SortableTableHeader basePath="/channels/templates" currentDirection={table.direction} currentSort={table.sort} label="Kode" query={table.query} sortKey="code" /></th>
                  <th className="th"><SortableTableHeader basePath="/channels/templates" currentDirection={table.direction} currentSort={table.sort} label="Nama" query={table.query} sortKey="name" /></th>
                  <th className="th">Kanal</th>
                  <th className="th">Isi</th>
                  <th className="th">Dipakai</th>
                  <th className="th">Status</th>
                  {canManage && <th className="th"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {templates.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="td whitespace-nowrap font-mono text-xs">{t.code}</td>
                    <td className="td whitespace-nowrap text-xs font-medium">{t.name}</td>
                    <td className="td"><Badge value={t.channel} label={statusLabel(t.channel)} /></td>
                    <td className="td max-w-72 text-xs">
                      <span className="block truncate" title={t.body}>{t.body}</span>
                    </td>
                    <td className="td">{t._count.messages}</td>
                    <td className="td"><ActiveBadge isActive={t.isActive} /></td>
                    {canManage && (
                      <td className="td text-right text-xs">
                        <Link href={`/channels/templates?edit=${t.id}`} className="text-brand-600 hover:underline">Ubah</Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <TableControls basePath="/channels/templates" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-4 font-medium">{editRow ? `Ubah: ${editRow.code}` : "Template Baru"}</h2>
            <form action={saveTemplateAction} className="space-y-3">
              {editRow && <input type="hidden" name="id" value={editRow.id} />}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="code">Kode</label>
                  <input id="code" name="code" className="input" required defaultValue={editRow?.code ?? ""} placeholder="INVOICE_TERBIT" />
                </div>
                <div>
                  <label className="label" htmlFor="channel">Kanal</label>
                  <select id="channel" name="channel" className="input" defaultValue={editRow?.channel ?? "WHATSAPP"}>
                    {MESSAGE_CHANNELS.map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="name">Nama</label>
                <input id="name" name="name" className="input" required defaultValue={editRow?.name ?? ""} />
              </div>
              <div>
                <label className="label" htmlFor="subject">Subjek (wajib untuk email)</label>
                <input id="subject" name="subject" className="input" defaultValue={editRow?.subject ?? ""} />
              </div>
              <div>
                <label className="label" htmlFor="body">Isi Pesan</label>
                <textarea id="body" name="body" rows={5} className="input" required defaultValue={editRow?.body ?? ""} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isActive" className="h-4 w-4" defaultChecked={editRow?.isActive ?? true} />
                Aktif
              </label>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">{editRow ? "Simpan" : "Tambah"}</button>
                {editRow && <Link href="/channels/templates" className="btn-secondary">Batal</Link>}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
