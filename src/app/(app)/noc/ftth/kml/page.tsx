import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PageHeader, BackLink, Flash, EmptyState } from "@/components/ui";
import { previewKmlImport } from "@/lib/ftth-kml";
import { previewKmlAction, applyKmlAction } from "./actions";
import { POINT_TYPE_LABEL, IMPORTABLE_TYPES } from "@/lib/ftth-point-type";

export const metadata = { title: "Impor / Ekspor KML" };

const ACTION_LABEL: Record<string, string> = {
  NEW: "Buat baru",
  FILL: "Isi koordinat kosong",
  KEEP: "Dipertahankan",
  DUPLICATE: "Ganda — dilewati",
  SKIP: "Dilewati",
};

// Fase 26 (PRD-NOC-TOOLS N4). Impor SELALU dua tahap: pratinjau dulu, baru
// terapkan. Berkas survei sering kotor, dan menimpa koordinat ODP produksi
// tanpa dilihat lebih dulu adalah kesalahan yang mahal.
export default async function KmlPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; ok?: string; error?: string }>;
}) {
  await requirePermission(PERMISSIONS.FTTH_MANAGE);
  const sp = await searchParams;

  const sites = await db.networkSite.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const preview = sp.preview ? await previewKmlImport(sp.preview) : null;

  return (
    <div className="max-w-4xl">
      <BackLink href="/noc/ftth" label="Kembali ke FTTH" />
      <PageHeader
        title="Impor / Ekspor KML"
        subtitle="Ambil titik ODP dari hasil survei lapangan, atau keluarkan peta ODP untuk dibuka di Google Earth."
      />

      <Flash ok={sp.ok} error={sp.error} />

      <div className="card mb-6 p-5">
        <h2 className="mb-2 text-sm font-medium">Ekspor</h2>
        <p className="mb-3 text-xs text-slate-500">
          Seluruh ODP berkoordinat, diwarnai menurut okupansi port. Deskripsi tiap
          titik memuat jumlah port terpakai, site, dan optic power.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/noc/kml" className="btn-secondary">
            Unduh Semua ODP
          </a>
          {sites.map((s) => (
            <a key={s.id} href={`/api/noc/kml?site=${s.id}`} className="btn-secondary">
              {s.name}
            </a>
          ))}
        </div>
      </div>

      <div className="card mb-6 p-5">
        <h2 className="mb-2 text-sm font-medium">Impor — Langkah 1: Pratinjau</h2>
        <p className="mb-3 text-xs text-slate-500">
          Belum ada yang disimpan pada tahap ini. Titik dicocokkan ke ODP lewat
          <strong> nama placemark = kode ODP</strong>. Berkas <strong>.kml</strong> maupun
          <strong> .kmz</strong> sama-sama diterima. Impor ini masih menyasar <strong>ODP saja</strong> —
          periksa kolom Folder sebelum menerapkan, karena titik POP atau MS pada berkas
          survei lengkap akan ikut tersimpan sebagai ODP.
        </p>
        <form action={previewKmlAction} className="space-y-3">
          <input
            type="file"
            name="file"
            accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,text/xml"
            className="input w-full"
            aria-label="Berkas KML"
          />
          <textarea
            name="kml"
            rows={4}
            placeholder="…atau tempel isi KML di sini"
            className="input w-full font-mono text-xs"
          />
          <div>
            <label className="label" htmlFor="unknownAs">
              Titik tanpa folder dianggap sebagai
            </label>
            <select id="unknownAs" name="unknownAs" className="input w-64" defaultValue="ODP">
              <option value="">— dilewati —</option>
              {IMPORTABLE_TYPES.map((t) => (
                <option key={t} value={t}>{POINT_TYPE_LABEL[t]}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Jenis titik ditebak dari nama folder KML. Berkas lama yang tidak berfolder
              perlu ditentukan di sini, kalau tidak seluruhnya akan dilewati.
            </p>
          </div>
          <button type="submit" className="btn-primary">Lihat Pratinjau</button>
        </form>
      </div>

      {preview && (
        <div className="card p-5">
          <h2 className="mb-2 text-sm font-medium">Langkah 2: Tinjau lalu Terapkan</h2>
          <div className="mb-3 flex flex-wrap gap-4 text-xs">
            <span className="text-sky-700">{preview.counts.new} baru</span>
            <span className="text-emerald-700">{preview.counts.fill} koordinat diisi</span>
            <span className="text-slate-600">{preview.counts.keep} dipertahankan</span>
            <span className="text-amber-700">{preview.counts.skip} dilewati</span>
            <span className="text-amber-700">{preview.counts.duplicate} ganda</span>
            <span className="text-red-700">{preview.counts.rejected} ditolak</span>
          </div>

          {preview.rejected.length > 0 && (
            <div className="mb-4 rounded border-l-4 border-red-500 bg-red-50/50 p-3">
              <p className="mb-1 text-xs font-medium text-red-700">Tidak bisa dibaca:</p>
              <ul className="space-y-0.5 text-xs text-slate-600">
                {preview.rejected.slice(0, 5).map((r, i) => (
                  <li key={i}>{r.reason}</li>
                ))}
              </ul>
            </div>
          )}

          {preview.rows.length === 0 ? (
            <EmptyState message="Tidak ada titik yang bisa diimpor." />
          ) : (
            <div className="mb-4 max-h-80 overflow-auto">
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="th">Nama</th>
                    <th className="th">Folder</th>
                    <th className="th">Jenis</th>
                    <th className="th">Tindakan</th>
                    <th className="th text-right">Lintang</th>
                    <th className="th text-right">Bujur</th>
                    <th className="th text-right">Pergeseran</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.map((r, i) => (
                    <tr key={`${r.name}-${i}`} className="hover:bg-slate-50">
                      <td className="td font-mono text-xs">{r.name}</td>
                      <td className="td text-xs text-slate-500">{r.folder ?? "—"}</td>
                      <td className="td text-xs">{POINT_TYPE_LABEL[r.type]}</td>
                      <td className="td text-xs">
                        {ACTION_LABEL[r.action]}
                        {r.note && (
                          <span className="block text-[11px] text-slate-400">{r.note}</span>
                        )}
                      </td>
                      <td className="td text-right font-mono text-xs">{r.latitude.toFixed(6)}</td>
                      <td className="td text-right font-mono text-xs">{r.longitude.toFixed(6)}</td>
                      <td className={`td text-right text-xs ${r.moveMeters && r.moveMeters > 50 ? "text-amber-600 font-medium" : "text-slate-400"}`}>
                        {r.moveMeters !== null ? `${r.moveMeters} m` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form action={applyKmlAction} className="space-y-3 border-t border-slate-100 pt-4">
            <input type="hidden" name="kml" value={sp.preview ?? ""} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="createMissing">Titik yang belum ada</label>
                <select id="createMissing" name="createMissing" className="input w-full">
                  <option value="">Lewati saja</option>
                  <option value="yes">Buat ODP baru (status PLANNED)</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="defaultCapacity">Kapasitas port ODP baru</label>
                <input
                  id="defaultCapacity"
                  type="number"
                  name="defaultCapacity"
                  min={1}
                  defaultValue={8}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="label" htmlFor="siteId">Site untuk ODP baru</label>
                <select id="siteId" name="siteId" className="input w-full">
                  <option value="">— tanpa site —</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Impor hanya menyentuh <strong>koordinat</strong>. Kapasitas, port, dan
              relasi ODP yang sudah ada tidak pernah diubah oleh berkas peta.
            </p>
            <div>
            <label className="label" htmlFor="unknownAsApply">
              Titik tanpa folder dianggap sebagai
            </label>
            <select id="unknownAsApply" name="unknownAs" className="input w-64" defaultValue="ODP">
              <option value="">— dilewati —</option>
              {IMPORTABLE_TYPES.map((t) => (
                <option key={t} value={t}>{POINT_TYPE_LABEL[t]}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Jenis titik ditebak dari nama folder KML. Berkas lama yang tidak berfolder
              perlu ditentukan di sini, kalau tidak seluruhnya akan dilewati.
            </p>
          </div>
            <button type="submit" className="btn-primary">Terapkan Impor</button>
          </form>
        </div>
      )}
    </div>
  );
}
