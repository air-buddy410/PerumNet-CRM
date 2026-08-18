import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PageHeader, EmptyState } from "@/components/ui";
import {
  NetworkMap,
  type NetworkTopology,
  type NetworkTopologyEdge,
  type NetworkTopologyNode,
} from "@/components/network-map";
import {
  CUSTOMER_COORDINATE_SOURCE_LABEL,
  customerCoordinateSourceOf,
} from "@/components/network-map-geometry";
import { formatUiDateTime } from "@/components/ui-formatters";
import {
  loadNetworkMap,
  projector,
  OCCUPANCY_COLOR,
  OCCUPANCY_LABEL,
  SUBSCRIPTION_COLOR,
  type LinkStatus,
  type MapBounds,
  type NetworkMapData,
  type OccupancyLevel,
} from "@/lib/noc-map";

export const metadata = { title: "Peta Jaringan" };

const WIDTH = 1000;
const HEIGHT = 620;

const OCCUPANCY_FILTERS: { value: OccupancyLevel | ""; label: string }[] = [
  { value: "", label: "Semua okupansi" },
  { value: "MODERATE", label: "≥ 50% terpakai" },
  { value: "TIGHT", label: "≥ 80% terpakai" },
  { value: "FULL", label: "Penuh" },
];

const STATUS_FILTERS = ["", "ACTIVE", "ISOLATED", "SUSPENDED"] as const;
const STATUS_FILTER_LABEL: Record<string, string> = {
  ACTIVE: "Aktif",
  ISOLATED: "Terisolir",
  SUSPENDED: "Ditangguhkan",
};
const LINK_STATUS_FILTERS: { value: LinkStatus | ""; label: string }[] = [
  { value: "", label: "Semua status koneksi" },
  { value: "ONLINE", label: "Online" },
  { value: "OFFLINE", label: "Offline" },
  { value: "DISABLED", label: "Disabled" },
  { value: "UNKNOWN", label: "Belum tersedia" },
];
const LINK_STATUS_LABEL: Record<LinkStatus, string> = {
  ONLINE: "Online",
  OFFLINE: "Offline",
  DISABLED: "Disabled",
  UNKNOWN: "Belum tersedia",
};
const LINK_STATUS_COLOR: Record<LinkStatus, string> = {
  ONLINE: "#0f9f91",
  OFFLINE: "#dc5b58",
  DISABLED: "#64748b",
  UNKNOWN: "#d39a3a",
};
const SITE_COLOR: Record<string, string> = {
  POP: "#0e7490",
  MINI_POP: "#38bdf8",
  ODC: "#7c3aed",
  DEFAULT: "#0f766e",
};
const ROUTE_COLOR: Record<string, string> = {
  FEEDER: "#7c3aed",
  DISTRIBUTION: "#2563eb",
  DROP: "#0f9f91",
  OTHER: "#64748b",
  DEFAULT: "#64748b",
};

