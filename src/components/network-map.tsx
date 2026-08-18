"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Expand, LocateFixed, Minimize2 } from "lucide-react";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
  StyleSpecification,
} from "maplibre-gl";
import { NetworkMapSvg } from "@/components/network-map-svg";
import type { LinkStatus, MapBounds, NetworkMapData, OccupancyLevel } from "@/lib/noc-map";
import {
  CUSTOMER_COORDINATE_SOURCE_LABEL,
  customerCoordinateSourceOf,
} from "@/components/network-map-geometry";

const MAP_STYLE_URL = "/maps/style.json";
const TOPOLOGY_SOURCE_ID = "perumnet-topology-lines";
const INFRASTRUCTURE_SOURCE_ID = "perumnet-infrastructure-points";
const CUSTOMER_SOURCE_ID = "perumnet-customer-points";
const TOPOLOGY_LINE_LAYER_ID = "perumnet-topology-lines";
const ROUTE_LAYER_ID = "perumnet-fiber-routes";
const CUSTOMER_LINK_LAYER_ID = "perumnet-customer-links";
const INFRASTRUCTURE_CLUSTER_LAYER_ID = "perumnet-infrastructure-clusters";
const INFRASTRUCTURE_CLUSTER_COUNT_LAYER_ID = "perumnet-infrastructure-cluster-count";
const INFRASTRUCTURE_LAYER_ID = "perumnet-infrastructure-points";
const CUSTOMER_CLUSTER_LAYER_ID = "perumnet-customer-clusters";
const CUSTOMER_CLUSTER_COUNT_LAYER_ID = "perumnet-customer-cluster-count";
const CUSTOMER_LAYER_ID = "perumnet-customer-points";
const CUSTOMER_INHERITED_LAYER_ID = "perumnet-customer-inherited-points";

export type NetworkTopologyNodeKind = "POP" | "ODC" | "OLT" | "MS" | "ODP";

export type NetworkTopologyNode = {
  id: string;
  refId: string;
  kind: NetworkTopologyNodeKind;
  label: string;
  latitude: number;
  longitude: number;
  status: string;
  siteType?: string;
};

export type NetworkTopologyEdgeKind =
  | "SITE_LINK"
  | "SITE_OLT"
  | "OLT_ODP"
  | "SITE_ODP"
  | "ODP_CASCADE";

export type NetworkTopologyEdge = {
  id: string;
  fromId: string;
  toId: string;
  kind: NetworkTopologyEdgeKind;
  label: string;
};

export type NetworkTopology = {
  nodes: NetworkTopologyNode[];
  edges: NetworkTopologyEdge[];
  bounds: MapBounds | null;
};

type NetworkFeatureProperties = {
  kind: "site" | "olt" | "odp" | "route" | "customer" | "customer-link" | "topology-link";
  id: string;
  color: string;
  label: string;
  status?: string;
  used?: number;
  capacity?: number;
  occupancyLabel?: string;
  role?: string;
  siteType?: string;
  routeType?: string;
  lengthMeters?: number;
  serviceNumber?: string;
  customerName?: string;
  portNumber?: number | null;
  linkStatus?: LinkStatus;
  routerName?: string | null;
  lastSeenAt?: string | null;
  coordinateSource?: "CUSTOMER_COORDINATE" | "ODP_INHERITED";
  coordinateSourceLabel?: string;
  selected?: boolean;
  nodeKind?: NetworkTopologyNodeKind;
  edgeKind?: NetworkTopologyEdgeKind;
  refId?: string;
};

type NetworkLineCollection = GeoJSON.FeatureCollection<GeoJSON.LineString, NetworkFeatureProperties>;
type NetworkPointCollection = GeoJSON.FeatureCollection<GeoJSON.Point, NetworkFeatureProperties>;

type NetworkOverlay = {
  lines: NetworkLineCollection;
  infrastructure: NetworkPointCollection;
  customers: NetworkPointCollection;
};

