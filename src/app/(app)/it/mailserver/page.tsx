import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash } from "@/components/ui";
import { loadMailcowIntegration, mailcowBlocker } from "@/lib/mailserver";
import { saveMailserverAction, testMailserverAction } from "./actions";

export const metadata = { title: "Mailserver" };

export default async function MailserverPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requirePermission(PERMISSIONS.INTEGRATIONS_MANAGE);
  const sp = await searchParams;
  const cfg = await loadMailcowIntegration();
  const blocker = mailcowBlocker(cfg);

  return (
    <div>
      <PageHeader
        title="Mailserver"
        subtitle="Setting sambungan ke mailcow. API key tidak pernah disimpan di database — hanya nama environment variable-nya."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card p-6">
          <form action={saveMailserverAction} className="space-y-4">
            <div>
              <label className="label" htmlFor="baseUrl">Alamat Mailserver</label>
              <input
                id="baseUrl"
                name="baseUrl"
                className="input"
                required
                placeholder="https://mail.perumnet.id"
                defaultValue={cfg?.baseUrl ?? ""}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Cukup alamat pangkalnya. <span className="font-mono">/api/v1</span> ditambahkan
                sendiri bila belum ada.
              </p>
            </div>

            <div>
              <label className="label" htmlFor="credentialRef">Nama Environment Variable</label>
              <input
                id="credentialRef"
                name="credentialRef"
                className="input font-mono"
                required
                placeholder="MAILCOW_API_KEY"
                defaultValue={cfg?.credentialRef ?? ""}
              />
              {/* Peringatan ini bukan hiasan: kolom yang sama pernah menggoda
                  orang menempelkan secret langsung. saveIntegration menolaknya,
                  tapi menjelaskan lebih baik daripada sekadar menolak. */}
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
                <strong>Isi NAMA variabelnya saja</strong>, bukan API key-nya. Contoh:{" "}
                <span className="font-mono">MAILCOW_API_KEY</span>.
                <br />
                API key sendiri diletakkan di berkas <span className="font-mono">.env</span> pada
                server, dan <strong>tidak pernah disimpan di database CRM</strong> — pola yang sama
                dengan kredensial router MikroTik.
              </div>
            </div>

            <div>
              <label className="label" htmlFor="notes">Catatan</label>
              <textarea
                id="notes"
                name="notes"
                rows={2}
                className="input"
                defaultValue={cfg?.notes ?? ""}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isEnabled"
                className="h-4 w-4"
                defaultChecked={cfg?.isEnabled ?? false}
              />
              Aktifkan integrasi mailserver
            </label>

            <div className="flex gap-2">
              <button type="submit" className="btn-primary">Simpan</button>
            </div>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-4">
            <form action={testMailserverAction} className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-medium">Uji Koneksi</h2>
                <p className="text-sm text-slate-500">
                  Memeriksa versi mailcow <strong>dan</strong> membaca daftar mailbox. Keduanya
                  diperiksa karena versi saja tidak membuktikan endpoint yang dipakai fitur ini
                  benar-benar tersedia.
                </p>
              </div>
              <button type="submit" className="btn-secondary whitespace-nowrap" disabled={!cfg}>
                Uji Koneksi
              </button>
            </form>
          </div>
        </div>

        <div className="card h-fit space-y-4 p-5 text-sm">
          <div>
            <h2 className="font-medium">Status</h2>
            {blocker ? (
              <p className="mt-1 text-amber-700">{blocker}</p>
            ) : (
              <p className="mt-1 text-emerald-700">Siap dipakai.</p>
            )}
            {cfg?.lastEventAt && (
              <p className="mt-1 text-xs text-slate-500">
                Kontak terakhir: {formatDateTime(cfg.lastEventAt)}
              </p>
            )}
          </div>

          <div className="border-t border-slate-100 pt-3">
            <h3 className="font-medium">Label divisi</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Divisi ditetapkan <strong>di CRM</strong>, lalu didorong ke mailcow sebagai tag{" "}
              <span className="font-mono">divisi-&lt;kode&gt;</span>. Arah sebaliknya hanya
              dilaporkan, tidak pernah mengubah divisi diam-diam.
            </p>
            <Link href="/it/mailboxes" className="mt-2 inline-block text-brand-600 hover:underline">
              Kelola mailbox →
            </Link>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <h3 className="font-medium">Batas yang dijaga</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Tag divisi <strong>tidak memberi kewenangan apa pun di CRM</strong>. Ia menentukan
              keanggotaan dan akses masuk aplikasi lain; peran di CRM tetap ditetapkan admin.
              Tanpa batas ini, siapa pun yang bisa mengedit mailbox bisa menaikkan kewenangan
              orang di CRM.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
