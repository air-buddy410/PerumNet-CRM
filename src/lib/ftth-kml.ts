import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/constants";
import {
  parseKml,
  buildKml,
  type KmlPlacemark,
  type KmlExportPoint,
  type KmlExportLine,
} from "@/lib/kml";
import {
  inferPointType,
  notImportableReason,
  inferRouteType,
  routeLengthMeters,
  type ImportPointType,
  type RouteType,
} from "@/lib/ftth-point-type";
import { occupancyOf, OCCUPANCY_LABEL, type OccupancyLevel } from "@/lib/noc-map";
import type { CurrentUser } from "@/lib/rbac";

// ── Impor/Ekspor KML untuk ODP (Fase 26, PRD-NOC-TOOLS N4) ──────
//
// Aturan wajib dari PRD: impor SELALU lewat pratinjau lebih dulu — berapa titik
// cocok dengan ODP yang ada, berapa akan dibuat baru, berapa ditolak — sebelum
// apa pun disimpan. Berkas survei lapangan sering kotor, dan menimpa koordinat
// ODP produksi tanpa dilihat dulu adalah kesalahan yang mahal.

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

/**
 * Tindakan yang akan diambil untuk sebuah titik.
 *
 * Kosakata ini menegakkan keputusan D5 secara langsung: impor hanya MENGISI
 * yang kosong, tidak pernah menimpa. Titik yang sudah punya koordinat
 * dilaporkan sebagai KEEP berikut jarak selisihnya — perbedaan tetap terlihat
 * tanpa ada yang diubah diam-diam.
 */
export type KmlImportAction = "NEW" | "FILL" | "KEEP" | "DUPLICATE" | "SKIP";

export interface KmlImportRow {
  name: string;
  latitude: number;
  longitude: number;
  /** Folder asal titik di dalam KML — dasar penebakan jenis (Fase 35). */
  folder: string | null;
  /** Jenis titik hasil tebakan folder; UNKNOWN berarti petugas harus memilih. */
  type: ImportPointType;
  action: KmlImportAction;
  /** Alasan bila tindakannya SKIP atau KEEP. */
  note: string | null;
  /** Id entitas yang cocok — Odp untuk MS/ODP, NetworkSite untuk POP. */
  targetId: string | null;
  /** Koordinat yang sudah tersimpan, supaya selisihnya terlihat. */
  currentLatitude: number | null;
  currentLongitude: number | null;
  moveMeters: number | null;
}

/// Baris rute kabel pada pratinjau (Fase 39).
export interface KmlRouteRow {
  name: string;
  folder: string | null;
  routeType: RouteType;
  pointCount: number;
  lengthMeters: number;
  /** NEW = belum ada · KEEP = sudah ada, tidak ditimpa · DUPLICATE = ganda di berkas */
  action: "NEW" | "KEEP" | "DUPLICATE";
  coordinates: [number, number][];
}

export interface KmlImportPreview {
  rows: KmlImportRow[];
  routes: KmlRouteRow[];
  rejected: { raw: string; reason: string }[];
  counts: {
    new: number;
    fill: number;
    keep: number;
    duplicate: number;
    skip: number;
    rejected: number;
  };
  routeCounts: { new: number; keep: number; duplicate: number };
}

/** Jarak kasar antar dua koordinat (haversine), untuk menunjukkan seberapa jauh titik bergeser. */
function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

export interface PreviewOptions {
  /** Jenis yang dipakai untuk titik yang jenisnya tidak tertebak dari folder. */
  unknownAs?: ImportPointType | null;
}