type NetworkMapPalette = {
  occupancy: Record<OccupancyLevel, string>;
  subscription: Record<string, string>;
  linkStatus: Record<LinkStatus, string>;
  site: Record<string, string>;
  route: Record<string, string>;
};

type NetworkMapProps = {
  data: NetworkMapData;
  topology: NetworkTopology;
  selectedOdpId: string | null;
  palette: NetworkMapPalette;
  occupancyLabels: Record<OccupancyLevel, string>;
  styleUrl?: string;
};

type MapStatus = "loading" | "ready" | "error" | "unavailable";

function styleUrlFromEnvironment(styleUrl?: string) {
  return styleUrl?.trim() || process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim() || MAP_STYLE_URL;
}

const TOPOLOGY_EDGE_COLOR: Record<NetworkTopologyEdgeKind, string> = {
  SITE_LINK: "#64748b",
  SITE_OLT: "#0e7490",
  OLT_ODP: "#0f766e",
  SITE_ODP: "#0d9488",
  ODP_CASCADE: "#d97706",
};

function topologyFallbackNodes(data: NetworkMapData): NetworkTopologyNode[] {
  return [
    ...data.sites.map((site) => ({
      id: `site:${site.id}`,
      refId: site.id,
      kind: "POP" as const,
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
}

function buildOverlay(
  data: NetworkMapData,
  topology: NetworkTopology,
  palette: NetworkMapPalette,
  occupancyLabels: Record<OccupancyLevel, string>,
  selectedOdpId: string | null,
): NetworkOverlay {
  const odpById = new Map(data.odps.map((odp) => [odp.id, odp]));
  const nodes = topology.nodes.length ? topology.nodes : topologyFallbackNodes(data);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const lines: NetworkLineCollection["features"] = [];
  const infrastructure: NetworkPointCollection["features"] = [];
  const customers: NetworkPointCollection["features"] = [];

  for (const node of nodes) {
    const odp = node.refId ? odpById.get(node.refId) : null;
    const isOdpNode = node.kind === "ODP" || node.kind === "MS";
    const featureKind = isOdpNode ? "odp" : node.kind === "OLT" ? "olt" : "site";
    infrastructure.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [node.longitude, node.latitude] },
      properties: {
        kind: featureKind,
        id: node.id,
        refId: node.refId,
        color: isOdpNode
          ? palette.occupancy[odp?.occupancy ?? "FREE"]
          : node.kind === "OLT"
            ? "#2563eb"
            : palette.site[node.siteType ?? node.kind] ?? palette.site.DEFAULT ?? "#0e7490",
        label: node.label,
        status: node.status,
        siteType: node.siteType,
        nodeKind: node.kind,
        role: isOdpNode ? node.kind : undefined,
        used: odp?.used,
        capacity: odp?.capacity,
        occupancyLabel: odp ? occupancyLabels[odp.occupancy] : undefined,
        selected: odp?.id === selectedOdpId,
      },
    });
  }

  for (const edge of topology.edges) {
    const from = nodeById.get(edge.fromId);
    const to = nodeById.get(edge.toId);
    if (!from || !to || (from.latitude === to.latitude && from.longitude === to.longitude)) continue;
    lines.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [from.longitude, from.latitude],
          [to.longitude, to.latitude],
        ],
      },
      properties: {
        kind: "topology-link",
        id: edge.id,
        color: TOPOLOGY_EDGE_COLOR[edge.kind],
        label: edge.label,
        edgeKind: edge.kind,
      },
    });
  }

  for (const route of data.routes) {
    if (route.coordinates.length < 2) continue;
    lines.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: route.coordinates },
      properties: {
        kind: "route",
        id: route.id,
        color: palette.route[route.routeType] ?? palette.route.DEFAULT ?? "#64748b",
        label: route.name,
        routeType: route.routeType,
        lengthMeters: route.lengthMeters,
      },
    });
  }

  for (const customer of data.customers) {
    const odp = customer.odpId ? odpById.get(customer.odpId) : null;
    const coordinateSource = customerCoordinateSourceOf(customer, odp);
    customers.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [customer.longitude, customer.latitude] },
      properties: {
        kind: "customer",
        id: customer.subscriptionId,
        color: palette.linkStatus[customer.linkStatus],
        label: customer.customerName,
        status: customer.status,
        serviceNumber: customer.serviceNumber,
        customerName: customer.customerName,
        portNumber: customer.portNumber,
        linkStatus: customer.linkStatus,
        routerName: customer.routerName,
        lastSeenAt: customer.lastSeenAt,
        coordinateSource,
        coordinateSourceLabel: CUSTOMER_COORDINATE_SOURCE_LABEL[coordinateSource],
      },
    });

    if (odp && (customer.latitude !== odp.latitude || customer.longitude !== odp.longitude)) {
      lines.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [customer.longitude, customer.latitude],
            [odp.longitude, odp.latitude],
          ],
        },
        properties: {
          kind: "customer-link",
          id: `${customer.subscriptionId}-${odp.id}`,
          color: palette.linkStatus[customer.linkStatus],
          label: `${customer.serviceNumber} → ${odp.code}`,
        },
      });
    }
  }

  if (!topology.edges.some((edge) => edge.kind === "ODP_CASCADE")) {
    for (const cascade of data.cascades) {
      const from = odpById.get(cascade.fromId);
      const to = odpById.get(cascade.toId);
      if (!from || !to || (from.latitude === to.latitude && from.longitude === to.longitude)) continue;
      lines.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [from.longitude, from.latitude],
            [to.longitude, to.latitude],
          ],
        },
        properties: {
          kind: "topology-link",
          id: `${cascade.fromId}-${cascade.toId}`,
          color: TOPOLOGY_EDGE_COLOR.ODP_CASCADE,
          label: `${from.code} → ${to.code}`,
          edgeKind: "ODP_CASCADE",
        },
      });
    }
  }

  return {
    lines: { type: "FeatureCollection", features: lines },
    infrastructure: { type: "FeatureCollection", features: infrastructure },
    customers: { type: "FeatureCollection", features: customers },
  };
}

