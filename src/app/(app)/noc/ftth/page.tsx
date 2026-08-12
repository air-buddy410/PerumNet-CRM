import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, OLT_VENDORS, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { FtthCoordinatePicker } from "@/components/ftth-coordinate-picker";
import { saveOltAction, savePonPortAction, saveOdpAction, reconcilePortsAction } from "./actions";

export const metadata = { title: "FTTH — OLT, PON & ODP" };

export default async function FtthPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.NOC_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.FTTH_MANAGE);

  const [olts, oltCandidates, ponPorts, odps, sites] = await Promise.all([
    db.oltDevice.findMany({
      include: { networkDevice: true, _count: { select: { ponPorts: true } } },
      orderBy: { managementIp: "asc" },
    }),
    db.networkDevice.findMany({ where: { deviceType: "OLT" }, orderBy: { hostname: "asc" } }),
    db.ponPort.findMany({
      include: { olt: { include: { networkDevice: true } }, _count: { select: { odps: true } } },
      orderBy: [{ oltId: "asc" }, { slot: "asc" }, { port: "asc" }],
    }),
    db.odp.findMany({
      include: { site: true, ponPort: true, parent: true },
      orderBy: { code: "asc" },
    }),
    db.networkSite.findMany({ orderBy: { siteCode: "asc" } }),
  ]);
  const editRow = sp.edit ? (odps.find((o) => o.id === sp.edit) ?? null) : null;
  const vendorLabel = (v: string) => OLT_VENDORS.find(([c]) => c === v)?.[1] ?? v;
  const totalCapacity = odps.reduce((a, o) => a + o.portCapacity, 0);
  const totalUsed = odps.reduce((a, o) => a + o.portUsed, 0);

  return (
    <div>
      <PageHeader
        title="FTTH — OLT, PON & ODP"
        subtitle={`Rantai OLT → PON → ODP (kaskade) → port → pelanggan. Kapasitas terpakai ${totalUsed}/${totalCapacity} port; penggunaan port direkap otomatis.`}
      />
      <Flash ok={sp.ok} error={sp.error} />

      {canManage && (
        <div className="mb-4 flex flex-wrap gap-2">
          <form action={reconcilePortsAction}>
            <button type="submit" className="btn-secondary">Rekonsiliasi Kapasitas</button>
          </form>
          <Link href="/noc/ftth/tools" className="btn-secondary">Tools Teknis</Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <div className="card overflow-x-auto">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-medium">ODP</h2>
            {odps.length === 0 ? (
              <EmptyState message="Belum ada ODP." />
            ) : (
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="th">Kode</th>
                    <th className="th">Site</th>
                    <th className="th">PON</th>
                    <th className="th">Induk</th>
                    <th className="th">Kapasitas</th>
                    <th className="th">Optic</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {odps.map((o) => {
                    const full = o.portUsed >= o.portCapacity;
                    return (
                      <tr key={o.id} className="hover:bg-slate-50">
                        <td className="td whitespace-nowrap font-mono text-xs">
                          <Link href={`/noc/ftth/odp/${o.id}`} className="font-medium text-brand-600 hover:underline">
                            {o.code}
                          </Link>
                        </td>
                        <td className="td whitespace-nowrap text-xs">{o.site?.siteCode ?? "-"}</td>
                        <td className="td whitespace-nowrap text-xs">{o.ponPort?.label ?? "-"}</td>
                        <td className="td whitespace-nowrap text-xs">{o.parent?.code ?? "-"}</td>
                        <td className="td whitespace-nowrap text-xs">
                          <span className={full ? "font-semibold text-red-600" : "font-medium"}>
                            {o.portUsed}/{o.portCapacity}
                          </span>
                          {full && <span className="ml-1 text-[10px] text-red-600">penuh</span>}
                        </td>
                        <td className="td whitespace-nowrap text-xs">
                          {o.opticPowerDbm !== null ? `${o.opticPowerDbm} dBm` : "-"}
                        </td>
                        <td className="td"><Badge value={o.status} label={statusLabel(o.status)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="card overflow-x-auto">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-medium">OLT & PON Port</h2>
            {olts.length === 0 ? (
              <EmptyState message="Belum ada OLT terdaftar." />
            ) : (
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="th">Hostname</th>
                    <th className="th">Vendor</th>
                    <th className="th">Management IP</th>
                    <th className="th">Telnet/SNMP</th>
                    <th className="th">Credential Ref</th>
                    <th className="th">PON</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {olts.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="td whitespace-nowrap font-mono text-xs">{o.networkDevice.hostname}</td>
                      <td className="td whitespace-nowrap text-xs">{vendorLabel(o.vendor)}{o.model ? ` ${o.model}` : ""}</td>
                      <td className="td whitespace-nowrap font-mono text-xs">{o.managementIp}</td>
                      <td className="td whitespace-nowrap text-xs">
                        {o.telnetPort ?? "-"} / {o.snmpPort ?? "-"}
                      </td>
                      <td className="td whitespace-nowrap font-mono text-xs">{o.credentialRef ?? "-"}</td>
                      <td className="td">{o._count.ponPorts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {ponPorts.length > 0 && (
              <ul className="border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
                {ponPorts.map((p) => (
                  <li key={p.id}>
                    <span className="font-mono">{p.label}</span> — {p._count.odps} ODP
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {canManage && (
          <div className="space-y-6">
            <div className="card h-fit p-5">
              <h2 className="mb-4 font-medium">{editRow ? `Ubah ODP: ${editRow.code}` : "ODP Baru"}</h2>
              <form action={saveOdpAction} className="space-y-3">
                {editRow && <input type="hidden" name="id" value={editRow.id} />}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="code">Kode</label>
                    <input id="code" name="code" className="input" required defaultValue={editRow?.code ?? ""} placeholder="ODP-PSG-01" />
                  </div>
                  <div>
                    <label className="label" htmlFor="portCapacity">Kapasitas Port</label>
                    <input id="portCapacity" name="portCapacity" type="number" min={1} max={256} className="input" required defaultValue={editRow?.portCapacity ?? 8} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="siteId">Site</label>
                    <select id="siteId" name="siteId" className="input" defaultValue={editRow?.siteId ?? ""}>
                      <option value="">— tidak spesifik —</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>{s.siteCode}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="ponPortId">PON Port</label>
                    <select id="ponPortId" name="ponPortId" className="input" defaultValue={editRow?.ponPortId ?? ""}>
                      <option value="">— tidak tertaut —</option>
                      {ponPorts.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="parentId">ODP Induk (kaskade)</label>
                    <select id="parentId" name="parentId" className="input" defaultValue={editRow?.parentId ?? ""}>
                      <option value="">— tanpa induk —</option>
                      {odps.filter((o) => o.id !== editRow?.id).map((o) => (
                        <option key={o.id} value={o.id}>{o.code}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="opticPowerDbm">Optic Power (dBm)</label>
                    <input id="opticPowerDbm" name="opticPowerDbm" type="number" step="0.01" className="input" defaultValue={editRow?.opticPowerDbm ?? ""} />
                  </div>
                </div>
                <FtthCoordinatePicker
                  initialLatitude={editRow?.latitude}
                  initialLongitude={editRow?.longitude}
                />
                <div>
                  <label className="label" htmlFor="status">Status</label>
                  <select id="status" name="status" className="input" defaultValue={editRow?.status ?? "ACTIVE"}>
                    <option value="ACTIVE">Aktif</option>
                    <option value="INACTIVE">Nonaktif</option>
                    <option value="PLANNED">Direncanakan</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary">{editRow ? "Simpan" : "Tambah"}</button>
                  {editRow && <Link href="/noc/ftth" className="btn-secondary">Batal</Link>}
                </div>
              </form>
            </div>

            <div className="card h-fit p-5">
              <h2 className="mb-1 font-medium">Daftarkan OLT</h2>
              <p className="mb-3 text-xs text-slate-500">
                Pilih perangkat jaringan bertipe OLT. Kredensial diisi <em>nama env var</em>, bukan password (rule 31).
              </p>
              <form action={saveOltAction} className="space-y-3">
                <div>
                  <label className="label" htmlFor="networkDeviceId">Perangkat (OLT)</label>
                  <select id="networkDeviceId" name="networkDeviceId" className="input" required defaultValue="">
                    <option value="" disabled>— pilih —</option>
                    {oltCandidates.map((d) => (
                      <option key={d.id} value={d.id}>{d.hostname}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="vendor">Vendor</label>
                    <select id="vendor" name="vendor" className="input" defaultValue="ZTE">
                      {OLT_VENDORS.map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="model">Model</label>
                    <input id="model" name="model" className="input" placeholder="C300" />
                  </div>
                  <div>
                    <label className="label" htmlFor="managementIp">Management IP</label>
                    <input id="managementIp" name="managementIp" className="input" required />
                  </div>
                  <div>
                    <label className="label" htmlFor="credentialRef">Credential Ref</label>
                    <input id="credentialRef" name="credentialRef" className="input" placeholder="OLT_ZTE_PASSWORD" />
                  </div>
                  <div>
                    <label className="label" htmlFor="telnetPort">Telnet Port</label>
                    <input id="telnetPort" name="telnetPort" type="number" className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="snmpPort">SNMP Port</label>
                    <input id="snmpPort" name="snmpPort" type="number" className="input" />
                  </div>
                </div>
                <button type="submit" className="btn-secondary w-full justify-center">Daftarkan OLT</button>
              </form>
            </div>

            {olts.length > 0 && (
              <div className="card h-fit p-5">
                <h2 className="mb-3 font-medium">Tambah PON Port</h2>
                <form action={savePonPortAction} className="space-y-3">
                  <select name="oltId" className="input" required defaultValue="">
                    <option value="" disabled>— pilih OLT —</option>
                    {olts.map((o) => (
                      <option key={o.id} value={o.id}>{o.networkDevice.hostname}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-3">
                    <input name="slot" type="number" min={0} className="input" placeholder="Slot" required />
                    <input name="port" type="number" min={0} className="input" placeholder="Port" required />
                  </div>
                  <input name="label" className="input" placeholder="Label (opsional)" />
                  <button type="submit" className="btn-secondary w-full justify-center">Tambah PON</button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
