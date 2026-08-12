"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
  StyleSpecification,
} from "maplibre-gl";
import type { LinkStatus, NetworkMapData, OccupancyLevel } from "@/lib/noc-map";

const MAP_STYLE_URL = "/maps/style.json";
const NETWORK_SOURCE_ID = "perumnet-network-overlay";
const CUSTOMER_LINK_LAYER_ID = "perumnet-customer-links";
const CASCADE_LAYER_ID = "perumnet-odp-cascades";
const CUSTOMER_LAYER_ID = "perumnet-customers";
const ODP_LAYER_ID = "perumnet-odps";

type NetworkFeatureProperties = {
  kind: "odp" | "customer" | "customer-link" | "cascade";
  id: string;
  color: string;
  label: string;
  status?: string;
  used?: number;
  capacity?: number;
  occupancyLabel?: string;
  serviceNumber?: string;
  customerName?: string;
  portNumber?: number | null;
  linkStatus?: LinkStatus;
  routerName?: string | null;
  lastSeenAt?: string | null;
  selected?: boolean;
};

type NetworkFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point | GeoJSON.LineString,
  NetworkFeatureProperties
>;

type NetworkMapPalette = {
  occupancy: Record<OccupancyLevel, string>;
  subscription: Record<string, string>;
  linkStatus: Record<LinkStatus, string>;
};

type NetworkMapProps = {
  data: NetworkMapData;
  selectedOdpId: string | null;
  palette: NetworkMapPalette;
  occupancyLabels: Record<OccupancyLevel, string>;
  fallback: ReactNode;
  styleUrl?: string;
};

type MapStatus = "loading" | "ready" | "error" | "unavailable";

function styleUrlFromEnvironment(styleUrl?: string) {
  return styleUrl?.trim() || process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim() || MAP_STYLE_URL;
}

function buildOverlay(
  data: NetworkMapData,
  palette: NetworkMapPalette,
  occupancyLabels: Record<OccupancyLevel, string>,
  selectedOdpId: string | null,
): NetworkFeatureCollection {
  const odpById = new Map(data.odps.map((odp) => [odp.id, odp]));
  const features: NetworkFeatureCollection["features"] = [];

  for (const odp of data.odps) {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [odp.longitude, odp.latitude] },
      properties: {
        kind: "odp",
        id: odp.id,
        color: palette.occupancy[odp.occupancy],
        label: odp.code,
        status: odp.status,
        used: odp.used,
        capacity: odp.capacity,
        occupancyLabel: occupancyLabels[odp.occupancy],
        selected: odp.id === selectedOdpId,
      },
    });
  }

  for (const customer of data.customers) {
    features.push({
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
      },
    });

    const odp = customer.odpId ? odpById.get(customer.odpId) : null;
    if (odp) {
      features.push({
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

  for (const cascade of data.cascades) {
    const from = odpById.get(cascade.fromId);
    const to = odpById.get(cascade.toId);
    if (!from || !to) continue;
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [from.longitude, from.latitude],
          [to.longitude, to.latitude],
        ],
      },
      properties: {
        kind: "cascade",
        id: `${cascade.fromId}-${cascade.toId}`,
        color: "#94a3b8",
        label: `${from.code} → ${to.code}`,
      },
    });
  }

  return { type: "FeatureCollection", features };
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
  if (properties.kind === "odp") {
    detail.textContent = `${featureText(properties, "used", "0")}/${featureText(properties, "capacity", "0")} port · ${featureText(properties, "occupancyLabel")}`;
  } else {
    const lastSeen = featureText(properties, "lastSeenAt", "belum tersedia");
    detail.textContent = `${featureText(properties, "serviceNumber")} · subscription ${featureText(properties, "status")} · link ${featureText(properties, "linkStatus", "UNKNOWN")}`;

    const extra = document.createElement("p");
    extra.textContent = `Router: ${featureText(properties, "routerName", "belum tersedia")} · terakhir terlihat: ${lastSeen}`;
    root.append(extra);
  }
  root.append(detail);

  if (properties.kind === "odp" && onOpenOdp && typeof properties.id === "string") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "crm-network-popup-action";
    button.textContent = "Buka detail ODP";
    button.addEventListener("click", () => onOpenOdp(properties.id as string));
    root.append(button);
  }

  return root;
}

