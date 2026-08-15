import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, NET_DEVICE_TYPES, CRITICALITY, statusLabel } from "@/lib/constants";
import { loadPortPerangkat, loadRingkasanPort } from "@/lib/network-port";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { formatUiDateTime } from "@/components/ui-formatters";
import { buildTableHref, parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";
import { saveNetDeviceAction } from "../actions";

export const metadata = { title: "Perangkat Jaringan" };
const sortOptions: readonly TableSortOption[] = [
  { value: "hostname", label: "Hostname" },
  { value: "deviceType", label: "Jenis" },
  { value: "status", label: "Status" },
];

const PORT_KIND_LABELS: Record<string, string> = {
  PON: "PON",
  ETHERNET: "Ethernet",
  ONU: "ONU",
  VLAN: "VLAN",
  PPP: "PPP",
  LAIN: "Lainnya",
};

function portStatus(value: string | null) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "up") return { value: "ACTIVE", label: "Aktif" };
  if (normalized === "down" || normalized === "lowerlayerdown") return { value: "DOWN", label: "Down" };
  if (normalized === "testing") return { value: "PENDING", label: "Pengujian" };
  if (!normalized) return { value: "UNKNOWN", label: "Belum tersedia" };
  return { value: "UNKNOWN", label: value ?? "Belum tersedia" };
}

