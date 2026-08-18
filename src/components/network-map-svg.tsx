"use client";

/**
 * Peta cadangan berbentuk SVG — dipakai HANYA ketika basemap gagal dimuat.
 *
 * ══ KENAPA INI KOMPONEN KLIEN ══
 *
 * Dulu ia dibangun di server dan dioper sebagai prop `fallback` ke `NetworkMap`.
 * Akibatnya seluruh pohon elemennya — 1.775 lingkaran, 2.671 garis, 3.353
 * judul; 8.399 elemen — ikut diserialkan ke SETIAP muatan halaman peta, padahal
 * hampir tidak pernah ditampilkan. Halaman `/noc/map` jadi 4,3 MB.
 *
 * Kondisi `status !== "ready"` mengatur apa yang DIGAMBAR, bukan apa yang
 * DIKIRIM. Prop yang dibangun di server selalu terkirim, terpakai atau tidak.
 *
 * Dengan menjadi komponen klien, ia dibangun di browser dari `data` dan
 * `topology` yang memang sudah ada di sana — dan hanya ketika benar-benar
 * dibutuhkan.
 */
import {
  CUSTOMER_COORDINATE_SOURCE_LABEL,
  customerCoordinateSourceOf,
} from "@/components/network-map-geometry";
import type { NetworkTopology, NetworkTopologyNode } from "@/components/network-map";
import { EmptyState } from "@/components/ui";
import {
  projector,
  OCCUPANCY_COLOR,
  OCCUPANCY_LABEL,
  type LinkStatus,
  type NetworkMapData,
} from "@/lib/noc-map";

const WIDTH = 1000;
const HEIGHT = 620;

/**
 * Tautan "buka ODP" disusun dari alamat yang sedang dibuka, bukan dari peta
 * href yang dihitung server. Penyaring yang sedang aktif ikut terbawa — itu
 * yang dulu dikerjakan `odpHrefs`.
 *
 * `window` diperiksa karena komponen ini ikut dirender saat status masih
 * "loading", termasuk pada render pertama di server.
 */
function hrefOdp(refId: string, terpilih: string | null): string {
  const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  if (terpilih === refId) params.delete("odp");
  else params.set("odp", refId);
  const q = params.toString();
  return q ? `/noc/map?${q}` : "/noc/map";
}

export function NetworkMapSvg({
  data,
  topology,
  selectedOdpId,
  linkPalette,
  sitePalette,
  routePalette,
}: {
  data: NetworkMapData;
  topology: NetworkTopology;
  selectedOdpId: string | null;
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
            data-odp-href={hrefOdp(node.refId, selectedOdpId)}
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
