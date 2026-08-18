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
  }>;
}) {
  await requirePermission(PERMISSIONS.NOC_MAP_VIEW);
  const sp = await searchParams;

  const [data, sites, olts] = await Promise.all([
    loadNetworkMap({
      siteId: sp.site || null,
      oltId: sp.olt || null,
      minOccupancy: (sp.occ as OccupancyLevel) || null,
      subscriptionStatus: sp.status || null,
      routerId: sp.router || null,
      linkStatus: isLinkStatus(sp.link) ? sp.link : null,
    }),
    db.networkSite.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.oltDevice.findMany({
      select: { id: true, name: true, networkDevice: { select: { hostname: true } } },
    }),
  ]);

  const selected = sp.odp ? data.odps.find((o) => o.id === sp.odp) ?? null : null;
  const [topology, selectedPorts] = await Promise.all([
    loadNetworkTopology(data, { siteId: sp.site || null, oltId: sp.olt || null }),
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

      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label" htmlFor="site">Site</label>
          <select id="site" name="site" defaultValue={sp.site ?? ""} className="input">
            <option value="">Semua site</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="router">Router</label>
          <select id="router" name="router" defaultValue={sp.router ?? ""} className="input">
            <option value="">Semua router</option>
            {data.routers.map((router) => (
              <option key={router.id} value={router.id}>{router.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="olt">OLT</label>
          <select id="olt" name="olt" defaultValue={sp.olt ?? ""} className="input">
            <option value="">Semua OLT</option>
            {olts.map((o) => (
              <option key={o.id} value={o.id}>{o.name ?? o.networkDevice.hostname}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="occ">Okupansi ODP</label>
          <select id="occ" name="occ" defaultValue={sp.occ ?? ""} className="input">
            {OCCUPANCY_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">Status pelanggan</label>
          <select id="status" name="status" defaultValue={sp.status ?? ""} className="input">
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>{s || "Semua status"}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="link">Status koneksi</label>
          <select id="link" name="link" defaultValue={sp.link ?? ""} className="input">
            {LINK_STATUS_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>{filter.label}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary">Terapkan</button>
        <Link href="/noc/map" className="btn-secondary">Reset</Link>
      </form>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="card overflow-x-auto p-3">
          <NetworkMap
            data={data}
            topology={topology}
            selectedOdpId={selected?.id ?? null}
            palette={{ occupancy: OCCUPANCY_COLOR, subscription: SUBSCRIPTION_COLOR, linkStatus: LINK_STATUS_COLOR, site: SITE_COLOR, route: ROUTE_COLOR }}
            occupancyLabels={OCCUPANCY_LABEL}
            fallback={
              <NetworkMapSvg
                data={data}
                topology={topology}
                selectedOdpId={selected?.id ?? null}
                odpHrefs={odpHrefs}
                linkPalette={LINK_STATUS_COLOR}
                sitePalette={SITE_COLOR}
                routePalette={ROUTE_COLOR}
              />
            }
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
          {selected ? (
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

function NetworkMapSvg({
  data,
  topology,
  selectedOdpId,
  odpHrefs,
  linkPalette,
  sitePalette,
  routePalette,
}: {
  data: NetworkMapData;
  topology: NetworkTopology;
  selectedOdpId: string | null;
  odpHrefs: Record<string, string>;
  linkPalette: Record<LinkStatus, string>;
  sitePalette: Record<string, string>;
  routePalette: Record<string, string>;
}) {
  const bounds = topology.bounds ?? data.bounds;
  const project = bounds ? projector(bounds, WIDTH, HEIGHT) : null;
  const hasRoutes = data.routes.some((route) => route.coordinates.length >= 2);
  const fallbackNodes: NetworkTopologyNode[] = [
    ...data.sites.map((site) => ({
      id: `site:${site.id}`,
      refId: site.id,
      kind: site.type === "ODC" ? ("ODC" as const) : ("POP" as const),
      label: site.name,
      latitude: site.latitude,
      longitude: site.longitude,
      status: site.status,
      siteType: site.type,
    })),
    ...data.odps.map((odp) => ({
      id: `odp:${odp.id}`,
      refId: odp.id,
      kind: odp.role === "MS" ? ("MS" as const) : ("ODP" as const),
      label: odp.code,
      latitude: odp.latitude,
      longitude: odp.longitude,
      status: odp.status,
    })),
  ];
  const nodes = topology.nodes.length ? topology.nodes : fallbackNodes;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const odpById = new Map(data.odps.map((odp) => [odp.id, odp]));
  const topologyEdges = [
    ...topology.edges,
    ...(topology.edges.some((edge) => edge.kind === "ODP_CASCADE")
      ? []
      : data.cascades.map((cascade) => ({
          id: `${cascade.fromId}-${cascade.toId}`,
          fromId: `odp:${cascade.fromId}`,
          toId: `odp:${cascade.toId}`,
          kind: "ODP_CASCADE" as const,
          label: `${cascade.fromId} → ${cascade.toId}`,
        }))),
  ];
  const hasDrawableData = nodes.length > 0 || data.customers.length > 0 || hasRoutes;
  if (!project || !hasDrawableData) {
    return <EmptyState message="Belum ada titik atau jalur berkoordinat untuk digambar. Isi koordinat jaringan di modul FTTH." />;
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-full w-full"
      role="group"
      aria-label="Peta sebaran ODP dan pelanggan"
    >
      {/* Jalur kabel — warna dan ketebalan mengikuti routeType. */}
      {data.routes.map((route) => {
        const points = route.coordinates.map(([longitude, latitude]) => {
          const point = project(latitude, longitude);
          return `${point.x},${point.y}`;
        });
        if (points.length < 2) return null;
        const strokeWidth = route.routeType === "FEEDER" ? 3.4 : route.routeType === "DISTRIBUTION" ? 2.5 : route.routeType === "DROP" ? 1.4 : 1.8;
        return (
          <polyline
            key={route.id}
            points={points.join(" ")}
            fill="none"
            stroke={routePalette[route.routeType] ?? routePalette.DEFAULT}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <title>{`${route.name} · ${route.routeType} · ${Math.round(route.lengthMeters)} m (perkiraan)`}</title>
          </polyline>
        );
      })}

      {/* Semua relasi jaringan bersifat solid: POP/OLT/MS/ODC/ODP. */}
      {topologyEdges.map((edge) => {
        const from = nodeById.get(edge.fromId);
        const to = nodeById.get(edge.toId);
        if (!from || !to || (from.latitude === to.latitude && from.longitude === to.longitude)) return null;
        const a = project(from.latitude, from.longitude);
        const b = project(to.latitude, to.longitude);
        return (
          <line
            key={edge.id}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="#0f766e"
            strokeWidth={1.5}
            strokeLinecap="round"
          >
            <title>{edge.label}</title>
          </line>
        );
      })}

      {/* Garis ODP → pelanggan selalu putus-putus. */}
      {data.customers.map((customer) => {
        const odp = customer.odpId ? odpById.get(customer.odpId) : null;
        if (!odp || (customer.latitude === odp.latitude && customer.longitude === odp.longitude)) return null;
        const a = project(customer.latitude, customer.longitude);
        const b = project(odp.latitude, odp.longitude);
        return (
          <line
            key={`link-${customer.subscriptionId}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={linkPalette[customer.linkStatus]}
            strokeWidth={0.75}
            strokeDasharray="5 4"
          />
        );
      })}

      {/* Pelanggan */}
      {data.customers.map((customer) => {
        const point = project(customer.latitude, customer.longitude);
        const odp = customer.odpId ? odpById.get(customer.odpId) : null;
        const coordinateSource = customerCoordinateSourceOf(customer, odp);
        return (
          <circle
            key={customer.subscriptionId}
            cx={point.x}
            cy={point.y}
            r={3}
            fill={linkPalette[customer.linkStatus]}
            opacity={0.85}
            stroke={coordinateSource === "ODP_INHERITED" ? "#d97706" : "#ffffff"}
            strokeDasharray={coordinateSource === "ODP_INHERITED" ? "2 2" : undefined}
            strokeWidth={coordinateSource === "ODP_INHERITED" ? 2 : 1}
          >
            <title>{`${customer.customerName} · ${customer.serviceNumber} · subscription ${customer.status} · link ${customer.linkStatus}${
              customer.portNumber ? ` · port ${customer.portNumber}` : ""
            } · ${CUSTOMER_COORDINATE_SOURCE_LABEL[coordinateSource]}`}</title>
          </circle>
        );
      })}

      {/* Marker infrastruktur dibedakan berdasarkan jenis simpul. */}
      {nodes.map((node) => {
        const point = project(node.latitude, node.longitude);
        const odp = odpById.get(node.refId);
        const isOdp = node.kind === "ODP" || node.kind === "MS";
        const isSelected = selectedOdpId === node.refId;
        const marker = (
          <g>
            {node.kind === "MS" ? (
              <polygon
                points={`${point.x},${point.y - 10} ${point.x + 10},${point.y} ${point.x},${point.y + 10} ${point.x - 10},${point.y}`}
                fill="#f59e0b"
                stroke={isSelected ? "#0f172a" : "#ffffff"}
                strokeWidth={isSelected ? 3 : 1.5}
              />
            ) : node.kind === "ODP" && odp ? (
              <rect
                x={point.x - 7}
                y={point.y - 7}
                width={14}
                height={14}
                rx={3}
                fill={OCCUPANCY_COLOR[odp.occupancy]}
                stroke={isSelected ? "#0f172a" : "#ffffff"}
                strokeWidth={isSelected ? 3 : 1.5}
              />
            ) : (
              <circle
                cx={point.x}
                cy={point.y}
                r={node.kind === "OLT" ? 7 : node.kind === "ODC" ? 9 : 8}
                fill={node.kind === "OLT" ? "#2563eb" : sitePalette[node.siteType ?? node.kind] ?? sitePalette.DEFAULT}
                stroke="#ffffff"
                strokeWidth={2}
              />
            )}
            <title>
              {isOdp && odp
                ? `${node.label} · ${node.kind} · ${odp.used}/${odp.capacity} port · ${OCCUPANCY_LABEL[odp.occupancy]}`
                : `${node.label} · ${node.kind}${node.siteType ? ` · ${node.siteType}` : ""} · ${node.status}`}
            </title>
          </g>
        );
        return isOdp ? (
          <g
            key={node.id}
            role="link"
            tabIndex={0}
            className="crm-network-map-odp-link"
            data-odp-href={odpHrefs[node.refId] ?? `/noc/map?odp=${encodeURIComponent(node.refId)}`}
            aria-label={`Buka detail ${node.kind} ${node.label}`}
          >
            {marker}
          </g>
        ) : (
          <g key={node.id}>{marker}</g>
        );
      })}

      {/* Ring tambahan memastikan lokasi warisan tetap terlihat di atas marker ODP. */}
      {data.customers.map((customer) => {
        const odp = customer.odpId ? odpById.get(customer.odpId) : null;
        if (customerCoordinateSourceOf(customer, odp) !== "ODP_INHERITED") return null;
        const point = project(customer.latitude, customer.longitude);
        return (
          <circle
            key={`inherited-ring-${customer.subscriptionId}`}
            cx={point.x}
            cy={point.y}
            r={7}
            fill="none"
            stroke="#d97706"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            opacity={0.9}
            aria-hidden="true"
          />
        );
      })}
    </svg>
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
    for (const pon of olt.ponPorts) {
      for (const odp of pon.odps) {
        addEdge(nodeId, odpNodeId.get(odp.id), "OLT_ODP", `${oltLabel} · PON ${pon.label}`);
      }
    }
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
