import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { saveAnnouncementAction } from "../actions";

export const metadata = { title: "Pengumuman & Promo" };

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.CHANNELS_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.CHANNELS_MANAGE);

  const announcements = await db.announcement.findMany({
    include: { createdBy: true },
    orderBy: { startAt: "desc" },
    take: 60,
  });
  const editRow = sp.edit ? (announcements.find((a) => a.id === sp.edit) ?? null) : null;
  const now = new Date();
  const isLive = (a: (typeof announcements)[number]) =>
    a.isPublished && a.startAt <= now && (!a.endAt || a.endAt >= now);

  return (
    <div>
      <PageHeader
        title="Pengumuman & Promo"
        subtitle="Konten untuk portal & aplikasi pelanggan (§9) — hanya yang diterbitkan dan dalam periode tayang yang tampil ke pelanggan."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="card overflow-x-auto">
          {announcements.length === 0 ? (
            <EmptyState message="Belum ada pengumuman." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">Judul</th>
                  <th className="th">Badge</th>
                  <th className="th">Periode Tayang</th>
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
