import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatDateTime } from "@/lib/constants";
import { WARNING_LABELS, type SyncWarning } from "@/lib/authentik-sync";
import {
  authentikBlocker,
  loadAuthentikIntegration,
  previewGroupSync,
} from "@/lib/identity-groups";
import { PageHeader, Flash, EmptyState } from "@/components/ui";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  applyGroupSyncAction,
  saveAuthentikAction,
  testAuthentikAction,
} from "./actions";

export const metadata = { title: "Grup Authentik" };

function warningDetail(warning: SyncWarning): string {
  switch (warning.kind) {
    case "NO_IDP_USER":
      return `${warning.email} belum ditemukan di Authentik untuk divisi ${warning.divisionCode}.`;
    case "UNKNOWN_MEMBER":
      return `${warning.username} (${warning.email}) tetap dipertahankan dan tidak akan dikeluarkan.`;
    case "NO_DIVISION":
      return `${warning.email} belum memiliki divisi di CRM dan tidak dimasukkan ke grup.`;
  }
}

function divisionLabel(names: Record<string, string>, code: string): string {
  return names[code] ?? names[code.toUpperCase()] ?? names[code.toLowerCase()] ?? code;
}

export default async function IdentityGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requirePermission(PERMISSIONS.INTEGRATIONS_MANAGE);
  const sp = await searchParams;
  const [cfg, preview] = await Promise.all([
    loadAuthentikIntegration(),
    previewGroupSync(),
  ]);
  const blocker = authentikBlocker(cfg);
  const plan = preview.plan;
  const previewError = preview.error ?? blocker;
  const pendingChanges = Boolean(
    plan && (plan.groupsToCreate.length > 0 || plan.totalAdd > 0 || plan.totalRemove > 0)
  );

  return (
    <div className="crm-authentik-page min-w-0">
      <PageHeader
        title="Grup Authentik"
        subtitle="Terbitkan divisi CRM ke grup identity secara terkontrol sebelum aplikasi lain menggunakannya."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="authentik-config-title">
            <div className="mb-5">
              <h2 id="authentik-config-title" className="text-base font-semibold text-slate-800">Konfigurasi identity provider</h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
                CRM hanya menyimpan alamat layanan dan nama environment variable. Token API tetap berada
                di server dan tidak pernah dimasukkan ke form ini.
              </p>
            </div>

            <form action={saveAuthentikAction} className="space-y-4">
              <div>
                <label className="label" htmlFor="baseUrl">Alamat Authentik</label>
                <input
                  id="baseUrl"
                  name="baseUrl"
                  className="input"
                  placeholder="https://auth.perumnet.id"
                  defaultValue={cfg?.baseUrl ?? ""}
                />
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  Boleh dikosongkan jika alamat diturunkan dari <span className="font-mono">OIDC_ISSUER</span>.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="credentialRef">Nama Environment Variable</label>
                <input
                  id="credentialRef"
                  name="credentialRef"
                  className="input font-mono"
                  required
                  autoComplete="off"
                  aria-describedby="authentik-credential-help"
                  placeholder="AUTHENTIK_API_TOKEN"
                  defaultValue={cfg?.credentialRef ?? ""}
                />
                <div id="authentik-credential-help" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
                  Isi nama variabelnya saja, contohnya <span className="font-mono">AUTHENTIK_API_TOKEN</span>.
                  Jangan menempelkan token API ke CRM.
                </div>
              </div>

              <div>
                <label className="label" htmlFor="notes">Catatan</label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  className="input"
                  defaultValue=""
                  placeholder="Catatan pengelolaan integrasi"
                />
              </div>

              <label className="flex min-h-[38px] items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="isEnabled"
                  className="h-4 w-4 accent-[#04a99f]"
                  defaultChecked={cfg?.isEnabled ?? false}
                />
                Aktifkan sinkronisasi grup
              </label>

              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn-primary">Simpan Pengaturan</button>
              </div>
            </form>

            <div className="mt-6 border-t border-slate-100 pt-4">
              <form action={testAuthentikAction} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-800">Uji koneksi</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Membaca jumlah pengguna dan grup yang terlihat oleh token server.
                  </p>
                </div>
                <button type="submit" className="btn-secondary whitespace-nowrap" disabled={!cfg}>
                  Uji Koneksi
                </button>
              </form>
            </div>
          </section>

          <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="authentik-preview-title">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 id="authentik-preview-title" className="text-base font-semibold text-slate-800">Pratinjau sinkronisasi</h2>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
                  Perubahan dihitung dari divisi CRM dan keanggotaan grup yang terbaca saat halaman dimuat.
                  Belum ada perubahan yang diterapkan pada tahap pratinjau.
                </p>
              </div>
              <span className="crm-badge is-neutral shrink-0">CRM → Authentik</span>
            </div>

            {previewError ? (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">Pratinjau belum tersedia</p>
                <p className="mt-1 break-words text-xs leading-relaxed">{previewError}</p>
                <Link href="/it/identity-groups" className="mt-3 inline-block text-xs font-semibold underline">
                  Muat ulang halaman
                </Link>
              </div>
            ) : plan ? (
              <>
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <p className="text-[11px] text-slate-500">Grup baru</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-800">{plan.groupsToCreate.length}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                    <p className="text-[11px] text-emerald-700">Akan ditambahkan</p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-800">{plan.totalAdd}</p>
                  </div>
                  <div className="rounded-lg border-2 border-rose-200 bg-rose-50 p-3">
                    <p className="text-[11px] font-semibold text-rose-700">Akan dikeluarkan</p>
                    <p className="mt-1 text-2xl font-semibold text-rose-800">{plan.totalRemove}</p>
                  </div>
                  <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                    <p className="text-[11px] text-amber-700">Peringatan</p>
                    <p className="mt-1 text-2xl font-semibold text-amber-800">{plan.warnings.length}</p>
                  </div>
                </div>

                {plan.groupsToCreate.length > 0 && (
                  <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold text-slate-800">Grup yang akan dibuat</h3>
                    <ul className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2">
                      {plan.groupsToCreate.map((name) => (
                        <li key={name} className="min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-xs break-words text-slate-700">
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-5 space-y-4">
                  {plan.changes.length === 0 ? (
                    <EmptyState message="Sinkronisasi sudah selaras. Tidak ada perubahan keanggotaan." />
                  ) : (
                    plan.changes.map((change) => (
                      <div key={change.groupName} className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
                        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                          <h3 className="min-w-0 break-words font-mono text-sm font-semibold text-slate-800">{change.groupName}</h3>
                          <span className="min-w-0 break-words text-xs text-slate-500 sm:text-right">
                            {divisionLabel(preview.divisionNames, change.divisionCode)} ({change.divisionCode})
                          </span>
                        </div>
                        <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-2">
                          <div className="min-w-0 rounded-md border border-emerald-100 bg-emerald-50/70 p-3">
                            <h4 className="text-xs font-semibold text-emerald-800">Tambah ({change.add.length})</h4>
                            {change.add.length === 0 ? (
                              <p className="mt-2 text-xs text-emerald-700/70">Tidak ada penambahan.</p>
                            ) : (
                              <ul className="mt-2 space-y-1 text-xs text-emerald-900">
                                {change.add.map((member) => (
                                  <li key={`${change.groupName}-add-${member.pk}`} className="break-words">
                                    {member.username} <span className="text-emerald-700">({member.email})</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div className="min-w-0 rounded-md border-2 border-rose-200 bg-rose-50 p-3">
                            <h4 className="text-xs font-semibold text-rose-800">Keluarkan ({change.remove.length})</h4>
                            {change.remove.length === 0 ? (
                              <p className="mt-2 text-xs text-rose-700/70">Tidak ada anggota yang dikeluarkan.</p>
                            ) : (
                              <ul className="mt-2 space-y-1 text-xs text-rose-900">
                                {change.remove.map((member) => (
                                  <li key={`${change.groupName}-remove-${member.pk}`} className="break-words">
                                    {member.username} <span className="text-rose-700">({member.email})</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                        {!change.groupPk && (
                          <p className="mt-3 text-[11px] text-slate-500">
                            Grup ini belum ada di Authentik dan akan dibuat saat penerapan.
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {plan.warnings.length > 0 && (
                  <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <h3 className="text-sm font-semibold text-amber-900">Peringatan yang perlu ditinjau</h3>
                    <ul className="mt-2 space-y-2 text-xs leading-relaxed text-amber-900">
                      {plan.warnings.map((warning, index) => (
                        <li key={`${warning.kind}-${warning.email}-${index}`} className="break-words">
                          <strong>{WARNING_LABELS[warning.kind]}</strong>: {warningDetail(warning)}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-[11px] text-amber-800">
                      Anggota di luar CRM hanya dilaporkan dan tidak akan dikeluarkan oleh sinkronisasi.
                    </p>
                  </div>
                )}

                {pendingChanges ? (
                  <div className="mt-5 flex min-w-0 flex-col gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="min-w-0 text-xs leading-relaxed text-rose-900">
                      Penerapan menghitung ulang pratinjau di server. Periksa daftar anggota yang akan dikeluarkan sebelum melanjutkan.
                    </p>
                    <ConfirmSubmitButton
                      action={applyGroupSyncAction}
                      label="Terapkan Sinkronisasi"
                      className="btn-danger shrink-0 whitespace-nowrap"
                      confirmation="Terapkan sinkronisasi grup Authentik sekarang? Daftar anggota akan dihitung ulang di server dan anggota yang tercantum pada bagian Keluarkan dapat kehilangan akses aplikasi lain."
                    />
                  </div>
                ) : (
                  <p className="mt-5 rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-xs text-emerald-800">
                    Tidak ada perubahan yang perlu diterapkan. Peringatan di atas tetap perlu ditinjau bila ada.
                  </p>
                )}
              </>
            ) : (
              <EmptyState message="Belum ada data pratinjau." />
            )}
          </section>
        </div>

        <aside className="card h-fit min-w-0 space-y-4 p-5 text-sm" aria-labelledby="authentik-status-title">
          <div>
            <h2 id="authentik-status-title" className="font-semibold text-slate-800">Status integrasi</h2>
            {blocker ? (
              <p className="mt-1 break-words text-xs leading-relaxed text-amber-700">{blocker}</p>
            ) : (
              <p className="mt-1 text-xs text-emerald-700">Siap dipakai.</p>
            )}
            {cfg?.lastEventAt && (
              <p className="mt-2 text-[11px] text-slate-500">
                Aktivitas terakhir: {formatDateTime(cfg.lastEventAt)}
              </p>
            )}
          </div>

          <div className="border-t border-slate-100 pt-3">
            <h3 className="font-medium text-slate-800">Arah data</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Divisi CRM menjadi sumber keanggotaan grup <span className="font-mono">crm-divisi-&lt;kode&gt;</span>.
              Grup Authentik tidak pernah mengubah divisi di CRM.
            </p>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <h3 className="font-medium text-slate-800">Batas keamanan</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Hanya grup dengan awalan CRM yang dikelola. Anggota di luar CRM tetap dipertahankan dan hanya muncul sebagai peringatan.
            </p>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <Link href="/it/mailserver" className="text-xs font-semibold text-brand-600 hover:underline">
              Buka pengaturan integrasi lain →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
