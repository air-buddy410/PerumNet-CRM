"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

const DEFAULT_STYLE_URL = "/maps/style.json";

export function FtthCoordinatePicker({
  initialLatitude,
  initialLongitude,
}: {
  initialLatitude: number | null | undefined;
  initialLongitude: number | null | undefined;
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<{ remove: () => void; setLngLat: (value: [number, number]) => void } | null>(null);
  const [latitude, setLatitude] = useState(initialLatitude?.toString() ?? "");
  const [longitude, setLongitude] = useState(initialLongitude?.toString() ?? "");
  const [mapState, setMapState] = useState<"loading" | "ready" | "unavailable">("loading");
  const hasLatitude = latitude.trim() !== "";
  const hasLongitude = longitude.trim() !== "";
  const hasPartialCoordinate = hasLatitude !== hasLongitude;

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;

    const initialize = async () => {
      try {
        const response = await fetch(
          process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim() || DEFAULT_STYLE_URL,
          { credentials: "same-origin", headers: { Accept: "application/json" } },
        );
        if (!response.ok) throw new Error("Style peta belum tersedia");
        const style = await response.json();
        if (cancelled || !mapContainerRef.current) return;
        const maplibre = await import("maplibre-gl");
        if (cancelled || !mapContainerRef.current) return;

        const initialLat = Number(initialLatitude);
        const initialLng = Number(initialLongitude);
        const hasInitialPoint = Number.isFinite(initialLat) && Number.isFinite(initialLng);
        map = new maplibre.Map({
          container: mapContainerRef.current,
          style,
          center: hasInitialPoint ? [initialLng, initialLat] : [0, 0],
          zoom: hasInitialPoint ? 14 : 2,
        });
        mapRef.current = map;
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        if (hasInitialPoint) {
          markerRef.current = new maplibre.Marker({ color: "#04a99f" })
            .setLngLat([initialLng, initialLat])
            .addTo(map);
        }
        map.on("click", (event) => {
          const nextLatitude = event.lngLat.lat.toFixed(6);
          const nextLongitude = event.lngLat.lng.toFixed(6);
          setLatitude(nextLatitude);
          setLongitude(nextLongitude);
          if (markerRef.current) {
            markerRef.current.setLngLat([event.lngLat.lng, event.lngLat.lat]);
          } else {
            markerRef.current = new maplibre.Marker({ color: "#04a99f" })
              .setLngLat([event.lngLat.lng, event.lngLat.lat])
              .addTo(map!);
          }
        });
        map.once("load", () => {
          if (!cancelled) setMapState("ready");
        });
        map.on("error", () => {
          if (!cancelled) setMapState("unavailable");
        });
      } catch {
        if (!cancelled) setMapState("unavailable");
      }
    };

    void initialize();
    return () => {
      cancelled = true;
      markerRef.current?.remove();
      markerRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
  }, [initialLatitude, initialLongitude]);

  useEffect(() => {
    const map = mapRef.current;
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!map || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    markerRef.current?.setLngLat([lng, lat]);
  }, [latitude, longitude]);

  return (
    <fieldset className="crm-coordinate-picker">
      <legend className="label">Koordinat titik</legend>
      <p className="crm-coordinate-picker-help">
        Klik peta internal untuk mengisi latitude dan longitude, atau masukkan nilainya secara manual.
      </p>
      <div className={`crm-coordinate-picker-map is-${mapState}`} ref={mapContainerRef}>
        {mapState !== "ready" && (
          <span role="status">
            {mapState === "loading"
              ? "Memuat peta internal…"
              : "Peta koordinat internal belum tersedia. Input manual tetap dapat digunakan."}
          </span>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="latitude">Latitude</label>
          <input
            id="latitude"
            name="latitude"
            type="number"
            step="any"
            className="input"
            value={latitude}
            onChange={(event) => setLatitude(event.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="longitude">Longitude</label>
          <input
            id="longitude"
            name="longitude"
            type="number"
            step="any"
            className="input"
            value={longitude}
            onChange={(event) => setLongitude(event.target.value)}
          />
        </div>
      </div>
      {hasPartialCoordinate && (
        <p className="crm-coordinate-picker-warning" role="alert">
          Isi latitude dan longitude bersama-sama. Kosongkan keduanya jika site memang tidak memiliki lokasi.
        </p>
      )}
    </fieldset>
  );
}