export async function previewKmlImport(
  xml: string,
  options: PreviewOptions = {}
): Promise<KmlImportPreview> {
  const { placemarks, lines, rejected } = parseKml(xml);

  // Seluruh calon target diambil sekali, bukan per baris — berkas survei bisa
  // memuat ratusan titik dan kueri per baris akan menyiksa database.
  const [odps, sites, existingRoutes] = await Promise.all([
    db.odp.findMany({ select: { id: true, code: true, latitude: true, longitude: true } }),
    db.networkSite.findMany({
      select: { id: true, siteCode: true, name: true, latitude: true, longitude: true },
    }),
    db.fiberRoute.findMany({ select: { name: true } }),
  ]);
  const routeNames = new Set(existingRoutes.map((r) => r.name));
  const odpByCode = new Map(odps.map((o) => [o.code, o]));
  const siteByKey = new Map<string, (typeof sites)[number]>();
  for (const st of sites) {
    siteByKey.set(st.siteCode, st);
    if (!siteByKey.has(st.name)) siteByKey.set(st.name, st);
  }

  const rows: KmlImportRow[] = [];
  const seen = new Set<string>();

  for (const p of placemarks) {
    const inferred = inferPointType(p.folder);
    const type =
      inferred === "UNKNOWN" && options.unknownAs ? options.unknownAs : inferred;

    const base = {
      name: p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      folder: p.folder,
      type,
      targetId: null as string | null,
      currentLatitude: null as number | null,
      currentLongitude: null as number | null,
      moveMeters: null as number | null,
    };

    if (seen.has(p.name)) {
      rows.push({ ...base, action: "DUPLICATE", note: "Nama ganda di dalam berkas ini." });
      continue;
    }
    seen.add(p.name);

    const blocked = notImportableReason(type);
    if (blocked) {
      rows.push({ ...base, action: "SKIP", note: blocked });
      continue;
    }

    const existing = type === "POP" ? siteByKey.get(p.name) : odpByCode.get(p.name);
    if (!existing) {
      rows.push({ ...base, action: "NEW", note: null });
      continue;
    }

    const hasCoords = existing.latitude !== null && existing.longitude !== null;
    if (!hasCoords) {
      rows.push({ ...base, action: "FILL", targetId: existing.id, note: null });
      continue;
    }

    // D5: sudah berkoordinat → TIDAK disentuh. Selisihnya tetap dilaporkan,
    // karena perbedaan besar antara berkas dan data tersimpan adalah kabar
    // penting meskipun tidak ada yang diubah.
    const moved = distanceMeters(
      existing.latitude!,
      existing.longitude!,
      p.latitude,
      p.longitude
    );
    rows.push({
      ...base,
      action: "KEEP",
      targetId: existing.id,
      currentLatitude: existing.latitude,
      currentLongitude: existing.longitude,
      moveMeters: moved,
      note: `Sudah berkoordinat — tidak diubah. Titik di berkas berjarak ${moved} m.`,
    });
  }

  // Rute mengikuti aturan yang sama dengan titik: yang sudah ada TIDAK
  // ditimpa. Geometri hasil gambar tangan tidak boleh menggantikan yang
  // sudah diperiksa orang.
  const routes: KmlRouteRow[] = [];
  const seenRoutes = new Set<string>();
  for (const l of lines) {
    const base = {
      name: l.name,
      folder: l.folder,
      routeType: inferRouteType(l.folder),
      pointCount: l.coordinates.length,
      lengthMeters: routeLengthMeters(l.coordinates),
      coordinates: l.coordinates,
    };
    if (seenRoutes.has(l.name)) {
      routes.push({ ...base, action: "DUPLICATE" });
      continue;
    }
    seenRoutes.add(l.name);
    routes.push({ ...base, action: routeNames.has(l.name) ? "KEEP" : "NEW" });
  }

  const count = (a: KmlImportAction) => rows.filter((r) => r.action === a).length;
  const routeCount = (a: KmlRouteRow["action"]) => routes.filter((r) => r.action === a).length;
  return {
    rows,
    routes,
    rejected,
    counts: {
      new: count("NEW"),
      fill: count("FILL"),
      keep: count("KEEP"),
      duplicate: count("DUPLICATE"),
      skip: count("SKIP"),
      rejected: rejected.length,
    },
    routeCounts: {
      new: routeCount("NEW"),
      keep: routeCount("KEEP"),
      duplicate: routeCount("DUPLICATE"),
    },
  };
}

export interface KmlImportOptions extends PreviewOptions {
  /** Buat entitas baru untuk titik yang belum ada. */
  createMissing: boolean;
  /** Kapasitas port untuk MS/ODP baru — KML tidak memuat informasi ini. */
  defaultCapacity: number;
  siteId?: string | null;
}

