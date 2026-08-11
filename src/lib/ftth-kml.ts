import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/constants";
import { parseKml, buildKml, type KmlPlacemark } from "@/lib/kml";
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

export interface KmlImportRow {
  name: string;
  latitude: number;
  longitude: number;
  /**
   * Folder asal titik ini di dalam KML (Fase 35).
   *
   * Ditampilkan karena importer ini masih menyasar ODP SAJA. Berkas survei
   * lengkap memuat POP dan MS di folder terpisah, dan tanpa keterangan folder
   * petugas tidak punya cara melihat bahwa "SPOP Abang" akan tersimpan sebagai
   * ODP. Impor multi-jenis menyusul di Fase 36.
   */
  folder: string | null;
  /** MATCH = kode cocok ODP yang ada · NEW = belum ada · DUPLICATE = ganda di berkas */
  action: "MATCH" | "NEW" | "DUPLICATE";
  odpId: string | null;
  /** Koordinat lama, supaya perubahannya terlihat sebelum disetujui. */
  currentLatitude: number | null;
  currentLongitude: number | null;
  moveMeters: number | null;
}

export interface KmlImportPreview {
  rows: KmlImportRow[];
  rejected: { raw: string; reason: string }[];
  counts: { match: number; new: number; duplicate: number; rejected: number };
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

export async function previewKmlImport(xml: string): Promise<KmlImportPreview> {
  const { placemarks, rejected } = parseKml(xml);

  const names = placemarks.map((p) => p.name);
  const existing = names.length
    ? await db.odp.findMany({
        where: { code: { in: names } },
        select: { id: true, code: true, latitude: true, longitude: true },
      })
    : [];
  const byCode = new Map(existing.map((o) => [o.code, o]));

  const seen = new Set<string>();
  const rows: KmlImportRow[] = [];
  for (const p of placemarks) {
    if (seen.has(p.name)) {
      rows.push({
        name: p.name,
        latitude: p.latitude,
        longitude: p.longitude,
        folder: p.folder,
        action: "DUPLICATE",
        odpId: null,
        currentLatitude: null,
        currentLongitude: null,
        moveMeters: null,
      });
      continue;
    }
    seen.add(p.name);
    const odp = byCode.get(p.name);
    rows.push({
      name: p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      folder: p.folder,
      action: odp ? "MATCH" : "NEW",
      odpId: odp?.id ?? null,
      currentLatitude: odp?.latitude ?? null,
      currentLongitude: odp?.longitude ?? null,
      moveMeters:
        odp && odp.latitude !== null && odp.longitude !== null
          ? distanceMeters(odp.latitude, odp.longitude, p.latitude, p.longitude)
          : null,
    });
  }

  return {
    rows,
    rejected,
    counts: {
      match: rows.filter((r) => r.action === "MATCH").length,
      new: rows.filter((r) => r.action === "NEW").length,
      duplicate: rows.filter((r) => r.action === "DUPLICATE").length,
      rejected: rejected.length,
    },
  };
}

export interface KmlImportOptions {
  /** Buat ODP baru untuk titik yang kodenya belum ada. */
  createMissing: boolean;
  /** Kapasitas port untuk ODP baru — KML tidak memuat informasi ini. */
  defaultCapacity: number;
  siteId?: string | null;
}

export async function applyKmlImport(
  user: CurrentUser,
  xml: string,
  options: KmlImportOptions
): Promise<Result<{ updated: number; created: number; skipped: number }>> {
  if (!user.permissions.has(PERMISSIONS.FTTH_MANAGE)) {
    return { ok: false, error: "Anda tidak memiliki izin mengubah data FTTH." };
  }
  if (options.createMissing) {
    if (!Number.isInteger(options.defaultCapacity) || options.defaultCapacity <= 0) {
      return { ok: false, error: "Kapasitas port untuk ODP baru harus lebih dari nol." };
    }
  }

  const preview = await previewKmlImport(xml);
  if (!preview.rows.length) {
    return { ok: false, error: "Tidak ada titik yang bisa diimpor dari berkas ini." };
  }

  let updated = 0;
  let created = 0;
  let skipped = 0;

  try {
    await db.$transaction(async (prisma) => {
      for (const row of preview.rows) {
        if (row.action === "DUPLICATE") {
          skipped++;
          continue;
        }
        if (row.action === "MATCH" && row.odpId) {
          // Hanya koordinat yang disentuh. Kapasitas, port, dan relasi ODP
          // TIDAK pernah diubah oleh impor peta — itu data operasional.
          await prisma.odp.update({
            where: { id: row.odpId },
            data: { latitude: row.latitude, longitude: row.longitude },
          });
          updated++;
          continue;
        }
        if (!options.createMissing) {
          skipped++;
          continue;
        }
        await prisma.odp.create({
          data: {
            code: row.name,
            latitude: row.latitude,
            longitude: row.longitude,
            portCapacity: options.defaultCapacity,
            siteId: options.siteId || null,
            status: "PLANNED", // hasil survei belum tentu terpasang
          },
        });
        created++;
      }
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Impor KML gagal." };
  }

  await logAudit({
    userId: user.id,
    action: "ODP_KML_IMPORT",
    module: "noc",
    entityType: "Odp",
    entityId: "-",
    description: `Impor KML: ${updated} koordinat diperbarui, ${created} ODP baru (status PLANNED), ${skipped} dilewati, ${preview.rejected.length} ditolak`,
  });
  return { ok: true, id: "-", data: { updated, created, skipped } };
}

const OCCUPANCY_STYLE: Record<OccupancyLevel, { id: string; colorAabbggrr: string }> = {
  // KML memakai urutan aabbggrr, bukan rrggbb.
  FREE: { id: "odp-free", colorAabbggrr: "ff4ade16" },
  MODERATE: { id: "odp-moderate", colorAabbggrr: "ff04a8ca" },
  TIGHT: { id: "odp-tight", colorAabbggrr: "ff0058ea" },
  FULL: { id: "odp-full", colorAabbggrr: "ff2626dc" },
};

/** Menyusun KML seluruh ODP berkoordinat, diwarnai menurut okupansi. */
export async function exportOdpKml(siteId?: string | null): Promise<string> {
  const odps = await db.odp.findMany({
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
  });

  const points = odps.map((o) => {
    const used = o.ports.filter((p) => p.status === "USED").length;
    const occupancy = occupancyOf(used, o.portCapacity);
    return {
      name: o.code,
      latitude: o.latitude!,
      longitude: o.longitude!,
      description: [
        `Port: ${used}/${o.portCapacity} (${OCCUPANCY_LABEL[occupancy]})`,
        o.site?.name ? `Site: ${o.site.name}` : null,
        o.opticPowerDbm !== null ? `Optic: ${o.opticPowerDbm} dBm` : null,
        `Status: ${o.status}`,
      ]
        .filter(Boolean)
        .join(" · "),
      styleId: OCCUPANCY_STYLE[occupancy].id,
    };
  });

  return buildKml("PERUMNET — ODP", points, Object.values(OCCUPANCY_STYLE));
}
