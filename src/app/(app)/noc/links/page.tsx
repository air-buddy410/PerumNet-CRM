import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, LINK_MEDIA, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { saveLinkAction } from "../actions";

export const metadata = { title: "Links & Circuits" };

export default async function LinksPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.NOC_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.NET_INVENTORY_MANAGE);

  const [links, sites] = await Promise.all([
    db.networkLink.findMany({
      include: { siteA: true, siteB: true },
      orderBy: { linkCode: "asc" },
    }),
    db.networkSite.findMany({ orderBy: { siteCode: "asc" } }),
  ]);
  const editRow = sp.edit ? (links.find((l) => l.id === sp.edit) ?? null) : null;

  return (
    <div>
      <PageHeader
        title="Links & Circuits"
        subtitle="Kelola jalur antar-site seperti backbone fiber, wireless, dan leased line."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card overflow-x-auto">
          {links.length === 0 ? (
            <EmptyState message="Belum ada link." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">Kode</th>
                  <th className="th">Jalur</th>
                  <th className="th">Media</th>
                  <th className="th">Kapasitas</th>
                  <th className="th">Peran</th>
                  <th className="th">Status</th>
                  {canManage && <th className="th"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {links.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs">{l.linkCode}</td>
                    <td className="td text-xs">
                      {l.siteA.siteCode} ↔ {l.siteB.siteCode}
                    </td>
                    <td className="td text-xs">{l.media}</td>
                    <td className="td text-xs">{l.capacity ?? "-"}</td>
                    <td className="td text-xs">{l.isPrimary ? "Primary" : "Backup"}</td>
                    <td className="td"><Badge value={l.status} label={statusLabel(l.status)} /></td>
                    {canManage && (
                      <td className="td text-right text-xs">
                        <Link href={`/noc/links?edit=${l.id}`} className="text-brand-600 hover:underline">
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

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-4 font-medium">{editRow ? `Ubah: ${editRow.linkCode}` : "Link Baru"}</h2>
            <form action={saveLinkAction} className="space-y-3">
              {editRow && <input type="hidden" name="id" value={editRow.id} />}
              <div>
                <label className="label" htmlFor="linkCode">Kode</label>
                <input id="linkCode" name="linkCode" className="input" defaultValue={editRow?.linkCode ?? ""} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="siteAId">Site A</label>
                  <select id="siteAId" name="siteAId" className="input" defaultValue={editRow?.siteAId ?? ""} required>
                    <option value="" disabled>— pilih —</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>{s.siteCode}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="siteBId">Site B</label>
                  <select id="siteBId" name="siteBId" className="input" defaultValue={editRow?.siteBId ?? ""} required>
                    <option value="" disabled>— pilih —</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>{s.siteCode}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="media">Media</label>
                  <select id="media" name="media" className="input" defaultValue={editRow?.media ?? "FIBER"}>
                    {LINK_MEDIA.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="capacity">Kapasitas</label>
                  <input id="capacity" name="capacity" className="input" placeholder="mis. 1 Gbps" defaultValue={editRow?.capacity ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="provider">Provider</label>
                  <input id="provider" name="provider" className="input" defaultValue={editRow?.provider ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="status">Status</label>
                  <select id="status" name="status" className="input" defaultValue={editRow?.status ?? "ACTIVE"}>
                    <option value="ACTIVE">Aktif</option>
                    <option value="DEGRADED">Menurun</option>
                    <option value="DOWN">Down</option>
                    <option value="INACTIVE">Nonaktif</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isPrimary" defaultChecked={editRow?.isPrimary ?? true} />
                Jalur primary
              </label>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">{editRow ? "Simpan" : "Tambah"}</button>
                {editRow && <Link href="/noc/links" className="btn-secondary">Batal</Link>}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