export default async function NetDevicesPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.NOC_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "hostname", defaultDirection: "asc", sortOptions });
  const canManage = user.permissions.has(PERMISSIONS.NET_INVENTORY_MANAGE);
  const orderBy: Prisma.NetworkDeviceOrderByWithRelationInput[] = table.sort === "deviceType"
    ? [{ deviceType: table.direction }, { id: "asc" }]
    : table.sort === "status"
      ? [{ status: table.direction }, { id: "asc" }]
      : [{ hostname: table.direction }, { id: "asc" }];

  const [devices, total, sites, users, editRow, selectedDevice, selectedPorts, portSummaries] = await Promise.all([
    db.networkDevice.findMany({
      include: { site: true, owner: true, _count: { select: { ports: true } } },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.networkDevice.count(),
    db.networkSite.findMany({ where: { status: { not: "INACTIVE" } }, orderBy: { siteCode: "asc" } }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    table.query.edit ? db.networkDevice.findUnique({ where: { id: table.query.edit } }) : Promise.resolve(null),
    table.query.device
      ? db.networkDevice.findUnique({
        where: { id: table.query.device },
        include: { site: true },
      })
      : Promise.resolve(null),
    table.query.device
      ? loadPortPerangkat(table.query.device)
      : Promise.resolve([]),
    table.query.device
      ? loadRingkasanPort()
      : Promise.resolve([]),
  ]);
  const typeLabel = (v: string) => NET_DEVICE_TYPES.find(([t]) => t === v)?.[1] ?? v;
  const requestedPortFilter = table.query.portKind;
  const portFilter = requestedPortFilter === "ONU" || requestedPortFilter === "OTHER"
    ? requestedPortFilter
    : "DEFAULT";
  const selectedSummary = table.query.device
    ? portSummaries.find((summary) => summary.deviceId === table.query.device)
    : undefined;
  const portCounts = selectedSummary?.perGolongan ?? selectedPorts.reduce<Record<string, number>>((counts, port) => {
    counts[port.golongan] = (counts[port.golongan] ?? 0) + 1;
    return counts;
  }, {});
  const visiblePorts = selectedPorts.filter((port) => {
    if (portFilter === "ONU") return port.golongan === "ONU";
    if (portFilter === "OTHER") return !["PON", "ETHERNET", "ONU"].includes(port.golongan);
    return port.golongan === "PON" || port.golongan === "ETHERNET";
  });
  const latestPortSync = selectedPorts.reduce<Date | null>((latest, port) => (
    !latest || port.lastSyncAt > latest ? port.lastSyncAt : latest
  ), null);
  const portSummary = [
    { key: "PON", label: "PON" },
    { key: "ETHERNET", label: "Ethernet" },
    { key: "ONU", label: "ONU" },
    { key: "VLAN", label: "VLAN" },
    { key: "PPP", label: "PPP" },
    { key: "LAIN", label: "Lainnya" },
  ];

  return (
    <div>
      <PageHeader
        title="Perangkat Jaringan"
        subtitle="Kelola perangkat jaringan aktif seperti router, switch, OLT, dan backhaul."
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="crm-list-column">
          <div className="card overflow-x-auto">
          {devices.length === 0 ? (
            <EmptyState message="Belum ada perangkat jaringan." />
          ) : (
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th"><SortableTableHeader basePath="/noc/devices" currentDirection={table.direction} currentSort={table.sort} label="Hostname" query={table.query} sortKey="hostname" /></th>
                  <th className="th"><SortableTableHeader basePath="/noc/devices" currentDirection={table.direction} currentSort={table.sort} label="Jenis" query={table.query} sortKey="deviceType" /></th>
                  <th className="th">Site</th>
                  <th className="th">Mgmt IP</th>
                  <th className="th">Kritikalitas</th>
                  <th className="th">Port</th>
                  <th className="th"><SortableTableHeader basePath="/noc/devices" currentDirection={table.direction} currentSort={table.sort} label="Status" query={table.query} sortKey="status" /></th>
                  {canManage && <th className="th"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {devices.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs font-semibold">{d.hostname}</td>
                    <td className="td text-xs">{typeLabel(d.deviceType)}</td>
                    <td className="td text-xs">{d.site.siteCode}</td>
                    <td className="td font-mono text-xs">{d.managementIp ?? "-"}</td>
                    <td className="td">
                      <Badge
                        value={d.criticality === "CRITICAL" ? "REJECTED" : d.criticality === "HIGH" ? "PENDING" : "APPROVED"}
                        label={d.criticality}
                      />
                    </td>
                    <td className="td whitespace-nowrap text-xs">
                      <Link
                        href={buildTableHref("/noc/devices", table.query, { device: d.id, portKind: null, edit: null })}
                        className="text-brand-600 hover:underline"
                      >
                        {d._count.ports} port
                      </Link>
                    </td>
                    <td className="td"><Badge value={d.status} label={statusLabel(d.status)} /></td>
                    {canManage && (
                      <td className="td text-right text-xs">
                        <Link href={`/noc/devices?edit=${d.id}`} className="text-brand-600 hover:underline">
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
        <TableControls basePath="/noc/devices" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />

        {table.query.device && (
          <section className="card overflow-hidden" aria-labelledby="network-port-panel-title">
            <div className="flex flex-wrap items-start justify-between gap-3 p-5">
                  <div className="min-w-0">
                    <h2 id="network-port-panel-title" className="text-base font-semibold text-slate-800">
                      Port perangkat{selectedDevice ? ` · ${selectedDevice.hostname}` : ""}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedDevice
                    ? `Site ${selectedDevice.site.siteCode} · ${selectedSummary ? `${selectedSummary.naik} aktif dari ${selectedSummary.total} port · ` : ""}Sinkronisasi terakhir ${formatUiDateTime(latestPortSync, "belum tersedia")}`
                    : "Perangkat yang dipilih tidak ditemukan."}
                    </p>
              </div>
              <Link
                href={buildTableHref("/noc/devices", table.query, { device: null, portKind: null })}
                className="btn-secondary"
              >
                Tutup panel
              </Link>
            </div>

            {selectedDevice ? (
              <>
                <div className="grid gap-2 px-5 pb-5 sm:grid-cols-3 lg:grid-cols-6">
                  {portSummary.map((item) => {
                    const href = item.key === "ONU"
                      ? buildTableHref("/noc/devices", table.query, { portKind: "ONU" })
                      : item.key === "VLAN" || item.key === "PPP" || item.key === "LAIN"
                        ? buildTableHref("/noc/devices", table.query, { portKind: "OTHER" })
                        : null;
                    const content = (
                      <>
                        <span className="block text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">{item.label}</span>
                        <strong className="mt-1 block text-xl text-slate-800">{portCounts[item.key] ?? 0}</strong>
                        {href && <span className="mt-1 block text-[10px] font-semibold text-brand-600">Lihat daftar</span>}
                      </>
                    );
                    return href ? (
                      <Link key={item.key} href={href} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 transition hover:border-brand-200 hover:bg-brand-50">
                        {content}
                      </Link>
                    ) : (
                      <div key={item.key} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                        {content}
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                  <span>
                    {portFilter === "DEFAULT" ? "Menampilkan PON dan Ethernet." : portFilter === "ONU" ? "Menampilkan ONU." : "Menampilkan VLAN, PPP, dan port lainnya."}
                  </span>
                  {portFilter !== "DEFAULT" && (
                    <Link href={buildTableHref("/noc/devices", table.query, { portKind: null })} className="font-semibold text-brand-600 hover:underline">
                      Kembali ke PON &amp; Ethernet
                    </Link>
                  )}
                </div>

                {visiblePorts.length === 0 ? (
                  <div className="border-t border-slate-100 p-5">
                    <EmptyState message="Belum ada port pada tampilan ini." />
                  </div>
                ) : (
                  <div className="overflow-x-auto border-t border-slate-100">
                    <table className="w-full min-w-[760px]">
                      <thead className="bg-slate-50/60">
                        <tr>
                          <th className="th">Nama Port</th>
                          <th className="th">Alias Operator</th>
                          <th className="th">Jenis</th>
                          <th className="th">Status Operasional</th>
                          <th className="th">Status Admin</th>
                          <th className="th">Kecepatan</th>
                          <th className="th">Sinkronisasi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visiblePorts.map((port) => {
                          const operational = portStatus(port.operStatus);
                          const administrative = portStatus(port.adminStatus);
                          return (
                            <tr key={port.id} className="hover:bg-slate-50">
                              <td className="td whitespace-nowrap font-mono text-xs font-semibold">{port.ifName}</td>
                              <td className="td max-w-[18rem] whitespace-normal break-words text-xs">{port.ifAlias ?? "—"}</td>
                              <td className="td whitespace-nowrap text-xs">{PORT_KIND_LABELS[port.golongan] ?? port.golongan}</td>
                              <td className="td"><Badge value={operational.value} label={operational.label} /></td>
                              <td className="td"><Badge value={administrative.value} label={administrative.label} /></td>
                              <td className="td whitespace-nowrap text-xs">{port.kecepatan ?? "—"}</td>
                              <td className="td whitespace-nowrap text-xs">{formatUiDateTime(port.lastSyncAt, "belum tersedia")}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <div className="border-t border-slate-100 p-5">
                <EmptyState message="Perangkat yang dipilih tidak tersedia atau sudah dihapus." />
              </div>
            )}
          </section>
        )}
        </div>

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-4 font-medium">{editRow ? `Ubah: ${editRow.hostname}` : "Perangkat Baru"}</h2>
            <form action={saveNetDeviceAction} className="space-y-3">
              {editRow && <input type="hidden" name="id" value={editRow.id} />}
              <div>
                <label className="label" htmlFor="hostname">Hostname</label>
                <input id="hostname" name="hostname" className="input" defaultValue={editRow?.hostname ?? ""} required />
              </div>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="deviceType">Jenis</label>
                  <select id="deviceType" name="deviceType" className="input" defaultValue={editRow?.deviceType ?? "ROUTER"}>
                    {NET_DEVICE_TYPES.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="siteId">Site</label>
                  <select id="siteId" name="siteId" className="input" defaultValue={editRow?.siteId ?? ""} required>
                    <option value="" disabled>— pilih —</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>{s.siteCode}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="vendor">Vendor</label>
                  <input id="vendor" name="vendor" className="input" defaultValue={editRow?.vendor ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="model">Model</label>
                  <input id="model" name="model" className="input" defaultValue={editRow?.model ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="serialNumber">Serial Number</label>
                  <input id="serialNumber" name="serialNumber" className="input" defaultValue={editRow?.serialNumber ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="managementIp">Management IP</label>
                  <input id="managementIp" name="managementIp" className="input" defaultValue={editRow?.managementIp ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="criticality">Kritikalitas</label>
                  <select id="criticality" name="criticality" className="input" defaultValue={editRow?.criticality ?? "MEDIUM"}>
                    {CRITICALITY.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="status">Status</label>
                  <select id="status" name="status" className="input" defaultValue={editRow?.status ?? "ACTIVE"}>
                    <option value="ACTIVE">Aktif</option>
                    <option value="INACTIVE">Nonaktif</option>
                    <option value="MAINTENANCE">Maintenance</option>
                    <option value="DOWN">Down</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="ownerId">Owner</label>
                  <select id="ownerId" name="ownerId" className="input" defaultValue={editRow?.ownerId ?? ""}>
                    <option value="">— pilih —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="firmware">Firmware</label>
                  <input id="firmware" name="firmware" className="input" defaultValue={editRow?.firmware ?? ""} />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">{editRow ? "Simpan" : "Tambah"}</button>
                {editRow && <Link href="/noc/devices" className="btn-secondary">Batal</Link>}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
