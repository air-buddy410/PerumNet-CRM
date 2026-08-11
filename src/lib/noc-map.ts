import { db } from "@/lib/db";
import { routeLengthMeters } from "@/lib/ftth-point-type";

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
  /// Fase 38 — MS/ODC dan ODP berbagi tabel; peran inilah yang membedakan
  /// ikonnya di peta. Kaskadenya tetap ditentukan parentId.
  role: string; // MS | ODP
}

/// Status sambungan menurut router, BUKAN menurut status langganan.
/// UNKNOWN sengaja dibedakan dari OFFLINE: "tidak ada datanya" tidak sama
/// dengan "diketahui mati". Menyamakan keduanya membuat peta menuduh
/// pelanggan yang sebenarnya belum pernah tertarik datanya.
export type LinkStatus = "ONLINE" | "OFFLINE" | "DISABLED" | "UNKNOWN";

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
  // ── Fase 37b: keadaan sambungan langsung dari router ──────────
  pppoeUsername: string | null;
  linkStatus: LinkStatus;
  /// Kapan terakhir terlihat online — dasar "offline sejak" di UI.
  lastSeenAt: string | null;
  routerId: string | null;
  routerName: string | null;
}

/// Lokasi fisik: POP dan mini-POP (Fase 38). Bukan simpul distribusi — tidak
/// punya port maupun okupansi — jadi sengaja dipisahkan dari MapOdp alih-alih
/// dipaksa masuk bentuk yang sama.
export interface MapSite {
  id: string;
  code: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  status: string;
}

/// Rute kabel (Fase 39) — LAPISAN VISUAL. Panjangnya perkiraan dari geometri
/// gambar tangan, bukan panjang kabel sebenarnya, dan tidak dipakai menghitung
/// apa pun.
export interface MapRoute {
  id: string;
  name: string;
  routeType: string;
  coordinates: [number, number][];
  lengthMeters: number;
}

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface NetworkMapData {
  odps: MapOdp[];
  sites: MapSite[];
  routes: MapRoute[];
  customers: MapCustomer[];
  /** Garis ODP anak → ODP induk (kaskade). */
  cascades: { fromId: string; toId: string }[];
  bounds: MapBounds | null;
  /** Titik yang tidak bisa dipetakan karena koordinatnya kosong. */
  missingCoordinates: { odps: number; customers: number };
  // ── Fase 37b ──────────────────────────────────────────────────
  /** Rekap status sambungan pada titik yang TAMPIL di peta. */
  linkCounts: Record<LinkStatus, number>;
  /** Router yang bisa dipilih sebagai penyaring, beserta waktu tarik terakhir. */
  routers: { id: string; name: string; lastPolledAt: string | null }[];
  /**
   * Penarikan data router terakhir yang diketahui. Ditampilkan supaya orang
   * tahu peta ini menggambarkan keadaan KAPAN — peta status tanpa keterangan
   * waktu adalah peta yang menyesatkan saat poller-nya mati.
   */
  lastSyncedAt: string | null;
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
  /// Fase 37b — saring pelanggan menurut router yang melayaninya.
  /// ODP tidak ikut disaring: topologi tidak berubah karena pilihan router.
  routerId?: string | null;
  /// Saring menurut keadaan sambungan langsung (mis. hanya yang offline).
  linkStatus?: LinkStatus | null;
}

/**
 * Keadaan sambungan sebuah langganan menurut sesi router terakhir.
 *
 * Tidak adanya sesi menghasilkan UNKNOWN, bukan OFFLINE. Bedanya penting:
 * langganan yang belum pernah tertarik datanya — misalnya karena routernya
 * belum didaftarkan — bukan pelanggan yang jaringannya mati. Menyamakan
 * keduanya membuat hitungan "sekian pelanggan offline" jadi tuduhan palsu.
 */
export function linkStatusOf(session: { status: string } | null | undefined): LinkStatus {
  if (!session) return "UNKNOWN";
  if (session.status === "ONLINE" || session.status === "OFFLINE" || session.status === "DISABLED") {
    return session.status;
  }
  return "UNKNOWN";
}

/** Rekap kosong — dipakai sebagai titik awal penghitungan. */
export function emptyLinkCounts(): Record<LinkStatus, number> {
  return { ONLINE: 0, OFFLINE: 0, DISABLED: 0, UNKNOWN: 0 };
}

const OCCUPANCY_ORDER: OccupancyLevel[] = ["FREE", "MODERATE", "TIGHT", "FULL"];

