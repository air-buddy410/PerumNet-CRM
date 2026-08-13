import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PageHeader, EmptyState } from "@/components/ui";
import { NetworkMap } from "@/components/network-map";
import { formatUiDateTime } from "@/components/ui-formatters";
import {
  loadNetworkMap,
  projector,
  OCCUPANCY_COLOR,
  OCCUPANCY_LABEL,
  SUBSCRIPTION_COLOR,
  type LinkStatus,
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
      select: { id: true, networkDevice: { select: { hostname: true } } },
    }),
  ]);

  const selected = sp.odp ? data.odps.find((o) => o.id === sp.odp) ?? null : null;
  const selectedPorts = selected
    ? await db.odpPort.findMany({
        where: { odpId: selected.id },
        orderBy: { portNumber: "asc" },
        include: {
          subscription: {
            select: { serviceNumber: true, status: true, customer: { select: { name: true } } },
          },
        },
      })
    : [];

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
          <label className="label" htmlFor="olt">OLT</label>
          <select id="olt" name="olt" defaultValue={sp.olt ?? ""} className="input">
            <option value="">Semua OLT</option>
            {olts.map((o) => (
              <option key={o.id} value={o.id}>{o.networkDevice.hostname}</option>
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
          <label className="label" htmlFor="router">Router</label>
          <select id="router" name="router" defaultValue={sp.router ?? ""} className="input">
            <option value="">Semua router</option>
            {data.routers.map((router) => (
              <option key={router.id} value={router.id}>{router.name}</option>
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
            selectedOdpId={selected?.id ?? null}
            palette={{ occupancy: OCCUPANCY_COLOR, subscription: SUBSCRIPTION_COLOR, linkStatus: LINK_STATUS_COLOR, site: SITE_COLOR, route: ROUTE_COLOR }}
            occupancyLabels={OCCUPANCY_LABEL}
            fallback={
              <NetworkMapSvg
                data={data}
                selectedOdpId={selected?.id ?? null}
                odpHrefs={odpHrefs}
                linkPalette={LINK_STATUS_COLOR}
                sitePalette={SITE_COLOR}
                routePalette={ROUTE_COLOR}
              />
            }
          />

          <div className="mt-3 flex flex-wrap gap-4 px-2 text-xs text-slate-500">
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
              sendiri dan digambar di titik ODP-nya.
            </p>
          )}
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
  selectedOdpId,
  odpHrefs,
  linkPalette,
  sitePalette,
  routePalette,
}: {
  data: NetworkMapData;
  selectedOdpId: string | null;
  odpHrefs: Record<string, string>;
  linkPalette: Record<LinkStatus, string>;
  sitePalette: Record<string, string>;
  routePalette: Record<string, string>;
}) {
  const project = data.bounds ? projector(data.bounds, WIDTH, HEIGHT) : null;
  const hasRoutes = data.routes.some((route) => route.coordinates.length >= 2);
  const hasDrawableData = data.odps.length > 0 || data.customers.length > 0 || data.sites.length > 0 || hasRoutes;
  if (!project || !hasDrawableData) {
    return <EmptyState message="Belum ada titik atau jalur berkoordinat untuk digambar. Isi koordinat jaringan di modul FTTH." />;
  }

  const odpById = new Map(data.odps.map((odp) => [odp.id, odp]));

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-full w-full"
      role="img"
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

      {/* POP dan Mini-POP tidak memiliki port/okupansi. */}
      {data.sites.map((site) => {
        const point = project(site.latitude, site.longitude);
        const radius = site.type === "POP" ? 8 : 6;
        return (
          <circle key={site.id} cx={point.x} cy={point.y} r={radius} fill={sitePalette[site.type] ?? sitePalette.DEFAULT} stroke="#ffffff" strokeWidth={2}>
            <title>{`${site.name} · ${site.type} · ${site.status}`}</title>
          </circle>
        );
      })}

      {/* Kaskade ODP → ODP induk */}
      {data.cascades.map((cascade) => {
        const from = odpById.get(cascade.fromId);
        const to = odpById.get(cascade.toId);
        if (!from || !to) return null;
        const a = project(from.latitude, from.longitude);
        const b = project(to.latitude, to.longitude);
        return (
          <line
            key={`${cascade.fromId}-${cascade.toId}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="#94a3b8"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        );
      })}

      {/* Garis pelanggan → ODP tempat port-nya berada */}
      {data.customers.map((customer) => {
        const odp = customer.odpId ? odpById.get(customer.odpId) : null;
        if (!odp) return null;
        const a = project(customer.latitude, customer.longitude);
        const b = project(odp.latitude, odp.longitude);
        return (
          <line
            key={`link-${customer.subscriptionId}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="#cbd5e1"
            strokeWidth={0.75}
          />
        );
      })}

      {/* Pelanggan */}
      {data.customers.map((customer) => {
        const point = project(customer.latitude, customer.longitude);
        return (
          <circle
            key={customer.subscriptionId}
            cx={point.x}
            cy={point.y}
            r={3}
            fill={linkPalette[customer.linkStatus]}
            opacity={0.85}
          >
            <title>{`${customer.customerName} · ${customer.serviceNumber} · subscription ${customer.status} · link ${customer.linkStatus}${
              customer.portNumber ? ` · port ${customer.portNumber}` : ""
            }`}</title>
          </circle>
        );
      })}

      {/* ODP — diwarnai menurut okupansi port */}
      {data.odps.map((odp) => {
        const point = project(odp.latitude, odp.longitude);
        const isSelected = selectedOdpId === odp.id;
        const isMs = odp.role === "MS";
        return (
          <Link key={odp.id} href={odpHrefs[odp.id] ?? `/noc/map?odp=${encodeURIComponent(odp.id)}`}>
            <g>
              {isMs ? (
                <polygon
                  points={`${point.x},${point.y - 10} ${point.x + 10},${point.y} ${point.x},${point.y + 10} ${point.x - 10},${point.y}`}
                  fill="#f59e0b"
                  stroke={isSelected ? "#0f172a" : "#ffffff"}
                  strokeWidth={isSelected ? 3 : 1.5}
                />
              ) : (
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
              )}
              <title>{`${odp.code} · ${isMs ? "MS" : "ODP"} · ${odp.used}/${odp.capacity} port · ${OCCUPANCY_LABEL[odp.occupancy]}`}</title>
            </g>
          </Link>
        );
      })}
    </svg>
  );
}

function isLinkStatus(value: string | undefined): value is LinkStatus {
  return value === "ONLINE" || value === "OFFLINE" || value === "DISABLED" || value === "UNKNOWN";
}

function formatMapTimestamp(value: string) {
  return formatUiDateTime(value, "belum tersedia");
}