// Fase 23 (PRD-NOC-TOOLS N1) — peta ODP + pelanggan dalam satu tampilan.
// Data dan permission tetap server-side. Renderer MapLibre berjalan di client
// bila style internal tersedia, dengan SVG relatif sebagai fallback jaringan
// tertutup tanpa tile server.
export default async function NetworkMapPage({
  searchParams,
}: {
  searchParams: Promise<{
    site?: string;
    olt?: string;
    occ?: string;
    status?: string;
    router?: string;
    link?: string;
    odp?: string;
    mode?: string;
  }>;
}) {
  await requirePermission(PERMISSIONS.NOC_MAP_VIEW);
  const sp = await searchParams;
  const isGlobalOfflineMode = sp.mode === "offline" && sp.link === "OFFLINE";

  const [data, sites, olts] = await Promise.all([
    loadNetworkMap(
      isGlobalOfflineMode
        ? { linkStatus: "OFFLINE" }
        : {
            siteId: sp.site || null,
            oltId: sp.olt || null,
            minOccupancy: (sp.occ as OccupancyLevel) || null,
            subscriptionStatus: sp.status || null,
            routerId: sp.router || null,
            linkStatus: isLinkStatus(sp.link) ? sp.link : null,
          },
    ),
    db.networkSite.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.oltDevice.findMany({
      select: { id: true, name: true, networkDevice: { select: { hostname: true } } },
    }),
  ]);

  const selected = !isGlobalOfflineMode && sp.odp ? data.odps.find((o) => o.id === sp.odp) ?? null : null;
  const [topology, selectedPorts] = await Promise.all([
    loadNetworkTopology(
      data,
      isGlobalOfflineMode ? { siteId: null, oltId: null } : { siteId: sp.site || null, oltId: sp.olt || null },
    ),
    selected
      ? db.odpPort.findMany({
          where: { odpId: selected.id },
          orderBy: { portNumber: "asc" },
          include: {
            subscription: {
              select: { serviceNumber: true, status: true, customer: { select: { name: true } } },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const totalPorts = data.odps.reduce((s, o) => s + o.capacity, 0);
  const usedPorts = data.odps.reduce((s, o) => s + o.used, 0);
  const renderedLinkCount = data.customers.length;
  const visibleOutageClusters = data.padamMenggerombol.slice(0, 8);
  const hiddenOutageClusterCount = Math.max(0, data.padamMenggerombol.length - visibleOutageClusters.length);
  const outageCustomerCount = data.padamMenggerombol.reduce((total, cluster) => total + cluster.jumlah, 0);
  const showOfflineBanner = !isGlobalOfflineMode && data.padamMenggerombol.length > 0;
  const globalOfflineHref = "/noc/map?mode=offline&link=OFFLINE";
  const filterFormKey = JSON.stringify([
    sp.site ?? "",
    sp.router ?? "",
    sp.olt ?? "",
    sp.occ ?? "",
    sp.status ?? "",
    sp.link ?? "",
  ]);

  const keep = (extra: Record<string, string>) => {
    const params = new URLSearchParams();
    if (sp.site) params.set("site", sp.site);
    if (sp.olt) params.set("olt", sp.olt);
    if (sp.occ) params.set("occ", sp.occ);
    if (sp.status) params.set("status", sp.status);
    if (sp.router) params.set("router", sp.router);
    if (sp.link) params.set("link", sp.link);
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const q = params.toString();
    return q ? `/noc/map?${q}` : "/noc/map";
  };

  const odpHrefs = Object.fromEntries(
    data.odps.map((odp) => [odp.id, keep({ odp: selected?.id === odp.id ? "" : odp.id })]),
  );

  const activeFilterChips = [
    sp.site
      ? { label: `Site: ${sites.find((site) => site.id === sp.site)?.name ?? sp.site}`, href: keep({ site: "" }) }
      : null,
    sp.router
      ? { label: `Router: ${data.routers.find((router) => router.id === sp.router)?.name ?? sp.router}`, href: keep({ router: "" }) }
      : null,
    sp.olt
      ? { label: `OLT: ${olts.find((olt) => olt.id === sp.olt)?.name ?? olts.find((olt) => olt.id === sp.olt)?.networkDevice.hostname ?? sp.olt}`, href: keep({ olt: "" }) }
      : null,
    sp.occ
      ? { label: `Okupansi: ${OCCUPANCY_FILTERS.find((filter) => filter.value === sp.occ)?.label ?? sp.occ}`, href: keep({ occ: "" }) }
      : null,
    sp.status
      ? { label: `Status: ${STATUS_FILTER_LABEL[sp.status] ?? sp.status}`, href: keep({ status: "" }) }
      : null,
    isLinkStatus(sp.link)
      ? { label: `Koneksi: ${LINK_STATUS_LABEL[sp.link]}`, href: keep({ link: "" }) }
      : null,
  ].filter((chip): chip is { label: string; href: string } => chip !== null);

  return (
    <div>
      <PageHeader
        title="Peta Jaringan"
        subtitle={`${data.sites.length} site · ${data.routes.length} jalur · ${data.odps.length} ODP/MS · ${data.customers.length} pelanggan terpetakan · ${usedPorts}/${totalPorts} port terpakai${
          data.missingCoordinates.odps > 0
            ? ` · ${data.missingCoordinates.odps} ODP tanpa koordinat`
            : ""
        }`}
      />

      {isGlobalOfflineMode ? (
        <div className="card mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3 border border-[#f0ccc8] bg-[#fff7f6] p-4">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#d8524a] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                Mode Padam Global
              </span>
              <strong className="text-sm text-[#913f3b]">Menampilkan seluruh customer offline</strong>
            </div>
            <p className="text-xs leading-relaxed text-[#9f443e]">
              Filter lokasi dan status lain tidak diterapkan agar sebaran customer yang padam terlihat utuh.
            </p>
          </div>
          <Link href="/noc/map" className="btn-secondary shrink-0">Kembali ke semua jaringan</Link>
        </div>
      ) : (
        <>
          <form method="get" key={filterFormKey} className="card mb-3 min-w-0 p-4">
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <fieldset className="min-w-0 rounded-xl border border-slate-100 p-3">
                <legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500">Lokasi jaringan</legend>
                <div className="grid min-w-0 gap-3 sm:grid-cols-3">
                  <div className="min-w-0">
                    <label className="label" htmlFor="site">Site</label>
                    <select id="site" name="site" defaultValue={sp.site ?? ""} className="input w-full min-w-0">
                      <option value="">Semua site</option>
                      {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label className="label" htmlFor="router">Router</label>
                    <select id="router" name="router" defaultValue={sp.router ?? ""} className="input w-full min-w-0">
                      <option value="">Semua router</option>
                      {data.routers.map((router) => <option key={router.id} value={router.id}>{router.name}</option>)}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label className="label" htmlFor="olt">OLT</label>
                    <select id="olt" name="olt" defaultValue={sp.olt ?? ""} className="input w-full min-w-0">
                      <option value="">Semua OLT</option>
                      {olts.map((o) => <option key={o.id} value={o.id}>{o.name ?? o.networkDevice.hostname}</option>)}
                    </select>
                  </div>
                </div>
              </fieldset>
              <fieldset className="min-w-0 rounded-xl border border-slate-100 p-3">
                <legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500">Kondisi jaringan</legend>
                <div className="grid min-w-0 gap-3 sm:grid-cols-3">
                  <div className="min-w-0">
                    <label className="label" htmlFor="occ">Okupansi ODP</label>
                    <select id="occ" name="occ" defaultValue={sp.occ ?? ""} className="input w-full min-w-0">
                      {OCCUPANCY_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label className="label" htmlFor="status">Status pelanggan</label>
                    <select id="status" name="status" defaultValue={sp.status ?? ""} className="input w-full min-w-0">
                      {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s ? STATUS_FILTER_LABEL[s] : "Semua status"}</option>)}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label className="label" htmlFor="link">Status koneksi dalam cakupan</label>
                    <select id="link" name="link" defaultValue={sp.link ?? ""} className="input w-full min-w-0">
                      {LINK_STATUS_FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
                    </select>
                  </div>
                </div>
              </fieldset>
            </div>
            <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
              <button type="submit" className="btn-primary">Terapkan filter</button>
              <Link href="/noc/map" className="btn-secondary">Reset</Link>
              <Link href={globalOfflineHref} className="btn-danger">Lihat semua yang offline</Link>
              <span className="ml-auto min-w-0 text-xs text-slate-500">Menampilkan <strong className="text-slate-700">{renderedLinkCount}</strong> customer terpetakan</span>
            </div>
          </form>

          {activeFilterChips.length > 0 && (
            <div className="card mb-4 flex min-w-0 flex-wrap items-center gap-2 p-3">
              <span className="mr-1 text-xs font-semibold text-slate-500">Filter aktif:</span>
              {activeFilterChips.map((chip) => (
                <Link
                  key={chip.label}
                  href={chip.href}
                  className="max-w-full rounded-full border border-[#cfe4df] bg-[#f3fbf9] px-2.5 py-1 text-xs font-semibold text-[#28736d] hover:bg-[#e4f6f2] focus:outline-none focus:ring-4 focus:ring-[#04a99f]/15"
                  title={`Hapus ${chip.label}`}
                >
                  <span className="break-words">{chip.label}</span> <span aria-hidden="true">×</span>
                </Link>
              ))}
            </div>
          )}

          {showOfflineBanner && (
            <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-4 rounded-xl border border-[#f0ccc8] bg-[#fff7f6] p-4 text-[#913f3b]" role="status" aria-live="polite">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#d8524a] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                    Gangguan berkelompok
                  </span>
                  <strong className="min-w-0 break-words text-sm">
                    {data.padamMenggerombol.length} ODP padam serentak · {outageCustomerCount} customer
                  </strong>
                </div>
                <p className="mt-2 text-xs leading-relaxed">
                  Gerombolan dihitung server dari minimal dua customer offline pada ODP yang sama. Periksa sebarannya sebelum mengirim teknisi ke rumah satu per satu.
                </p>
                <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {visibleOutageClusters.map((cluster) => (
                    <div key={cluster.odpId} className="min-w-0 rounded-lg border border-[#efc9c5] bg-white/70 p-2.5">
                      <strong className="block min-w-0 break-words text-xs text-[#7c3430]">{cluster.kode}</strong>
                      <div className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-[11px] leading-relaxed text-[#9f443e]">
                        <span>{cluster.jumlah} customer padam</span>
                        <span className="min-w-0 break-words">{cluster.ponLabel || "PON belum tersedia"}</span>
                        <span className="min-w-0 break-words">{cluster.siteName || "Site belum tersedia"}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {hiddenOutageClusterCount > 0 && (
                  <p className="mt-2 text-[11px] text-[#9f443e]">
                    + {hiddenOutageClusterCount} ODP lainnya mengalami padam berkelompok.
                  </p>
                )}
              </div>
              <Link href={globalOfflineHref} className="btn-danger w-full shrink-0 sm:w-auto">
                Lihat semua yang offline
              </Link>
            </div>
          )}
        </>
      )}

      {isGlobalOfflineMode && (
        <p className="mb-4 text-xs text-slate-500">
          Menampilkan <strong className="text-slate-700">{renderedLinkCount}</strong> customer offline dari data map yang tersedia.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="card overflow-x-auto p-3">
          <NetworkMap
            data={data}
            topology={topology}
            selectedOdpId={selected?.id ?? null}
            palette={{ occupancy: OCCUPANCY_COLOR, subscription: SUBSCRIPTION_COLOR, linkStatus: LINK_STATUS_COLOR, site: SITE_COLOR, route: ROUTE_COLOR }}
            occupancyLabels={OCCUPANCY_LABEL}
          />

          <div className="mt-3 flex flex-wrap gap-4 px-2 text-xs text-slate-500">
            <p className="basis-full text-[11px] leading-relaxed text-slate-400">
              Warna titik customer mengikuti status koneksi PPPoE. Outline amber menandakan lokasi mengikuti ODP sebagai perkiraan.
            </p>
            {(Object.keys(OCCUPANCY_COLOR) as OccupancyLevel[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: OCCUPANCY_COLOR[k] }}
                />
                ODP {OCCUPANCY_LABEL[k].toLowerCase()}
              </span>
            ))}
            {["ACTIVE", "ISOLATED"].map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: SUBSCRIPTION_COLOR[s] }}
                />
                Pelanggan {s.toLowerCase()}
              </span>
            ))}
            {(Object.keys(LINK_STATUS_COLOR) as LinkStatus[]).map((status) => (
              <span key={status} className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: LINK_STATUS_COLOR[status] }} />
                Link {LINK_STATUS_LABEL[status].toLowerCase()}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: SITE_COLOR.POP }} />
              POP
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: SITE_COLOR.MINI_POP }} />
              Mini-POP
            </span>
            {(Object.keys(ROUTE_COLOR).filter((key) => key !== "DEFAULT") as string[]).map((routeType) => (
              <span key={routeType} className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-5 rounded-full" style={{ backgroundColor: ROUTE_COLOR[routeType] }} />
                Jalur {routeType.toLowerCase()}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: SITE_COLOR.ODC }} />
              ODC
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: "#2563eb" }} />
              OLT
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-5 rounded-full" style={{ backgroundColor: "#0f766e" }} />
              Topologi solid
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0 w-5 border-t-2 border-dashed border-slate-400" />
              ODP → customer
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rotate-45 rounded-sm bg-amber-500" />
              MS
            </span>
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(LINK_STATUS_COLOR) as LinkStatus[]).map((status) => (
              <div key={status} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
                <span className="block text-[10px] uppercase tracking-wide text-slate-400">{LINK_STATUS_LABEL[status]}</span>
                <strong className="block text-lg text-slate-700">{data.linkCounts[status]}</strong>
              </div>
            ))}
          </div>
          <p className="mb-4 text-[11px] text-slate-500">
            Sinkronisasi terakhir: {data.lastSyncedAt ? formatMapTimestamp(data.lastSyncedAt) : "belum tersedia"}
          </p>
          {isGlobalOfflineMode && data.customers.length === 0 ? (
            <EmptyState message="Tidak ada customer offline pada data peta saat ini." />
          ) : selected ? (
            <>
              <h2 className="mb-1 text-sm font-medium">{selected.code}</h2>
              <p className="mb-3 text-xs text-slate-500">
                {selected.siteName ?? "tanpa site"}
                {selected.ponLabel ? ` · PON ${selected.ponLabel}` : ""} ·{" "}
                {selected.used}/{selected.capacity} port ·{" "}
                {OCCUPANCY_LABEL[selected.occupancy]}
                {selected.opticPowerDbm !== null ? ` · ${selected.opticPowerDbm} dBm` : ""}
              </p>
              <h3 className="mb-2 text-xs font-medium text-slate-500">Denah Port</h3>
              <ul className="space-y-1 text-xs">
                {selectedPorts.map((port) => (
                  <li key={port.id} className="flex justify-between gap-2">
                    <span className="font-mono">#{String(port.portNumber).padStart(2, "0")}</span>
                    <span className="flex-1 truncate">
                      {port.subscription
                        ? `${port.subscription.customer.name} (${port.subscription.serviceNumber})`
                        : "—"}
                    </span>
                    <span className="text-slate-400">{port.status}</span>
                  </li>
                ))}
              </ul>
              <Link href={`/noc/ftth/odp/${selected.id}`} className="btn-secondary mt-4 w-full justify-center">
                Buka Detail ODP
              </Link>
            </>
          ) : (
            <p className="text-xs text-slate-500">
              Klik salah satu kotak ODP di peta untuk melihat denah portnya — siapa
              menempati port nomor berapa.
            </p>
          )}

          {data.missingCoordinates.customers > 0 && (
            <p className="mt-4 text-xs text-amber-600">
              {data.missingCoordinates.customers} pelanggan tidak punya koordinat
              sendiri dan digambar di titik ODP-nya sebagai perkiraan.
            </p>
          )}
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Peta hanya menampilkan pelanggan yang terlacak melalui port ODP. Pelanggan tanpa port ODP belum ditampilkan di peta ini.
          </p>
          {data.routes.length > 0 && (
            <p className="mt-4 text-[11px] text-slate-400">Panjang jalur hanya perkiraan dari geometri survey, bukan panjang kabel aktual.</p>
          )}
        </div>
      </div>
    </div>
  );
}


async function loadNetworkTopology(
  data: NetworkMapData,
  filter: { siteId: string | null; oltId: string | null },
): Promise<NetworkTopology> {
  const visibleOdpIds = data.odps.map((odp) => odp.id);
  const [siteRows, oltRows, odpRows, linkRows] = await Promise.all([
    db.networkSite.findMany({
      where: {
        latitude: { not: null },
        longitude: { not: null },
        type: { in: ["POP", "MINI_POP", "ODC"] },
        ...(filter.siteId ? { id: filter.siteId } : {}),
      },
      select: {
        id: true,
        siteCode: true,
        name: true,
        type: true,
        latitude: true,
        longitude: true,
        status: true,
      },
    }),
    db.oltDevice.findMany({
      where: {
        ...(filter.oltId ? { id: filter.oltId } : {}),
        networkDevice: {
          ...(filter.siteId ? { siteId: filter.siteId } : {}),
          site: { latitude: { not: null }, longitude: { not: null } },
        },
      },
      select: {
        id: true,
        name: true,
        networkDevice: {
          select: {
            hostname: true,
            status: true,
            siteId: true,
            site: {
              select: { id: true, name: true, type: true, latitude: true, longitude: true },
            },
          },
        },
        ponPorts: {
          select: {
            label: true,
            odps: { select: { id: true } },
          },
        },
      },
    }),
    db.odp.findMany({
      where: { id: { in: visibleOdpIds } },
      select: { id: true, siteId: true },
    }),
    db.networkLink.findMany({
      where: filter.siteId
        ? { OR: [{ siteAId: filter.siteId }, { siteBId: filter.siteId }] }
        : {},
      select: {
        id: true,
        linkCode: true,
        name: true,
        status: true,
        siteA: { select: { id: true, name: true } },
        siteB: { select: { id: true, name: true } },
      },
    }),
  ]);
  const dataOdpById = new Map(data.odps.map((odp) => [odp.id, odp]));
  const siteRowById = new Map(siteRows.map((site) => [site.id, site]));

  const nodesById = new Map<string, NetworkTopologyNode>();
  const siteNodeId = new Map<string, string>();
  const siteKind = new Map<string, string>();
  const odpNodeId = new Map<string, string>();

  const addNode = (node: NetworkTopologyNode) => {
    if (!nodesById.has(node.id)) nodesById.set(node.id, node);
  };

  for (const site of data.sites) {
    const id = `site:${site.id}`;
    siteNodeId.set(site.id, id);
    siteKind.set(site.id, site.type);
    addNode({
      id,
      refId: site.id,
      kind: site.type === "ODC" ? "ODC" : "POP",
      label: site.name,
      latitude: site.latitude,
      longitude: site.longitude,
      status: site.status,
      siteType: site.type,
    });
  }

  for (const site of siteRows) {
    const id = `site:${site.id}`;
    siteNodeId.set(site.id, id);
    siteKind.set(site.id, site.type);
    addNode({
      id,
      refId: site.id,
      kind: site.type === "ODC" ? "ODC" : "POP",
      label: site.name,
      latitude: site.latitude!,
      longitude: site.longitude!,
      status: site.status,
      siteType: site.type,
    });
  }

  for (const odp of data.odps) {
    const id = `odp:${odp.id}`;
    odpNodeId.set(odp.id, id);
    addNode({
      id,
      refId: odp.id,
      kind: odp.role === "MS" ? "MS" : "ODP",
      label: odp.code,
      latitude: odp.latitude,
      longitude: odp.longitude,
      status: odp.status,
    });
  }

  const oltNodeId = new Map<string, string>();
  for (const olt of oltRows) {
    const site = olt.networkDevice.site;
    if (site.latitude === null || site.longitude === null) continue;
    const id = `olt:${olt.id}`;
    oltNodeId.set(olt.id, id);
    addNode({
      id,
      refId: olt.id,
      kind: "OLT",
      label: olt.name ?? olt.networkDevice.hostname,
      latitude: site.latitude,
      longitude: site.longitude,
      status: olt.networkDevice.status,
      siteType: site.type,
    });
  }

  const edges: NetworkTopologyEdge[] = [];
  const edgeKeys = new Set<string>();
  const addEdge = (
    fromId: string | undefined,
    toId: string | undefined,
    kind: NetworkTopologyEdge["kind"],
    label: string,
  ) => {
    if (!fromId || !toId || fromId === toId) return;
    const from = nodesById.get(fromId);
    const to = nodesById.get(toId);
    if (!from || !to || (from.latitude === to.latitude && from.longitude === to.longitude)) return;
    const pair = kind === "SITE_LINK" ? [fromId, toId].sort().join(":") : `${fromId}:${toId}`;
    const key = `${kind}:${pair}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ id: `topology:${key}`, fromId, toId, kind, label });
  };

  for (const link of linkRows) {
    addEdge(
      siteNodeId.get(link.siteA.id),
      siteNodeId.get(link.siteB.id),
      "SITE_LINK",
      `${link.siteA.name} → ${link.siteB.name}${link.name ? ` · ${link.name}` : ` · ${link.linkCode}`}`,
    );
  }

  for (const olt of oltRows) {
    const nodeId = oltNodeId.get(olt.id);
    const oltLabel = olt.name ?? olt.networkDevice.hostname;
    addEdge(
      siteNodeId.get(olt.networkDevice.siteId),
      nodeId,
      "SITE_OLT",
      `${olt.networkDevice.site.name} → ${oltLabel}`,
    );
    // Garis OLT → ODP SENGAJA tidak dibuat lagi.
    //
    // Satu OLT menaungi ratusan ODP, jadi setiap OLT memancarkan berkas garis
    // ke segala arah — 576 garis yang semuanya bertemu di satu titik. Pada zoom
    // mana pun itu bukan informasi, hanya kabut; dan ODP-nya sendiri masih
    // tampil sebagai cluster sehingga garisnya menunjuk ke tempat yang bahkan
    // belum terpisah. Dihapus atas permintaan pemilik jaringan, 18 Agustus 2026.
    //
    // Relasi OLT → ODP TIDAK hilang dari sistem — ia tetap tersimpan, tetap
    // tampil di popup ODP dan di halaman FTTH. Yang dihentikan hanya
    // penggambarannya di peta.
  }

  for (const odp of odpRows) {
    if (odp.siteId && siteKind.get(odp.siteId) === "ODC") {
      const site = siteRowById.get(odp.siteId);
      addEdge(
        siteNodeId.get(odp.siteId),
        odpNodeId.get(odp.id),
        "SITE_ODP",
        `${site?.name ?? "ODC"} → ${dataOdpById.get(odp.id)?.code ?? "ODP"}`,
      );
    }
  }

  for (const cascade of data.cascades) {
    const from = dataOdpById.get(cascade.fromId);
    const to = dataOdpById.get(cascade.toId);
    addEdge(
      odpNodeId.get(cascade.fromId),
      odpNodeId.get(cascade.toId),
      "ODP_CASCADE",
      `${from?.code ?? cascade.fromId} → ${to?.code ?? cascade.toId}`,
    );
  }

  const coordinates = [
    ...Array.from(nodesById.values()).map((node) => ({ latitude: node.latitude, longitude: node.longitude })),
    ...data.odps.map((odp) => ({ latitude: odp.latitude, longitude: odp.longitude })),
    ...data.customers.map((customer) => ({ latitude: customer.latitude, longitude: customer.longitude })),
  ];
  const bounds: MapBounds | null = coordinates.length
    ? {
        minLat: Math.min(...coordinates.map((point) => point.latitude)),
        maxLat: Math.max(...coordinates.map((point) => point.latitude)),
        minLng: Math.min(...coordinates.map((point) => point.longitude)),
        maxLng: Math.max(...coordinates.map((point) => point.longitude)),
      }
    : null;

  return { nodes: Array.from(nodesById.values()), edges, bounds };
}

function isLinkStatus(value: string | undefined): value is LinkStatus {
  return value === "ONLINE" || value === "OFFLINE" || value === "DISABLED" || value === "UNKNOWN";
}

function formatMapTimestamp(value: string) {
  return formatUiDateTime(value, "belum tersedia");
}
