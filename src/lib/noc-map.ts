import { db } from "@/lib/db";

// ── Peta Jaringan Terpadu (Fase 23, PRD-NOC-TOOLS N1) ───────────
// Menyatukan tiga hal yang sudah ada di database sejak Fase 13:
//   ODP (koordinat + kapasitas port) → OdpPort (port bernomor) → Subscription
//     → Customer (koordinat).
// Tidak ada model baru. Lapisan ini hanya merakit dan memproyeksikan.
//
// Okupansi ODP dihitung dari OdpPort yang benar-benar terpakai, BUKAN dari
// kolom portUsed — kolom itu turunan yang direkap engine, dan peta tidak boleh
// jadi sumber kebenaran kedua.

export type OccupancyLevel = "FREE" | "MODERATE" | "TIGHT" | "FULL";

export interface MapOdp {
  id: string;
  code: string;
  latitude: number;
  longitude: number;
  capacity: number;
  used: number;
  occupancy: OccupancyLevel;
  opticPowerDbm: number | null;
  siteName: string | null;
  ponLabel: string | null;
  parentId: string | null;
  status: string;
}

export interface MapCustomer {
  id: string;
  subscriptionId: string;
  serviceNumber: string;
  customerName: string;
  latitude: number;
  longitude: number;
  status: string; // status langganan: ACTIVE|ISOLATED|SUSPENDED|...
  odpId: string | null;
  portNumber: number | null;
}

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface NetworkMapData {
  odps: MapOdp[];
  customers: MapCustomer[];
  /** Garis ODP anak → ODP induk (kaskade). */
  cascades: { fromId: string; toId: string }[];
  bounds: MapBounds | null;
  /** Titik yang tidak bisa dipetakan karena koordinatnya kosong. */
  missingCoordinates: { odps: number; customers: number };
}

export function occupancyOf(used: number, capacity: number): OccupancyLevel {
  if (capacity <= 0) return "FULL";
  const ratio = used / capacity;
  if (ratio >= 1) return "FULL";
  if (ratio >= 0.8) return "TIGHT";
  if (ratio >= 0.5) return "MODERATE";
  return "FREE";
}

export const OCCUPANCY_LABEL: Record<OccupancyLevel, string> = {
  FREE: "Longgar",
  MODERATE: "Sedang",
  TIGHT: "Hampir penuh",
  FULL: "Penuh",
};

export const OCCUPANCY_COLOR: Record<OccupancyLevel, string> = {
  FREE: "#16a34a",
  MODERATE: "#ca8a04",
  TIGHT: "#ea580c",
  FULL: "#dc2626",
};

export const SUBSCRIPTION_COLOR: Record<string, string> = {
  ACTIVE: "#0284c7",
  ISOLATED: "#dc2626",
  SUSPENDED: "#a855f7",
  TERMINATED: "#94a3b8",
  DRAFT: "#94a3b8",
};

export interface MapFilter {
  siteId?: string | null;
  oltId?: string | null;
  /** Hanya tampilkan ODP dengan okupansi minimal ini. */
  minOccupancy?: OccupancyLevel | null;
  /** Hanya tampilkan pelanggan berstatus ini. */
  subscriptionStatus?: string | null;
}

const OCCUPANCY_ORDER: OccupancyLevel[] = ["FREE", "MODERATE", "TIGHT", "FULL"];