function applyMapLayers(map: MapLibreMap, overlay: NetworkFeatureCollection) {
  if (map.getSource(NETWORK_SOURCE_ID)) {
    (map.getSource(NETWORK_SOURCE_ID) as GeoJSONSource).setData(overlay);
    return;
  }

  map.addSource(NETWORK_SOURCE_ID, {
    type: "geojson",
    data: overlay,
  });

  map.addLayer({
    id: CUSTOMER_LINK_LAYER_ID,
    type: "line",
    source: NETWORK_SOURCE_ID,
    filter: ["==", ["get", "kind"], "customer-link"],
    paint: {
      "line-color": ["get", "color"],
      "line-opacity": 0.62,
      "line-width": 1,
    },
  });

  map.addLayer({
    id: CASCADE_LAYER_ID,
    type: "line",
    source: NETWORK_SOURCE_ID,
    filter: ["==", ["get", "kind"], "cascade"],
    paint: {
      "line-color": ["get", "color"],
      "line-dasharray": [2, 2],
      "line-opacity": 0.9,
      "line-width": 1.5,
    },
  });

  map.addLayer({
    id: CUSTOMER_LAYER_ID,
    type: "circle",
    source: NETWORK_SOURCE_ID,
    filter: ["==", ["get", "kind"], "customer"],
    paint: {
      "circle-color": ["get", "color"],
      "circle-opacity": 0.88,
      "circle-radius": 4,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1,
    },
  });

  map.addLayer({
    id: ODP_LAYER_ID,
    type: "circle",
    source: NETWORK_SOURCE_ID,
    filter: ["==", ["get", "kind"], "odp"],
    paint: {
      "circle-color": ["get", "color"],
      "circle-opacity": 0.98,
      "circle-radius": 8,
      "circle-stroke-color": [
        "case",
        ["boolean", ["get", "selected"], false],
        "#0f172a",
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
}

function fitMapToData(map: MapLibreMap, data: NetworkMapData) {
  if (!data.bounds) return;

  const latSpan = Math.max(data.bounds.maxLat - data.bounds.minLat, 0.004);
  const lngSpan = Math.max(data.bounds.maxLng - data.bounds.minLng, 0.004);
  const bounds: [[number, number], [number, number]] = [
    [data.bounds.minLng - lngSpan * 0.08, data.bounds.minLat - latSpan * 0.08],
    [data.bounds.maxLng + lngSpan * 0.08, data.bounds.maxLat + latSpan * 0.08],
  ];

  map.fitBounds(bounds, {
    padding: 44,
    maxZoom: 16,
    duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420,
  });
}

export function NetworkMap({
  data,
  selectedOdpId,
  palette,
  occupancyLabels,
  fallback,
  styleUrl,
}: NetworkMapProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectedOdpIdRef = useRef(selectedOdpId);
  const dataRef = useRef(data);
  const paletteRef = useRef(palette);
  const occupancyLabelsRef = useRef(occupancyLabels);
  const mapReadyRef = useRef(false);
  const [status, setStatus] = useState<MapStatus>(data.bounds ? "loading" : "unavailable");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const resolvedStyleUrl = styleUrlFromEnvironment(styleUrl);

  selectedOdpIdRef.current = selectedOdpId;
  dataRef.current = data;
  paletteRef.current = palette;
  occupancyLabelsRef.current = occupancyLabels;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let activeMap: MapLibreMap | null = null;

    const initialBounds = data.bounds;
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
        });
        activeMap = map;
        mapRef.current = map;
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");

        map.once("load", () => {
          if (cancelled) return;
          applyMapLayers(
            map,
            buildOverlay(
              dataRef.current,
              paletteRef.current,
              occupancyLabelsRef.current,
              selectedOdpIdRef.current,
            ),
          );
          mapReadyRef.current = true;
          setStatus("ready");
          fitMapToData(map, dataRef.current);
        });

        map.on("error", (event) => {
          const message = event.error instanceof Error ? event.error.message : "Tile/style internal gagal dimuat";
          fail(`Basemap internal belum tersedia. ${message}`);
        });

        const openOdp = (odpId: string) => {
          const params = new URLSearchParams(window.location.search);
          if (selectedOdpIdRef.current === odpId) params.delete("odp");
          else params.set("odp", odpId);
          const query = params.toString();
          router.push(query ? `/noc/map?${query}` : "/noc/map");
        };

        const showPopup = (event: MapLayerMouseEvent) => {
          const feature = event.features?.[0];
          if (!feature) return;
          const properties = feature.properties ?? {};
          new maplibre.Popup({ closeButton: true, closeOnClick: true, maxWidth: "280px" })
            .setLngLat(event.lngLat)
            .setDOMContent(
              createPopupContent(
                properties,
                properties.kind === "odp" ? openOdp : null,
              ),
            )
            .addTo(map);
        };

        map.on("click", ODP_LAYER_ID, showPopup);
        map.on("click", CUSTOMER_LAYER_ID, showPopup);
        map.on("mouseenter", ODP_LAYER_ID, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseenter", CUSTOMER_LAYER_ID, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", ODP_LAYER_ID, () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("mouseleave", CUSTOMER_LAYER_ID, () => {
          map.getCanvas().style.cursor = "";
        });
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        fail(error instanceof Error ? error.message : "Style peta internal gagal dimuat");
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      controller.abort();
      mapReadyRef.current = false;
      activeMap?.remove();
      if (mapRef.current === activeMap) mapRef.current = null;
    };
  }, [resolvedStyleUrl, router]);

  useEffect(() => {
    if (!mapReadyRef.current || !mapRef.current) return;
    const source = mapRef.current.getSource(NETWORK_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(buildOverlay(data, palette, occupancyLabels, selectedOdpId));
    fitMapToData(mapRef.current, data);
  }, [data, palette, occupancyLabels, selectedOdpId]);

  const statusLabel =
    status === "loading"
      ? "Memuat basemap internal…"
      : status === "error"
        ? "Basemap internal belum tersedia. Peta jaringan mandiri tetap ditampilkan."
        : null;

  return (
    <div className={`crm-network-map-shell is-${status}`}>
      <div
        ref={containerRef}
        className="crm-network-map-canvas"
        role="application"
        aria-label="Peta jaringan interaktif"
        aria-hidden={status !== "ready"}
      />
      {status !== "ready" && <div className="crm-network-map-fallback">{fallback}</div>}
      {statusLabel && (
        <div className="crm-network-map-status" role="status">
          {statusLabel}
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {status === "ready" ? "Basemap internal aktif." : errorMessage ?? ""}
      </p>
    </div>
  );
}