function featureText(properties: Record<string, unknown>, key: string, fallback = "—") {
  const value = properties[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function createPopupContent(
  properties: Record<string, unknown>,
  onOpenOdp: ((id: string) => void) | null,
) {
  const root = document.createElement("div");
  root.className = "crm-network-popup-content";

  const heading = document.createElement("strong");
  heading.textContent = featureText(properties, "label");
  root.append(heading);

  const detail = document.createElement("p");
  const supplementary: HTMLElement[] = [];
  if (properties.kind === "site") {
    detail.textContent = `${featureText(properties, "siteType")} · status ${featureText(properties, "status")}`;
  } else if (properties.kind === "olt") {
    detail.textContent = `OLT · status ${featureText(properties, "status")} · lokasi ${featureText(properties, "siteType")}`;
  } else if (properties.kind === "route") {
    const length = Number(properties.lengthMeters);
    const lengthLabel = Number.isFinite(length) ? `${Math.round(length)} m (perkiraan)` : "panjang belum tersedia";
    detail.textContent = `${featureText(properties, "routeType")} · ${lengthLabel}`;
  } else if (properties.kind === "odp") {
    detail.textContent = `${featureText(properties, "role", "ODP")} · ${featureText(properties, "used", "0")}/${featureText(properties, "capacity", "0")} port · ${featureText(properties, "occupancyLabel")}`;
  } else if (properties.kind === "topology-link") {
    detail.textContent = `Koneksi ${featureText(properties, "edgeKind")} · relasi tersimpan`;
  } else {
    const lastSeen = featureText(properties, "lastSeenAt", "belum tersedia");
    detail.textContent = `${featureText(properties, "serviceNumber")} · subscription ${featureText(properties, "status")} · link ${featureText(properties, "linkStatus", "UNKNOWN")}`;
    const location = document.createElement("p");
    location.textContent = `Lokasi: ${featureText(properties, "coordinateSourceLabel", "sumber lokasi belum tersedia")}`;
    const extra = document.createElement("p");
    extra.textContent = `Router: ${featureText(properties, "routerName", "belum tersedia")} · terakhir terlihat: ${lastSeen}`;
    supplementary.push(location, extra);
  }
  root.append(detail, ...supplementary);

  const odpId = typeof properties.refId === "string" ? properties.refId : properties.id;
  if (properties.kind === "odp" && onOpenOdp && typeof odpId === "string") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "crm-network-popup-action";
    button.textContent = "Buka detail ODP";
    button.addEventListener("click", () => onOpenOdp(odpId));
    root.append(button);
  }

  return root;
}

function applyMapLayers(map: MapLibreMap, overlay: NetworkOverlay) {
  if (map.getSource(TOPOLOGY_SOURCE_ID)) {
    (map.getSource(TOPOLOGY_SOURCE_ID) as GeoJSONSource).setData(overlay.lines);
    (map.getSource(INFRASTRUCTURE_SOURCE_ID) as GeoJSONSource).setData(overlay.infrastructure);
    (map.getSource(CUSTOMER_SOURCE_ID) as GeoJSONSource).setData(overlay.customers);
    return;
  }

  map.addSource(TOPOLOGY_SOURCE_ID, {
    type: "geojson",
    data: overlay.lines,
  });

  map.addSource(INFRASTRUCTURE_SOURCE_ID, {
    type: "geojson",
    data: overlay.infrastructure,
    cluster: true,
    clusterRadius: 48,
    clusterMaxZoom: 14,
  });

  map.addSource(CUSTOMER_SOURCE_ID, {
    type: "geojson",
    data: overlay.customers,
    cluster: true,
    clusterRadius: 48,
    clusterMaxZoom: 14,
  });

  map.addLayer({
    id: TOPOLOGY_LINE_LAYER_ID,
    type: "line",
    source: TOPOLOGY_SOURCE_ID,
    filter: ["==", ["get", "kind"], "topology-link"],
    minzoom: 15,
    paint: {
      "line-color": ["get", "color"],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.42, 12, 0.68, 14, 0.92],
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.9, 12, 1.5, 16, 2.6],
    },
  });

  map.addLayer({
    id: ROUTE_LAYER_ID,
    type: "line",
    source: TOPOLOGY_SOURCE_ID,
    filter: ["==", ["get", "kind"], "route"],
    minzoom: 15,
    paint: {
      "line-color": ["get", "color"],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.34, 12, 0.64, 15, 0.88],
      "line-width": [
        "match",
        ["get", "routeType"],
        "FEEDER", 3.4,
        "DISTRIBUTION", 2.5,
        "DROP", 1.4,
        1.8,
      ],
    },
  });

  map.addLayer({
    id: CUSTOMER_LINK_LAYER_ID,
    type: "line",
    source: TOPOLOGY_SOURCE_ID,
    filter: ["==", ["get", "kind"], "customer-link"],
    minzoom: 15,
    paint: {
      "line-color": ["get", "color"],
      "line-dasharray": [1.5, 1.5],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0.22, 14, 0.46, 16, 0.72],
      "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.8, 14, 1.2, 17, 1.8],
    },
  });

  map.addLayer({
    id: INFRASTRUCTURE_CLUSTER_LAYER_ID,
    type: "circle",
    source: INFRASTRUCTURE_SOURCE_ID,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#0f766e",
      "circle-radius": ["step", ["get", "point_count"], 18, 10, 22, 50, 28],
      "circle-stroke-color": "#ccfbf1",
      "circle-stroke-width": 2,
    },
  });

  map.addLayer({
    id: INFRASTRUCTURE_CLUSTER_COUNT_LAYER_ID,
    type: "symbol",
    source: INFRASTRUCTURE_SOURCE_ID,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 12,
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": "#ffffff",
    },
  });

  map.addLayer({
    id: INFRASTRUCTURE_LAYER_ID,
    type: "circle",
    source: INFRASTRUCTURE_SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": ["get", "color"],
      "circle-opacity": 0.98,
      "circle-radius": ["match", ["get", "nodeKind"], "OLT", 7, "MS", 10, "ODC", 9, "POP", 8, 7],
      "circle-stroke-color": [
        "case",
        ["boolean", ["get", "selected"], false],
        "#0f172a",
        ["==", ["get", "nodeKind"], "MS"],
        "#f59e0b",
        "#ffffff",
      ],
      "circle-stroke-width": [
        "case",
        ["boolean", ["get", "selected"], false],
        3,
        1.5,
      ],
    },
  });

  map.addLayer({
    id: CUSTOMER_CLUSTER_LAYER_ID,
    type: "circle",
    source: CUSTOMER_SOURCE_ID,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#0369a1",
      "circle-radius": ["step", ["get", "point_count"], 18, 10, 22, 50, 28],
      "circle-stroke-color": "#bae6fd",
      "circle-stroke-width": 2,
    },
  });

  map.addLayer({
    id: CUSTOMER_CLUSTER_COUNT_LAYER_ID,
    type: "symbol",
    source: CUSTOMER_SOURCE_ID,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 12,
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": "#ffffff",
    },
  });

  map.addLayer({
    id: CUSTOMER_LAYER_ID,
    type: "circle",
    source: CUSTOMER_SOURCE_ID,
    filter: [
      "all",
      ["!", ["has", "point_count"]],
      ["==", ["get", "coordinateSource"], "CUSTOMER_COORDINATE"],
    ],
    minzoom: 8,
    paint: {
      "circle-color": ["get", "color"],
      "circle-opacity": 0.88,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3, 14, 4.5, 17, 6],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1,
    },
  });

  map.addLayer({
    id: CUSTOMER_INHERITED_LAYER_ID,
    type: "circle",
    source: CUSTOMER_SOURCE_ID,
    filter: [
      "all",
      ["!", ["has", "point_count"]],
      ["==", ["get", "coordinateSource"], "ODP_INHERITED"],
    ],
    minzoom: 8,
    paint: {
      "circle-color": ["get", "color"],
      "circle-opacity": 0.88,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3.5, 14, 5, 17, 6.5],
      "circle-stroke-color": "#d97706",
      "circle-stroke-width": 2.5,
    },
  });
}

