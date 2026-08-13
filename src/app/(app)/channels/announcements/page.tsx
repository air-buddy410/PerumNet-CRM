import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";
import { saveAnnouncementAction } from "../actions";

export const metadata = { title: "Pengumuman & Promo" };
const sortOptions: readonly TableSortOption[] = [
  { value: "startAt", label: "Mulai tayang" },
  { value: "title", label: "Judul" },
  { value: "createdAt", label: "Dibuat" },
];

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.CHANNELS_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "startAt", defaultDirection: "desc", sortOptions });
  const canManage = user.permissions.has(PERMISSIONS.CHANNELS_MANAGE);
  const orderBy: Prisma.AnnouncementOrderByWithRelationInput[] = table.sort === "title"
    ? [{ title: table.direction }, { id: "asc" }]
    : table.sort === "createdAt"
      ? [{ createdAt: table.direction }, { id: "asc" }]
      : [{ startAt: table.direction }, { id: "asc" }];

  const [announcements, total, editRow] = await Promise.all([
    db.announcement.findMany({
      include: { createdBy: true },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.announcement.count(),
    table.query.edit ? db.announcement.findUnique({ where: { id: table.query.edit } }) : Promise.resolve(null),
  ]);
  const now = new Date();
  const isLive = (a: (typeof announcements)[number]) =>
    a.isPublished && a.startAt <= now && (!a.endAt || a.endAt >= now);

  return (
    <div>
      <PageHeader
        title="Pengumuman & Promo"
        subtitle="Kelola konten portal dan aplikasi pelanggan; hanya pengumuman yang diterbitkan dan sedang tayang yang terlihat."
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="card overflow-x-auto">
          {announcements.length === 0 ? (
            <EmptyState message="Belum ada pengumuman." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th"><SortableTableHeader basePath="/channels/announcements" currentDirection={table.direction} currentSort={table.sort} label="Judul" query={table.query} sortKey="title" /></th>
                  <th className="th">Badge</th>
                  <th className="th"><SortableTableHeader basePath="/channels/announcements" currentDirection={table.direction} currentSort={table.sort} label="Periode Tayang" query={table.query} sortKey="startAt" /></th>
                  <th className="th">Dibuat</th>
                  <th className="th">Status</th>
                  {canManage && <th className="th"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {announcements.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="td max-w-64 text-xs font-medium">
                      <span className="block truncate" title={a.title}>{a.title}</span>
                    </td>
                    <td className="td whitespace-nowrap text-xs">{a.badge ?? "-"}</td>
                    <td className="td whitespace-nowrap text-xs">
                      {formatDateTime(a.startAt).split(",")[0]} – {a.endAt ? formatDateTime(a.endAt).split(",")[0] : "∞"}
                    </td>
                    <td className="td whitespace-nowrap text-xs">{a.createdBy.name}</td>
                    <td className="td">
                      <Badge
                        value={isLive(a) ? "ACTIVE" : a.isPublished ? "SCHEDULED" : "DRAFT"}
                        label={isLive(a) ? "Tayang" : a.isPublished ? "Terjadwal/Berakhir" : "Draft"}
                      />
                    </td>
                    {canManage && (
                      <td className="td text-right text-xs">
                        <Link href={`/channels/announcements?edit=${a.id}`} className="text-brand-600 hover:underline">Ubah</Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <TableControls basePath="/channels/announcements" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-4 font-medium">{editRow ? "Ubah Pengumuman" : "Pengumuman Baru"}</h2>
            <form action={saveAnnouncementAction} className="space-y-3">
              {editRow && <input type="hidden" name="id" value={editRow.id} />}
              <div>
                <label className="label" htmlFor="title">Judul</label>
                <input id="title" name="title" className="input" required defaultValue={editRow?.title ?? ""} />
              </div>
              <div>
                <label className="label" htmlFor="badge">Badge</label>
                <input id="badge" name="badge" className="input" placeholder="PROMO / INFO" defaultValue={editRow?.badge ?? ""} />
              </div>
              <div>
                <label className="label" htmlFor="body">Isi</label>
                <textarea id="body" name="body" rows={5} className="input" required defaultValue={editRow?.body ?? ""} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="startAt">Mulai Tayang</label>
                  <input id="startAt" name="startAt" type="date" className="input" required defaultValue={editRow ? editRow.startAt.toISOString().slice(0, 10) : ""} />
                </div>
                <div>
                  <label className="label" htmlFor="endAt">Selesai</label>
                  <input id="endAt" name="endAt" type="date" className="input" defaultValue={editRow?.endAt ? editRow.endAt.toISOString().slice(0, 10) : ""} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isPublished" className="h-4 w-4" defaultChecked={editRow?.isPublished ?? false} />
                Terbitkan
              </label>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">{editRow ? "Simpan" : "Tambah"}</button>
                {editRow && <Link href="/channels/announcements" className="btn-secondary">Batal</Link>}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
