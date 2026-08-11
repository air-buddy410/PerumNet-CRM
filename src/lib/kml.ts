// ── KML (Fase 26, PRD-NOC-TOOLS N4) ─────────────────────────────
// Impor titik ODP hasil survei lapangan dan ekspor kembali untuk Google Earth.
//
// Ditulis tanpa pustaka XML: KML dari Google Earth/Maps punya bentuk yang
// konsisten, dan menambah dependensi parser XML ke sistem yang memegang data
// keuangan tidak sepadan untuk satu fitur ini.
//
// Prinsip yang dipegang: apa yang TIDAK bisa dibaca dilaporkan, bukan dibuang
// diam-diam. Berkas survei yang setengah rusak harus terlihat setengah rusak.
//
// KMZ (KML terkompresi ZIP) sengaja TIDAK didukung — Node tidak punya pembaca
// ZIP bawaan. Penggunanya diminta mengekstrak dulu; itu lebih jujur daripada
// menambah dependensi atau gagal dengan pesan membingungkan.

export interface KmlPlacemark {
  name: string;
  latitude: number;
  longitude: number;
  description: string | null;
  /**
   * Nama folder terdalam yang memuat placemark ini (Fase 35).
   *
   * KMZ dari surveyor hampir selalu menata titiknya per folder — POP, ODC,
   * ODP, HOME PASS — dan folder itulah petunjuk paling andal untuk menebak
   * jenis sebuah titik. Bernilai null bila berada di luar folder mana pun.
   */
  folder: string | null;
}

/** Rute kabel dari KML (Fase 35). Disimpan sebagai lapisan visual — D1(b). */
export interface KmlLine {
  name: string;
  folder: string | null;
  /** Urutan titik [bujur, lintang], mengikuti urutan asli KML. */
  coordinates: [number, number][];
}

export interface KmlParseResult {
  placemarks: KmlPlacemark[];
  /** Garis (LineString) — rute kabel feeder/distribusi/drop. */
  lines: KmlLine[];
  /** Placemark yang ditemukan tapi tidak bisa dipakai, beserta alasannya. */
  rejected: { raw: string; reason: string }[];
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

function firstTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return null;
  const inner = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return decodeEntities(inner).trim();
}

/**
 * Nama sebuah folder: <name> pertama setelah tag <Folder>, sebelum folder
 * atau placemark berikutnya. Folder tanpa nama menghasilkan null.
 */
function folderNameAfter(xml: string, from: number): string | null {
  const rest = xml.slice(from, from + 4000);
  const stop = rest.search(/<Folder\b|<Placemark\b/i);
  return firstTag(stop === -1 ? rest : rest.slice(0, stop), "name");
}