function fitMapToData(map: MapLibreMap, data: NetworkMapData, topology: NetworkTopology) {
  const mapBounds = topology.bounds ?? data.bounds;
  if (!mapBounds) return;

  const latSpan = Math.max(mapBounds.maxLat - mapBounds.minLat, 0.004);
  const lngSpan = Math.max(mapBounds.maxLng - mapBounds.minLng, 0.004);
  const mapLibreBounds: [[number, number], [number, number]] = [
    [mapBounds.minLng - lngSpan * 0.08, mapBounds.minLat - latSpan * 0.08],
    [mapBounds.maxLng + lngSpan * 0.08, mapBounds.maxLat + latSpan * 0.08],
  ];

  map.fitBounds(mapLibreBounds, {
    padding: 44,
    maxZoom: 16,
    duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420,
  });
}

export function NetworkMap({
  data,
  topology,
  selectedOdpId,
  palette,
  occupancyLabels,
  styleUrl,
}: NetworkMapProps) {
  const router = useRouter();
  const shellRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectedOdpIdRef = useRef(selectedOdpId);
  const dataRef = useRef(data);
  const topologyRef = useRef(topology);
  const paletteRef = useRef(palette);
  const occupancyLabelsRef = useRef(occupancyLabels);
  const mapReadyRef = useRef(false);
  const [status, setStatus] = useState<MapStatus>(data.bounds || topology.bounds ? "loading" : "unavailable");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const resolvedStyleUrl = styleUrlFromEnvironment(styleUrl);

  selectedOdpIdRef.current = selectedOdpId;
  dataRef.current = data;
  topologyRef.current = topology;
  paletteRef.current = palette;
  occupancyLabelsRef.current = occupancyLabels;

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === shellRef.current);
      window.requestAnimationFrame(() => mapRef.current?.resize());
    };

    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const focusMap = useCallback(() => {
    if (!mapReadyRef.current || !mapRef.current) return;
    mapRef.current.resize();
    fitMapToData(mapRef.current, dataRef.current, topologyRef.current);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    setFullscreenError(null);
    const shell = shellRef.current;
    if (!shell || !document.fullscreenEnabled) {
      setFullscreenError("Fullscreen tidak tersedia di browser ini.");
      return;
    }

    try {
      if (document.fullscreenElement === shell) await document.exitFullscreen();
      else await shell.requestFullscreen();
    } catch {
      setFullscreenError("Fullscreen tidak dapat dibuka. Gunakan kontrol fullscreen browser.");
    }
  }, []);

  const handleFallbackClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<SVGGElement>("[data-odp-href]");
    if (!link || !event.currentTarget.contains(link)) return;
    const href = link.getAttribute("data-odp-href");
    if (href) router.push(href);
  }, [router]);

  const handleFallbackKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<SVGGElement>("[data-odp-href]");
    if (!link || !event.currentTarget.contains(link)) return;
    const href = link.getAttribute("data-odp-href");
    if (!href) return;
    event.preventDefault();
    router.push(href);
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let activeMap: MapLibreMap | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const initialBounds = topology.bounds ?? data.bounds;
    if (!initialBounds || !containerRef.current) {
      setStatus("unavailable");
      setErrorMessage(null);
      return () => controller.abort();
    }

    setStatus("loading");
    setErrorMessage(null);
    mapReadyRef.current = false;

    const fail = (message: string) => {
      if (cancelled) return;
      mapReadyRef.current = false;
      setStatus("error");
      setErrorMessage(message);
      resizeObserver?.disconnect();
      resizeObserver = null;
      activeMap?.remove();
      activeMap = null;
      mapRef.current = null;
    };

    const initialize = async () => {
      try {
        const response = await fetch(resolvedStyleUrl, {
          signal: controller.signal,
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`Style peta mengembalikan HTTP ${response.status}`);
        }
        const style = (await response.json()) as StyleSpecification;
        if (cancelled || !containerRef.current) return;

        const maplibre = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;

        const map = new maplibre.Map({
          container: containerRef.current,
          style,
          center: [
            (initialBounds.minLng + initialBounds.maxLng) / 2,
            (initialBounds.minLat + initialBounds.maxLat) / 2,
          ],
          zoom: 13,
          // MapLibre menambahkan AttributionControl sendiri bila ini tidak
          // dimatikan. Karena kita memasang satu secara eksplisit di bawah —
          // agar posisinya terkendali — yang bawaan harus dimatikan; kalau
          // tidak, atribusi OpenStreetMap tampil DUA KALI.
          attributionControl: false,
        });
        activeMap = map;
        mapRef.current = map;
        if (typeof ResizeObserver !== "undefined" && containerRef.current) {
          resizeObserver = new ResizeObserver(() => {
            if (cancelled) return;
            window.requestAnimationFrame(() => {
              if (!cancelled && mapRef.current === map) map.resize();
            });
          });
          resizeObserver.observe(containerRef.current);
          window.requestAnimationFrame(() => {
            if (!cancelled && mapRef.current === map) map.resize();
          });
        }
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(new maplibre.AttributionControl({ compact: true }), "bottom-right");

        map.once("load", () => {
          if (cancelled) return;
          applyMapLayers(
            map,
            buildOverlay(
              dataRef.current,
              topologyRef.current,
              paletteRef.current,
              occupancyLabelsRef.current,
              selectedOdpIdRef.current,
            ),
          );
          mapReadyRef.current = true;
          setStatus("ready");
          fitMapToData(map, dataRef.current, topologyRef.current);
        });

        map.on("error", (event) => {
          const message = event.error instanceof Error ? event.error.message : "Tile/style peta gagal dimuat";
          fail(`Basemap tidak tersedia. ${message}`);
        });

        const openOdp = (odpId: string) => {
          const params = new URLSearchParams(window.location.search);
          if (selectedOdpIdRef.current === odpId) params.delete("odp");
          else params.set("odp", odpId);
          const query = params.toString();
          router.push(query ? `/noc/map?${query}` : "/noc/map");
        };

        // SATU popup, dipakai ulang. Sebelumnya tiap klik membuat popup BARU
        // tanpa menutup yang lama — dan karena lima lapisan mendaftarkan
        // penangan yang sama, satu klik yang mengenai titik ODP sekaligus garis
        // topologi di bawahnya memunculkan DUA popup bertumpuk. Yang di atas
        // menutupi tombol yang di bawah.
        let popupAktif: import("maplibre-gl").Popup | null = null;

        const showPopup = (event: MapLayerMouseEvent) => {
          const feature = event.features?.[0];
          if (!feature) return;
          const properties = feature.properties ?? {};
          if (!popupAktif) {
            popupAktif = new maplibre.Popup({ closeButton: true, closeOnClick: true, maxWidth: "280px" });
            popupAktif.on("close", () => {
              popupAktif = null;
            });
          }
          popupAktif
            .setLngLat(event.lngLat)
            .setDOMContent(
              createPopupContent(
                properties,
                properties.kind === "odp" ? openOdp : null,
              ),
            )
            .addTo(map);
        };

        const expandCluster = (sourceId: string) => (event: MapLayerMouseEvent) => {
          const feature = event.features?.[0];
          const clusterId = Number(feature?.properties?.cluster_id);
          const source = map.getSource(sourceId) as GeoJSONSource | undefined;
          if (!source || !Number.isFinite(clusterId)) return;
          void source
            .getClusterExpansionZoom(clusterId)
            .then((zoom) => {
              if (cancelled) return;
              map.easeTo({
                center: event.lngLat,
                zoom,
                duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420,
              });
            })
            .catch(() => undefined);
        };

        map.on("click", INFRASTRUCTURE_CLUSTER_LAYER_ID, expandCluster(INFRASTRUCTURE_SOURCE_ID));
        map.on("click", CUSTOMER_CLUSTER_LAYER_ID, expandCluster(CUSTOMER_SOURCE_ID));
        // URUTAN INI MENENTUKAN SIAPA YANG MENANG. Penangan dijalankan sesuai
        // urutan pendaftaran, dan yang terakhir mengganti isi popup. Jadi garis
        // didaftarkan DULU, titik BELAKANGAN — supaya klik pada ODP menampilkan
        // ODP-nya, bukan garis topologi yang kebetulan berakhir di titik yang
        // sama. Sebelumnya TOPOLOGY_LINE terdaftar terakhir dan selalu menang.
        map.on("click", ROUTE_LAYER_ID, showPopup);
        map.on("click", TOPOLOGY_LINE_LAYER_ID, showPopup);
        map.on("click", CUSTOMER_INHERITED_LAYER_ID, showPopup);
        map.on("click", CUSTOMER_LAYER_ID, showPopup);
        map.on("click", INFRASTRUCTURE_LAYER_ID, showPopup);
        map.on("mouseenter", INFRASTRUCTURE_CLUSTER_LAYER_ID, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseenter", CUSTOMER_CLUSTER_LAYER_ID, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseenter", INFRASTRUCTURE_LAYER_ID, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseenter", CUSTOMER_LAYER_ID, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseenter", CUSTOMER_INHERITED_LAYER_ID, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseenter", ROUTE_LAYER_ID, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseenter", TOPOLOGY_LINE_LAYER_ID, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", INFRASTRUCTURE_CLUSTER_LAYER_ID, () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("mouseleave", CUSTOMER_CLUSTER_LAYER_ID, () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("mouseleave", INFRASTRUCTURE_LAYER_ID, () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("mouseleave", CUSTOMER_LAYER_ID, () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("mouseleave", CUSTOMER_INHERITED_LAYER_ID, () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("mouseleave", ROUTE_LAYER_ID, () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("mouseleave", TOPOLOGY_LINE_LAYER_ID, () => {
          map.getCanvas().style.cursor = "";
        });
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        fail(error instanceof Error ? error.message : "Style peta gagal dimuat");
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      controller.abort();
      mapReadyRef.current = false;
      resizeObserver?.disconnect();
      resizeObserver = null;
      activeMap?.remove();
      if (mapRef.current === activeMap) mapRef.current = null;
    };
  }, [resolvedStyleUrl, router]);

  useEffect(() => {
    if (!mapReadyRef.current || !mapRef.current) return;
    applyMapLayers(
      mapRef.current,
      buildOverlay(data, topology, palette, occupancyLabels, selectedOdpId),
    );
    fitMapToData(mapRef.current, data, topology);
  }, [data, topology, palette, occupancyLabels, selectedOdpId]);

  const statusLabel =
    status === "loading"
      ? "Memuat basemap…"
      : status === "error"
        ? "Basemap belum tersedia. Peta jaringan mandiri tetap ditampilkan."
        : null;

  return (
    <div ref={shellRef} className={`crm-network-map-shell is-${status}`}>
      <div
        ref={containerRef}
        className="crm-network-map-canvas"
        role="application"
        aria-label="Peta jaringan interaktif"
        aria-hidden={status !== "ready"}
      />
      <div className="crm-network-map-toolbar" aria-label="Kontrol tampilan peta">
        <button
          type="button"
          className="crm-network-map-tool"
          onClick={focusMap}
          disabled={status !== "ready"}
          aria-label="Pusatkan peta ke semua data"
          title="Pusatkan peta"
          data-testid="network-map-fit"
        >
          <LocateFixed aria-hidden="true" />
        </button>
        <button
          type="button"
          className="crm-network-map-tool"
          onClick={() => void toggleFullscreen()}
          aria-label={isFullscreen ? "Keluar dari fullscreen" : "Buka fullscreen"}
          aria-pressed={isFullscreen}
          title={isFullscreen ? "Keluar dari fullscreen" : "Buka fullscreen"}
          data-testid="network-map-fullscreen"
        >
          {isFullscreen ? <Minimize2 aria-hidden="true" /> : <Expand aria-hidden="true" />}
        </button>
      </div>
      {/*
        Peta cadangan hanya digambar ketika basemap benar-benar GAGAL —
        bukan selagi ia masih memuat.

        Bedanya besar dan tidak kentara. `status !== "ready"` juga benar pada
        keadaan awal "loading", dan komponen klien tetap dirender di server
        pada render pertama. Akibatnya seluruh SVG — ribuan elemen dengan
        koordinat piksel presisi penuh — ikut terkirim sebagai HTML kepada
        semua orang, termasuk yang basemap-nya baik-baik saja.

        Selagi memuat, yang tampil cukup tulisan "Memuat basemap…" di bawah.
      */}
      {(status === "error" || status === "unavailable") && (
        <div
          className="crm-network-map-fallback"
          onClick={handleFallbackClick}
          onKeyDown={handleFallbackKeyDown}
        >
          <NetworkMapSvg
            data={data}
            topology={topology}
            selectedOdpId={selectedOdpId}
            linkPalette={palette.linkStatus}
            sitePalette={palette.site}
            routePalette={palette.route}
          />
        </div>
      )}
      {statusLabel && (
        <div className="crm-network-map-status" role="status">
          {statusLabel}
        </div>
      )}
      {fullscreenError && (
        <div className="crm-network-map-status is-error" role="status">
          {fullscreenError}
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {status === "ready" ? "Basemap aktif." : errorMessage ?? ""}
      </p>
    </div>
  );
}