export async function applyKmlImport(
  user: CurrentUser,
  xml: string,
  options: KmlImportOptions
): Promise<Result<{ created: number; filled: number; skipped: number; routes: number }>> {
  if (!user.permissions.has(PERMISSIONS.FTTH_MANAGE)) {
    return { ok: false, error: "Anda tidak memiliki izin mengubah data FTTH." };
  }
  if (options.createMissing) {
    if (!Number.isInteger(options.defaultCapacity) || options.defaultCapacity <= 0) {
      return { ok: false, error: "Kapasitas port untuk titik baru harus lebih dari nol." };
    }
  }

  const preview = await previewKmlImport(xml, { unknownAs: options.unknownAs });
  if (!preview.rows.length) {
    return { ok: false, error: "Tidak ada titik yang bisa diimpor dari berkas ini." };
  }

  let created = 0;
  let filled = 0;
  let skipped = 0;
  let routesCreated = 0;

  try {
    await db.$transaction(async (prisma) => {
      for (const row of preview.rows) {
        // KEEP, DUPLICATE, dan SKIP sama-sama tidak menyentuh apa pun.
        if (row.action !== "NEW" && row.action !== "FILL") {
          skipped++;
          continue;
        }

        if (row.action === "FILL" && row.targetId) {
          // Hanya koordinat yang diisi. Kapasitas, port, dan relasi TIDAK
          // pernah disentuh impor peta — itu data operasional.
          if (row.type === "POP") {
            await prisma.networkSite.update({
              where: { id: row.targetId },
              data: { latitude: row.latitude, longitude: row.longitude },
            });
          } else {
            await prisma.odp.update({
              where: { id: row.targetId },
              data: { latitude: row.latitude, longitude: row.longitude },
            });
          }
          filled++;
          continue;
        }

        if (!options.createMissing) {
          skipped++;
          continue;
        }

        if (row.type === "POP") {
          await prisma.networkSite.create({
            data: {
              siteCode: row.name,
              name: row.name,
              type: "POP",
              latitude: row.latitude,
              longitude: row.longitude,
              status: "PLANNED", // hasil survei belum tentu terpasang
            },
          });
        } else {
          await prisma.odp.create({
            data: {
              code: row.name,
              role: row.type === "MS" ? "MS" : "ODP",
              latitude: row.latitude,
              longitude: row.longitude,
              portCapacity: options.defaultCapacity,
              siteId: options.siteId || null,
              status: "PLANNED",
            },
          });
        }
        created++;
      }

      for (const route of preview.routes) {
        if (route.action !== "NEW") continue;
        await prisma.fiberRoute.create({
          data: {
            name: route.name,
            routeType: route.routeType,
            geometry: route.coordinates as unknown as object,
            source: "KML_IMPORT",
            siteId: options.siteId || null,
          },
        });
        routesCreated++;
      }
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Impor KML gagal." };
  }

  await logAudit({
    userId: user.id,
    action: "FTTH_KML_IMPORT",
    module: "noc",
    entityType: "Odp",
    entityId: "-",
    description:
      `Impor KML/KMZ: ${created} titik baru (status PLANNED), ${filled} koordinat diisi, ` +
      `${skipped} dilewati, ${routesCreated} rute kabel, ${preview.rejected.length} ditolak. ` +
      `Koordinat dan geometri yang sudah tersimpan tidak ditimpa.`,
  });
  return { ok: true, id: "-", data: { created, filled, skipped, routes: routesCreated } };
}

/// Nama folder ekspor per jenis rute — dipilih agar tertebak kembali oleh
/// inferRouteType() saat berkasnya diimpor ulang.
const ROUTE_FOLDER: Record<string, string> = {
  FEEDER: "Rute Feeder",
  DISTRIBUTION: "Rute Distribusi",
  DROP: "Rute Drop Core",
  OTHER: "Rute Lainnya",
};

/// Gaya penanda untuk POP — dibedakan dari warna okupansi ODP.
const SITE_STYLE = { id: "pop-site", colorAabbggrr: "ffd08b2b" };

const OCCUPANCY_STYLE: Record<OccupancyLevel, { id: string; colorAabbggrr: string }> = {
  // KML memakai urutan aabbggrr, bukan rrggbb.
  FREE: { id: "odp-free", colorAabbggrr: "ff4ade16" },
  MODERATE: { id: "odp-moderate", colorAabbggrr: "ff04a8ca" },
  TIGHT: { id: "odp-tight", colorAabbggrr: "ff0058ea" },
  FULL: { id: "odp-full", colorAabbggrr: "ff2626dc" },
};

/** Menyusun KML seluruh ODP berkoordinat, diwarnai menurut okupansi. */
/**
 * Ekspor seluruh titik FTTH ke KML: POP, MS/ODC, dan ODP.
 *
 * Titik dikelompokkan ke dalam folder bernama sama dengan yang dikenali
 * importir. Ini membuat berkasnya bisa PULANG-PERGI: hasil ekspor yang
 * diimpor kembali dikenali sebagai jenis yang sama, bukan menjadi
 * "belum ditentukan" dan harus ditebak ulang petugas.
 */
export async function exportFtthKml(siteId?: string | null): Promise<string> {
  const [odps, sites, routes] = await Promise.all([
    db.odp.findMany({
      where: {
        latitude: { not: null },
        longitude: { not: null },
        ...(siteId ? { siteId } : {}),
      },
      include: {
        site: { select: { name: true } },
        ports: { select: { status: true } },
      },
      orderBy: { code: "asc" },
    }),
    db.networkSite.findMany({
      where: {
        latitude: { not: null },
        longitude: { not: null },
        type: { in: ["POP", "MINI_POP"] },
        ...(siteId ? { id: siteId } : {}),
      },
      orderBy: { siteCode: "asc" },
    }),
    db.fiberRoute.findMany({
      where: siteId ? { siteId } : {},
      orderBy: { name: "asc" },
    }),
  ]);

  const points: KmlExportPoint[] = [];

  for (const st of sites) {
    points.push({
      name: st.siteCode,
      latitude: st.latitude!,
      longitude: st.longitude!,
      folder: "POP",
      description: [st.name, st.address, `Status: ${st.status}`].filter(Boolean).join(" · "),
      styleId: SITE_STYLE.id,
    });
  }

  for (const o of odps) {
    const used = o.ports.filter((p) => p.status === "USED").length;
    const occupancy = occupancyOf(used, o.portCapacity);
    points.push({
      name: o.code,
      latitude: o.latitude!,
      longitude: o.longitude!,
      // Folder mengikuti peran, sehingga MS kembali sebagai MS saat diimpor.
      folder: o.role === "MS" ? "MS" : "ODP",
      description: [
        `Port: ${used}/${o.portCapacity} (${OCCUPANCY_LABEL[occupancy]})`,
        o.site?.name ? `Site: ${o.site.name}` : null,
        o.opticPowerDbm !== null ? `Optic: ${o.opticPowerDbm} dBm` : null,
        `Status: ${o.status}`,
      ]
        .filter(Boolean)
        .join(" · "),
      styleId: OCCUPANCY_STYLE[occupancy].id,
    });
  }

  // Rute diekspor ke folder sesuai jenisnya, sehingga impor ulang mengenali
  // feeder tetap sebagai feeder.
  const lines: KmlExportLine[] = routes.map((r) => {
    const coordinates = (r.geometry as unknown as [number, number][]) ?? [];
    return {
      name: r.name,
      folder: ROUTE_FOLDER[r.routeType] ?? "Rute Lainnya",
      description: `Perkiraan panjang: ${routeLengthMeters(coordinates)} m (dari geometri, bukan ukuran lapangan)`,
      coordinates,
    };
  });

  return buildKml(
    "PerumNet FTTH",
    points,
    [...Object.values(OCCUPANCY_STYLE), SITE_STYLE],
    lines
  );
}

/** Nama lama dipertahankan supaya pemanggil yang ada tidak putus. */
export const exportOdpKml = exportFtthKml;