/** Menguraikan daftar koordinat KML menjadi pasangan [bujur, lintang]. */
function parseCoordinateList(raw: string): [number, number][] {
  const out: [number, number][] = [];
  for (const token of raw.split(/\s+/)) {
    if (!token) continue;
    const parts = token.split(",");
    const lng = Number(parts[0]);
    const lat = Number(parts[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    out.push([lng, lat]);
  }
  return out;
}

export function parseKml(xml: string): KmlParseResult {
  const placemarks: KmlPlacemark[] = [];
  const lines: KmlLine[] = [];
  const rejected: { raw: string; reason: string }[] = [];

  // Dokumen ditelusuri berurutan sambil menahan tumpukan folder, sehingga
  // setiap placemark tahu ia berada di dalam folder mana. Pendekatan regex
  // global yang lama tidak bisa melakukannya karena kehilangan urutan.
  const walker = /<Folder\b[^>]*>|<\/Folder>|<Placemark\b[\s\S]*?<\/Placemark>/gi;
  const stack: (string | null)[] = [];
  let m: RegExpExecArray | null;

  while ((m = walker.exec(xml)) !== null) {
    const token = m[0];

    if (/^<Folder/i.test(token)) {
      stack.push(folderNameAfter(xml, m.index + token.length));
      continue;
    }
    if (/^<\/Folder/i.test(token)) {
      stack.pop();
      continue;
    }

    const block = token;
    const folder = stack.length ? stack[stack.length - 1] : null;
    const short = block.replace(/\s+/g, " ").slice(0, 120);
    const name = firstTag(block, "name");
    if (!name) {
      rejected.push({ raw: short, reason: "Placemark tanpa <name>." });
      continue;
    }
    const coords = firstTag(block, "coordinates");
    if (!coords) {
      rejected.push({ raw: short, reason: `"${name}" tidak punya <coordinates>.` });
      continue;
    }

    // Garis dan titik dibedakan dari geometrinya, bukan dari jumlah koordinat:
    // LineString bersimpul satu tetap sebuah garis, dan Point tidak pernah
    // boleh diam-diam berubah menjadi rute.
    if (/<LineString\b/i.test(block)) {
      const coordinates = parseCoordinateList(coords);
      if (coordinates.length < 2) {
        rejected.push({ raw: short, reason: `"${name}" garisnya kurang dari dua titik.` });
        continue;
      }
      lines.push({ name, folder, coordinates });
      continue;
    }

    // KML menulis bujur DULU, baru lintang: "lng,lat[,alt]".
    const first = coords.split(/\s+/).filter(Boolean)[0] ?? "";
    const parts = first.split(",");
    const longitude = Number(parts[0]);
    const latitude = Number(parts[1]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      rejected.push({ raw: short, reason: `"${name}" koordinatnya tidak terbaca: ${first}` });
      continue;
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      rejected.push({
        raw: short,
        reason: `"${name}" koordinatnya di luar rentang bumi (${latitude}, ${longitude}).`,
      });
      continue;
    }
    placemarks.push({
      name,
      latitude,
      longitude,
      description: firstTag(block, "description"),
      folder,
    });
  }

  return { placemarks, lines, rejected };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface KmlExportPoint {
  name: string;
  latitude: number;
  longitude: number;
  description?: string | null;
  /** Dipakai untuk memilih gaya penanda (warna okupansi). */
  styleId?: string | null;
  /**
   * Folder tempat titik ini ditaruh (Fase 38).
   *
   * Penting untuk perjalanan pulang-pergi: importir menebak jenis titik dari
   * nama folder, jadi berkas yang kita ekspor harus bisa diimpor kembali dan
   * dikenali sebagai jenis yang sama. Tanpa folder, seluruh hasil ekspor akan
   * kembali sebagai "belum ditentukan".
   */
  folder?: string | null;
}

/** Menyusun dokumen KML. Gaya warna mengikuti okupansi ODP. */
/// Rute untuk diekspor (Fase 39).
export interface KmlExportLine {
  name: string;
  folder?: string | null;
  description?: string | null;
  coordinates: [number, number][];
}

export function buildKml(
  documentName: string,
  points: KmlExportPoint[],
  styles: { id: string; colorAabbggrr: string }[] = [],
  lines: KmlExportLine[] = []
): string {
  const styleXml = styles
    .map(
      (s) => `  <Style id="${escapeXml(s.id)}">
    <IconStyle><color>${s.colorAabbggrr}</color><scale>1.1</scale></IconStyle>
  </Style>`
    )
    .join("\n");

  const renderPoint = (p: KmlExportPoint, indent: string) =>
    `${indent}<Placemark>
${indent}  <name>${escapeXml(p.name)}</name>${
      p.description ? `\n${indent}  <description>${escapeXml(p.description)}</description>` : ""
    }${p.styleId ? `\n${indent}  <styleUrl>#${escapeXml(p.styleId)}</styleUrl>` : ""}
${indent}  <Point><coordinates>${p.longitude},${p.latitude},0</coordinates></Point>
${indent}</Placemark>`;

  // Titik berfolder dikelompokkan; yang tanpa folder tetap di akar dokumen.
  const loose = points.filter((p) => !p.folder);
  const folders = new Map<string, KmlExportPoint[]>();
  for (const p of points) {
    if (!p.folder) continue;
    const list = folders.get(p.folder) ?? [];
    list.push(p);
    folders.set(p.folder, list);
  }

  const placemarks = [
    ...loose.map((p) => renderPoint(p, "  ")),
    ...[...folders.entries()].map(
      ([name, list]) => `  <Folder>
    <name>${escapeXml(name)}</name>
${list.map((p) => renderPoint(p, "    ")).join("\n")}
  </Folder>`
    ),
  ].join("\n");

  const renderLine = (l: KmlExportLine, indent: string) =>
    `${indent}<Placemark>
${indent}  <name>${escapeXml(l.name)}</name>${
      l.description ? `\n${indent}  <description>${escapeXml(l.description)}</description>` : ""
    }
${indent}  <LineString><coordinates>${l.coordinates
      .map(([lng, lat]) => `${lng},${lat},0`)
      .join(" ")}</coordinates></LineString>
${indent}</Placemark>`;

  const lineFolders = new Map<string, KmlExportLine[]>();
  const looseLines: KmlExportLine[] = [];
  for (const l of lines) {
    if (!l.folder) { looseLines.push(l); continue; }
    const list = lineFolders.get(l.folder) ?? [];
    list.push(l);
    lineFolders.set(l.folder, list);
  }
  const lineXml = [
    ...looseLines.map((l) => renderLine(l, "  ")),
    ...[...lineFolders.entries()].map(
      ([name, list]) => `  <Folder>
    <name>${escapeXml(name)}</name>
${list.map((l) => renderLine(l, "    ")).join("\n")}
  </Folder>`
    ),
  ].join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${escapeXml(documentName)}</name>
${styleXml}
${placemarks}
${lineXml}
</Document>
</kml>
`;
}