export async function loadNetworkMap(filter: MapFilter = {}): Promise<NetworkMapData> {
  // Keadaan sambungan ditarik sekali lalu diindeks per langganan. Sesi yang
  // belum tercocokkan ke langganan (username tak dikenal) memang tidak bisa
  // dipetakan — titiknya tidak diketahui — jadi tidak ikut diambil.
  const [sessionRows, routerRows] = await Promise.all([
    db.pppoeSession.findMany({
      where: { subscriptionId: { not: null } },
      select: {
        subscriptionId: true,
        username: true,
        status: true,
        lastSeenAt: true,
        routerId: true,
        router: { select: { networkDevice: { select: { hostname: true } } } },
      },
    }),
    db.mikrotikRouter.findMany({
      select: {
        id: true,
        lastPolledAt: true,
        networkDevice: { select: { hostname: true } },
      },
    }),
  ]);
  const sessionOf = new Map(sessionRows.map((r) => [r.subscriptionId!, r]));

  const routeRows = await db.fiberRoute.findMany({
    where: filter.siteId ? { siteId: filter.siteId } : {},
    select: { id: true, name: true, routeType: true, geometry: true },
    orderBy: { name: "asc" },
  });

  const siteRows = await db.networkSite.findMany({
    where: {
      latitude: { not: null },
      longitude: { not: null },
      type: { in: ["POP", "MINI_POP"] },
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
  });

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
              pppoeUsername: true,
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
        role: odp.role,
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
      const session = sessionOf.get(sub.id) ?? null;
      const linkStatus = linkStatusOf(session);
      if (filter.routerId && session?.routerId !== filter.routerId) continue;
      if (filter.linkStatus && linkStatus !== filter.linkStatus) continue;

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
        pppoeUsername: session?.username ?? sub.pppoeUsername ?? null,
        linkStatus,
        lastSeenAt: session?.lastSeenAt?.toISOString() ?? null,
        routerId: session?.routerId ?? null,
        routerName: session?.router.networkDevice.hostname ?? null,
      });
    }
  }

  const visible = new Set(odps.map((o) => o.id));
  const cascades = odps
    .filter((o) => o.parentId && visible.has(o.parentId))
    .map((o) => ({ fromId: o.id, toId: o.parentId! }));

  const routes: MapRoute[] = routeRows.map((r) => {
    const coordinates = (r.geometry as unknown as [number, number][]) ?? [];
    return {
      id: r.id,
      name: r.name,
      routeType: r.routeType,
      coordinates,
      lengthMeters: routeLengthMeters(coordinates),
    };
  });

  const sites: MapSite[] = siteRows.map((st) => ({
    id: st.id,
    code: st.siteCode,
    name: st.name,
    type: st.type,
    latitude: st.latitude!,
    longitude: st.longitude!,
    status: st.status,
  }));

  // POP ikut menentukan batas peta; kalau tidak, peta bisa memotong POP yang
  // berada di pinggir wilayah layanan.
  const lats = [
    ...odps.map((o) => o.latitude),
    ...customers.map((c) => c.latitude),
    ...sites.map((s) => s.latitude),
  ];
  const lngs = [
    ...odps.map((o) => o.longitude),
    ...customers.map((c) => c.longitude),
    ...sites.map((s) => s.longitude),
  ];
  const bounds: MapBounds | null = lats.length
    ? {
        minLat: Math.min(...lats),
        maxLat: Math.max(...lats),
        minLng: Math.min(...lngs),
        maxLng: Math.max(...lngs),
      }
    : null;

  // Rekap dihitung dari titik yang BENAR-BENAR tampil, bukan dari seluruh
  // tabel — supaya angka di layar selalu cocok dengan yang bisa diklik.
  const linkCounts = emptyLinkCounts();
  for (const c of customers) linkCounts[c.linkStatus] += 1;

  const routers = routerRows.map((r) => ({
    id: r.id,
    name: r.networkDevice.hostname,
    lastPolledAt: r.lastPolledAt?.toISOString() ?? null,
  }));
  const polled = routerRows
    .map((r) => r.lastPolledAt)
    .filter((d): d is Date => d !== null)
    .map((d) => d.getTime());
  const lastSyncedAt = polled.length ? new Date(Math.max(...polled)).toISOString() : null;

  return {
    odps,
    sites,
    routes,
    customers,
    cascades,
    bounds,
    missingCoordinates: { odps: missingOdp, customers: missingCustomer },
    linkCounts,
    routers,
    lastSyncedAt,
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
