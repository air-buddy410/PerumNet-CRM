// ── Penebakan jenis titik dari folder KML (Fase 36) ─────────────
// Modul MURNI.
//
// KMZ surveyor menata titik per folder: POP, MS, ODC, ODP, HOME PASS. Folder
// itulah petunjuk paling andal untuk menebak sebuah titik jenisnya apa —
// jauh lebih andal daripada menebak dari pola namanya, yang berbeda-beda
// antar surveyor.
//
// Tebakan ini SELALU bisa ditimpa petugas di layar pratinjau. Karena itu
// prinsipnya: kalau ragu, kembalikan UNKNOWN dan biarkan manusia memutuskan.
// Menebak dengan percaya diri lalu salah jauh lebih mahal daripada mengaku
// tidak tahu.

export type ImportPointType = "POP" | "MS" | "ODP" | "CUSTOMER" | "UNKNOWN";

/** Jenis yang benar-benar bisa diimpor lewat KMZ. */
export const IMPORTABLE_TYPES: ImportPointType[] = ["POP", "MS", "ODP"];

export const POINT_TYPE_LABEL: Record<ImportPointType, string> = {
  POP: "POP / Site",
  MS: "MS / ODC",
  ODP: "ODP",
  CUSTOMER: "Pelanggan",
  UNKNOWN: "Belum ditentukan",
};

/**
 * Kata kunci per jenis, diperiksa berurutan dari yang paling spesifik.
 *
 * Urutannya penting: "ODC" harus diperiksa sebelum "ODP" tidak masalah karena
 * keduanya berbeda, tetapi "DISTRIBUTION POINT" mengandung kata "POINT" yang
 * juga muncul pada istilah lain — jadi pencocokan dilakukan pada kata utuh
 * bila memungkinkan.
 */
const RULES: { type: ImportPointType; keywords: string[] }[] = [
  // Pelanggan didaftarkan supaya bisa DIKENALI lalu dilewati dengan pesan
  // yang jelas — bukan diam-diam masuk sebagai ODP.
  { type: "CUSTOMER", keywords: ["HOME PASS", "HOMEPASS", "PELANGGAN", "CUSTOMER", "CLIENT", "HP"] },
  { type: "MS", keywords: ["MS", "ODC", "MASTER SWITCH", "RUMAH KABEL", "RK"] },
  { type: "ODP", keywords: ["ODP", "DISPOINT", "DISTRIBUTION POINT", "DP"] },
  { type: "POP", keywords: ["POP", "SPOP", "BPOP", "SITE", "OLT"] },
];

function normalize(value: string): string {
  return value.toUpperCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Menebak jenis titik dari nama foldernya.
 *
 * Dicocokkan per KATA, bukan sebagai substring: folder "ODP KECICANG" cocok
 * dengan ODP, tetapi "GRUP" tidak boleh cocok dengan "RK" hanya karena
 * hurufnya kebetulan ada di dalamnya.
 */
export function inferPointType(folder: string | null | undefined): ImportPointType {
  if (!folder) return "UNKNOWN";
  const words = normalize(folder).split(" ").filter(Boolean);
  if (!words.length) return "UNKNOWN";
  const joined = words.join(" ");

  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (kw.includes(" ")) {
        if (joined.includes(kw)) return rule.type;
      } else if (words.includes(kw)) {
        return rule.type;
      }
    }
  }
  return "UNKNOWN";
}

export function isImportable(type: ImportPointType): boolean {
  return IMPORTABLE_TYPES.includes(type);
}

/** Alasan sebuah titik tidak bisa diimpor, atau null bila bisa. */
export function notImportableReason(type: ImportPointType): string | null {
  if (type === "CUSTOMER") {
    return "Titik pelanggan diinput manual, tidak lewat impor peta.";
  }
  if (type === "UNKNOWN") {
    return "Jenis titik belum ditentukan — pilih jenisnya sebelum menerapkan.";
  }
  return null;
}

// ── Jenis rute kabel (Fase 39) ──────────────────────────────────
// Sama seperti jenis titik, ditebak dari nama folder KML dan selalu bisa
// ditimpa. Yang tidak tertebak menjadi OTHER — bukan ditebak jadi salah satu,
// karena keliru menyebut drop core sebagai feeder menyesatkan teknisi yang
// membaca peta.

export type RouteType = "FEEDER" | "DISTRIBUTION" | "DROP" | "OTHER";

export const ROUTE_TYPE_LABEL: Record<RouteType, string> = {
  FEEDER: "Feeder",
  DISTRIBUTION: "Distribusi",
  DROP: "Drop core",
  OTHER: "Lainnya",
};

const ROUTE_RULES: { type: RouteType; keywords: string[] }[] = [
  { type: "DROP", keywords: ["DROP", "DROPCORE", "DROP CORE", "PRECON"] },
  { type: "DISTRIBUTION", keywords: ["DISTRIBUSI", "DISTRIBUTION", "DIST"] },
  { type: "FEEDER", keywords: ["FEEDER", "BACKBONE", "TRUNK"] },
];

export function inferRouteType(folder: string | null | undefined): RouteType {
  if (!folder) return "OTHER";
  const words = folder.toUpperCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim().split(" ");
  const joined = words.join(" ");
  for (const rule of ROUTE_RULES) {
    for (const kw of rule.keywords) {
      if (kw.includes(" ") ? joined.includes(kw) : words.includes(kw)) return rule.type;
    }
  }
  return "OTHER";
}

/**
 * Panjang perkiraan sebuah rute dalam meter.
 *
 * Sengaja DIHITUNG saat dibaca, bukan disimpan. Angka tersimpan cepat berubah
 * menjadi "sumber kebenaran" yang dipakai orang untuk menagih atau menghitung
 * rugi-rugi — padahal ini hanya jumlah jarak lurus antar simpul yang digambar
 * tangan surveyor, bukan panjang kabel sebenarnya.
 */
export function routeLengthMeters(coordinates: [number, number][]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const [lng1, lat1] = coordinates[i - 1];
    const [lng2, lat2] = coordinates[i];
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    total += 2 * R * Math.asin(Math.sqrt(s));
  }
  return Math.round(total);
}
