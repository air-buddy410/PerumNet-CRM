import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, EmptyState } from "@/components/ui";
import { ArchiveRestoreButton } from "@/components/archive-restore-button";
import { listArchive, archivedEntityTypes, isRestorable } from "@/lib/archive";
import { restoreArchivedAction } from "./actions";

export const metadata = { title: "Arsip" };

const ENTITY_LABELS: Record<string, string> = {
  User: "Akun",
  Employee: "Karyawan",
  Customer: "Pelanggan",
};

const entityLabel = (t: string) => ENTITY_LABELS[t] ?? t;

export default async function TrashPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; type?: string; pending?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.ARCHIVE_VIEW);
  const sp = await searchParams;
  const canRestore = user.permissions.has(PERMISSIONS.ARCHIVE_RESTORE);
  const onlyPending = sp.pending === "1";

  const [rows, types] = await Promise.all([
    listArchive({ entityType: sp.type || undefined, onlyPending }),
    archivedEntityTypes(),
  ]);

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { type: sp.type, pending: sp.pending, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/settings/trash?${s}` : "/settings/trash";
  };

  return (
    <div>
      <PageHeader
        title="Arsip"
        subtitle="Segala yang dikeluarkan dari peredaran tercatat di sini beserta alasannya. Tidak ada penghapusan permanen."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <Link
          href={qs({ type: undefined })}
          className={`rounded-full px-3 py-1 ${!sp.type ? "bg-brand-600 text-white" : "bg-slate-100"}`}
        >
          Semua jenis
        </Link>
        {types.map((t) => (
          <Link
            key={t}
            href={qs({ type: t })}
            className={`rounded-full px-3 py-1 ${sp.type === t ? "bg-brand-600 text-white" : "bg-slate-100"}`}
          >
            {entityLabel(t)}
          </Link>
        ))}
        <span className="mx-1 text-slate-300">|</span>
        <Link
          href={qs({ pending: onlyPending ? undefined : "1" })}
          className={`rounded-full px-3 py-1 ${onlyPending ? "bg-brand-600 text-white" : "bg-slate-100"}`}
        >
          Belum dipulihkan
        </Link>
      </div>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState message="Arsip kosong — belum ada yang dikeluarkan dari peredaran." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Jenis</th>
                <th className="th">Yang diarsipkan</th>
                <th className="th">Alasan</th>
                <th className="th">Oleh</th>
                <th className="th">Tanggal</th>
                <th className="th">Status</th>
                {canRestore && <th className="th"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className={r.restoredAt ? "bg-slate-50/60" : "hover:bg-slate-50"}>
                  <td className="td whitespace-nowrap text-xs">{entityLabel(r.entityType)}</td>
                  <td className="td text-xs font-medium">{r.label}</td>
                  {/* Alasan tidak pernah kosong — kolomnya wajib di basis data,
                      jadi tidak ada keadaan "tanpa alasan" yang perlu ditangani. */}
                  <td className="td text-xs text-slate-600">{r.reason}</td>
                  <td className="td whitespace-nowrap text-xs">
                    {r.archivedBy?.name ?? (
                      <span className="text-slate-400">Sistem</span>
                    )}
                  </td>
                  <td className="td whitespace-nowrap text-xs text-slate-500">
                    {formatDateTime(r.archivedAt)}
                  </td>
                  <td className="td whitespace-nowrap text-xs">
                    {r.restoredAt ? (
                      // Baris yang sudah dipulihkan TETAP tampil: tabelnya
                      // append-only dan pemulihan itu sendiri bagian dari jejak.
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-800">
                        Dipulihkan {r.restoredAt.toLocaleDateString("id-ID")}
                        {r.restoredBy ? ` · ${r.restoredBy.name}` : ""}
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-700">
                        Diarsipkan
                      </span>
                    )}
                  </td>
                  {canRestore && (
                    <td className="td text-right text-xs">
                      {!r.restoredAt && isRestorable(r.entityType) && (
                        <ArchiveRestoreButton
                          action={restoreArchivedAction}
                          id={r.id}
                          label={r.label}
                          reason={r.reason}
                        />
                      )}
                      {!r.restoredAt && !isRestorable(r.entityType) && (
                        <span className="text-slate-400" title="Belum ada jalur pemulihan otomatis untuk jenis ini">
                          via modulnya
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Halaman ini tidak memiliki penghapusan permanen, dan itu disengaja.
        Dokumen yang dibatalkan tetap memakai status modulnya sendiri (mis.
        tagihan <span className="font-mono">VOID</span> beserta alasannya) karena
        status menyimpan makna bisnis; arsip dipakai saat sebuah baris memang
        harus keluar dari daftar.
      </p>
    </div>
  );
}
