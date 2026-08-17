import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge } from "@/components/ui";
import { formatUiDateTime } from "@/components/ui-formatters";
import { loadKredensial } from "@/lib/kredensial-perangkat-service";
import { kunciSiap, PORT_BAWAAN } from "@/lib/rahasia-perangkat";
import {
  simpanKredensialPerangkatAction,
  hapusKredensialPerangkatAction,
  ujiKredensialPerangkatAction,
} from "../../../actions";

export const metadata = { title: "Kredensial Perangkat" };

// Fase 89 — layar tempat NOC mengisi login telnet/SSH sendiri.
//
// Halaman ini SENGAJA minimal: aturan bisnisnya ada di service, tampilannya
// milik Luna (§50). Yang penting di sini adalah perilakunya, dan satu hal yang
// tidak boleh berubah siapa pun yang merapikannya nanti — sandi tidak pernah
// dikirim ke browser, jadi kotak sandi SELALU kosong saat halaman dibuka,
// bahkan ketika kredensialnya sudah tersimpan.

export default async function KredensialPerangkatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.NOC_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const perangkat = await db.networkDevice.findUnique({
    where: { id },
    select: { id: true, hostname: true, deviceType: true, site: { select: { name: true } } },
  });
  if (!perangkat) notFound();

  const canManage = user.permissions.has(PERMISSIONS.NET_INVENTORY_MANAGE);
  const kred = await loadKredensial(perangkat.id);
  const adaKunci = kunciSiap();

  return (
    <div className="max-w-3xl">
      <BackLink href="/noc/devices" label="Kembali ke daftar perangkat" />
      <PageHeader
        title={`Kredensial ${perangkat.hostname}`}
        subtitle={`${perangkat.deviceType}${perangkat.site ? ` · ${perangkat.site.name}` : ""} · dipakai untuk membaca perangkat lewat CLI`}
        action={
          <Badge
            value={kred.ada ? "ACTIVE" : "UNKNOWN"}
            label={kred.ada ? (kred.sumber === "BRANKAS" ? "Tersimpan" : "Dari berkas .env") : "Belum ada"}
          />
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      {!adaKunci && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <strong>Kunci brankas belum terpasang.</strong> Kredensial baru belum bisa
          disimpan sampai <code>DEVICE_CRED_KEY</code> diisi di server. Perangkat yang
          sudah berjalan lewat berkas <code>.env</code> tidak terpengaruh.
        </div>
      )}

      <div className="card mb-6 p-5">
        <h2 className="mb-3 font-medium">Yang tersimpan sekarang</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Sumber</dt>
            <dd>
              {kred.sumber === "BRANKAS"
                ? "Brankas basis data"
                : kred.sumber === "ENV"
                  ? "Berkas .env di server"
                  : "Belum ada"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Protokol & port</dt>
            <dd>{kred.ada ? `${kred.protokol} · ${kred.port}` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Nama pengguna</dt>
            <dd className="font-mono text-xs">{kred.username ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Sandi</dt>
            <dd className="text-slate-400">
              Tersimpan tersegel — tidak dapat ditampilkan kembali
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Terakhir terbukti</dt>
            <dd>
              {kred.terakhirTerbukti ? formatUiDateTime(kred.terakhirTerbukti) : "Belum pernah diuji"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Diperbarui</dt>
            <dd>
              {kred.diperbaruiPada
                ? `${formatUiDateTime(kred.diperbaruiPada)}${kred.diperbaruiOleh ? ` · ${kred.diperbaruiOleh}` : ""}`
                : "—"}
            </dd>
          </div>
        </dl>

        {canManage && kred.sumber === "BRANKAS" && (
          <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
            <form action={ujiKredensialPerangkatAction}>
              <input type="hidden" name="networkDeviceId" value={perangkat.id} />
              <button type="submit" className="btn-secondary">Uji login</button>
            </form>
            <form action={hapusKredensialPerangkatAction}>
              <input type="hidden" name="networkDeviceId" value={perangkat.id} />
              <button type="submit" className="btn-secondary text-red-600">Hapus</button>
            </form>
          </div>
        )}
      </div>

      {canManage ? (
        <div className="card p-5">
          <h2 className="mb-1 font-medium">
            {kred.sumber === "BRANKAS" ? "Ganti kredensial" : "Isi kredensial"}
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            Sandi disegel sebelum disimpan dan tidak pernah dapat dibaca kembali dari
            layar ini. Mengganti sandi membatalkan hasil uji sebelumnya.
          </p>
          <form action={simpanKredensialPerangkatAction} className="space-y-3">
            <input type="hidden" name="networkDeviceId" value={perangkat.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="protokol">Protokol</label>
                <select id="protokol" name="protokol" className="input" defaultValue={kred.protokol ?? "TELNET"}>
                  <option value="TELNET">TELNET</option>
                  <option value="SSH">SSH</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="port">Port</label>
                <input
                  id="port"
                  name="port"
                  className="input"
                  inputMode="numeric"
                  defaultValue={kred.port ?? ""}
                  placeholder={`kosongkan untuk bawaan (${PORT_BAWAAN.TELNET} / ${PORT_BAWAAN.SSH})`}
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="username">Nama pengguna</label>
              <input
                id="username"
                name="username"
                className="input"
                required
                autoComplete="off"
                defaultValue={kred.username ?? ""}
              />
            </div>
            <div>
              <label className="label" htmlFor="sandi">Sandi</label>
              {/* Sengaja tanpa defaultValue: sandi tidak pernah dikirim ke browser. */}
              <input
                id="sandi"
                name="sandi"
                type="password"
                className="input"
                required
                autoComplete="new-password"
              />
            </div>
            <button type="submit" className="btn-primary" disabled={!adaKunci}>
              Simpan kredensial
            </button>
          </form>
        </div>
      ) : (
        <div className="card p-5 text-sm text-slate-500">
          Anda tidak punya hak mengubah kredensial perangkat.
        </div>
      )}
    </div>
  );
}