export async function loadNetworkMap(filter: MapFilter = {}): Promise<NetworkMapData> {
  const odpRows = await db.odp.findMany({
    where: {
      ...(filter.siteId ? { siteId: filter.siteId } : {}),
      ...(filter.oltId ? { ponPort: { oltId: filter.oltId } } : {}),
    },
    include: {
      site: { select: { name: true } },
      ponPort: { select: { label: true } },
      ports: {
        select: {
          portNumber: true,
          status: true,
          subscriptionId: true,
          subscription: {
            select: {
              id: true,
              serviceNumber: true,
              status: true,
              customer: {
                select: { id: true, name: true, latitude: true, longitude: true },
              },
            },
          },
        },
      },
    },
  });

  const odps: MapOdp[] = [];
  const customers: MapCustomer[] = [];
  let missingOdp = 0;
  let missingCustomer = 0;

  for (const odp of odpRows) {
    // Okupansi dari port nyata, bukan dari kolom turunan.
    const used = odp.ports.filter((p) => p.status === "USED").length;
    const occupancy = occupancyOf(used, odp.portCapacity);

    if (filter.minOccupancy) {
      const min = OCCUPANCY_ORDER.indexOf(filter.minOccupancy);
      if (OCCUPANCY_ORDER.indexOf(occupancy) < min) continue;
    }

    if (odp.latitude === null || odp.longitude === null) {
      missingOdp++;
    } else {
      odps.push({
        id: odp.id,
        code: odp.code,
        latitude: odp.latitude,
        longitude: odp.longitude,
        capacity: odp.portCapacity,
        used,
        occupancy,
        opticPowerDbm: odp.opticPowerDbm ?? null,
        siteName: odp.site?.name ?? null,
        ponLabel: odp.ponPort?.label ?? null,
        parentId: odp.parentId,
        status: odp.status,
      });
    }

    for (const port of odp.ports) {
      const sub = port.subscription;
      if (!sub) continue;
      if (filter.subscriptionStatus && sub.status !== filter.subscriptionStatus) continue;
      // Pelanggan tanpa koordinat sendiri diwarisi koordinat ODP-nya, sehingga
      // tetap terlihat di peta alih-alih hilang diam-diam.
      const lat = sub.customer.latitude ?? odp.latitude;
      const lng = sub.customer.longitude ?? odp.longitude;
      if (lat === null || lng === null) {
        missingCustomer++;
        continue;
      }
      if (sub.customer.latitude === null || sub.customer.longitude === null) {
        missingCustomer++;
      }
      customers.push({
        id: sub.customer.id,
        subscriptionId: sub.id,
        serviceNumber: sub.serviceNumber,
        customerName: sub.customer.name,
        latitude: lat,
        longitude: lng,
        status: sub.status,
        odpId: odp.id,
        portNumber: port.portNumber,
      });
    }
  }

  const visible = new Set(odps.map((o) => o.id));
  const cascades = odps
    .filter((o) => o.parentId && visible.has(o.parentId))
    .map((o) => ({ fromId: o.id, toId: o.parentId! }));

  const lats = [...odps.map((o) => o.latitude), ...customers.map((c) => c.latitude)];
  const lngs = [...odps.map((o) => o.longitude), ...customers.map((c) => c.longitude)];
  const bounds: MapBounds | null = lats.length
    ? {
        minLat: Math.min(...lats),
        maxLat: Math.max(...lats),
        minLng: Math.min(...lngs),
        maxLng: Math.max(...lngs),
      }
    : null;

  return {
    odps,
    customers,
    cascades,
    bounds,
    missingCoordinates: { odps: missingOdp, customers: missingCustomer },
  };
}

/**
 * Memproyeksikan koordinat bumi ke bidang gambar.
 *
 * Proyeksi equirectangular dengan koreksi cos(lat) pada sumbu bujur. Untuk
 * cakupan satu kota jarak antar-titiknya cukup akurat; ini BUKAN pengganti
 * peta bertingkat, hanya penempatan relatif yang jujur.
 */
export function projector(bounds: MapBounds, width: number, height: number, pad = 24) {
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 1e-6);
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 1e-6);
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const lngScale = Math.cos((midLat * Math.PI) / 180) || 1;

  // Skala tunggal agar bentuk tidak melar — sumbu terpanjang yang menentukan.
  const usableW = width - pad * 2;
  const usableH = height - pad * 2;
  const scale = Math.min(usableW / (lngSpan * lngScale), usableH / latSpan);
  const offsetX = (usableW - lngSpan * lngScale * scale) / 2;
  const offsetY = (usableH - latSpan * scale) / 2;

  return (lat: number, lng: number) => ({
    x: pad + offsetX + (lng - bounds.minLng) * lngScale * scale,
    // Lintang naik ke utara, sumbu Y layar naik ke bawah.
    y: pad + offsetY + (bounds.maxLat - lat) * scale,
  });
}
