import { inflateRawSync } from "node:zlib";

// ── Pembaca KMZ (Fase 35) ───────────────────────────────────────
// KMZ adalah arsip ZIP berisi doc.kml beserta ikon/overlay. Yang kita
// butuhkan hanya berkas KML-nya.
//
// Ditulis tanpa dependensi (keputusan D4), memakai `zlib` bawaan Node —
// sejalan dengan kebiasaan repo ini. Cakupannya sengaja sempit: hanya metode
// penyimpanan yang benar-benar dipakai KMZ di lapangan (stored dan deflate).
// Berkas di luar itu DITOLAK dengan pesan yang jelas, bukan dibaca setengah
// benar lalu menghasilkan koordinat ngawur.
//
// Berkas ini berasal dari luar dan tidak tepercaya, jadi ada tiga pagar:
// jumlah entri, ukuran hasil dekompresi, dan rasio kompresi. Ketiganya
// menahan "zip bomb" — arsip kecil yang mengembang menjadi gigabyte dan
// menghabiskan memori server.

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

/** Pagar terhadap arsip yang dirancang untuk menghabiskan memori. */
export const MAX_ENTRIES = 500;
export const MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024; // 64 MB
export const MAX_COMPRESSION_RATIO = 200;

export interface KmzEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
  localHeaderOffset: number;
}

export class KmzError extends Error {}

/** Apakah buffer ini arsip ZIP (dan karenanya kemungkinan KMZ)? */
export function isZip(buf: Buffer): boolean {
  return buf.length >= 4 && buf.readUInt32LE(0) === SIG_LOCAL;
}

/**
 * Menemukan End of Central Directory.
 *
 * Dicari dari belakang karena EOCD boleh diikuti komentar sepanjang 64 KB.
 */
function findEocd(buf: Buffer): number {
  const maxComment = 0xffff;
  const start = Math.max(0, buf.length - maxComment - 22);
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  throw new KmzError("Bukan berkas ZIP/KMZ yang sah (penanda akhir arsip tidak ditemukan).");
}

export function listKmzEntries(buf: Buffer): KmzEntry[] {
  const eocd = findEocd(buf);
  const entryCount = buf.readUInt16LE(eocd + 10);
  const centralOffset = buf.readUInt32LE(eocd + 16);

  if (entryCount > MAX_ENTRIES) {
    throw new KmzError(`Arsip memuat ${entryCount} berkas; batasnya ${MAX_ENTRIES}.`);
  }
  if (centralOffset >= buf.length) {
    throw new KmzError("Struktur arsip rusak (daftar isi berada di luar berkas).");
  }

  const entries: KmzEntry[] = [];
  let p = centralOffset;
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CENTRAL) {
      throw new KmzError("Struktur arsip rusak (daftar isi tidak terbaca).");
    }
    const flags = buf.readUInt16LE(p + 8);
    // Bit 0 menandakan isi terenkripsi. Kita tidak membukanya, dan menebak
    // isinya jauh lebih berbahaya daripada menolak.
    if (flags & 0x1) {
      throw new KmzError("Arsip terkunci sandi — tidak didukung.");
    }
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");

    entries.push({ name, compressedSize, uncompressedSize, method, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(buf: Buffer, entry: KmzEntry): Buffer {
  const off = entry.localHeaderOffset;
  if (off + 30 > buf.length || buf.readUInt32LE(off) !== SIG_LOCAL) {
    throw new KmzError(`Isi berkas "${entry.name}" tidak terbaca.`);
  }
  // Panjang nama & extra pada header lokal bisa BERBEDA dari daftar isi,
  // jadi wajib dibaca ulang di sini alih-alih diasumsikan sama.
  const nameLen = buf.readUInt16LE(off + 26);
  const extraLen = buf.readUInt16LE(off + 28);
  const dataStart = off + 30 + nameLen + extraLen;

  if (entry.uncompressedSize > MAX_UNCOMPRESSED_BYTES) {
    throw new KmzError(
      `"${entry.name}" berukuran ${Math.round(entry.uncompressedSize / 1024 / 1024)}MB setelah dibuka; batasnya 64MB.`
    );
  }
  if (
    entry.compressedSize > 0 &&
    entry.uncompressedSize / entry.compressedSize > MAX_COMPRESSION_RATIO
  ) {
    throw new KmzError(`"${entry.name}" memiliki rasio kompresi tidak wajar — ditolak.`);
  }

  const raw = buf.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) {
    try {
      return inflateRawSync(raw, { maxOutputLength: MAX_UNCOMPRESSED_BYTES });
    } catch (e) {
      throw new KmzError(`Gagal membuka "${entry.name}": ${(e as Error).message}`);
    }
  }
  throw new KmzError(
    `Metode kompresi ${entry.method} pada "${entry.name}" tidak didukung (hanya stored dan deflate).`
  );
}

/**
 * Mengambil isi KML dari sebuah KMZ.
 *
 * `doc.kml` didahulukan karena itu nama bakunya; bila tidak ada, berkas `.kml`
 * pertama dipakai. Entri di dalam subfolder tetap diterima — sebagian aplikasi
 * survei menaruhnya di sana.
 */
export function extractKmlFromKmz(buf: Buffer): string {
  const entries = listKmzEntries(buf);
  const kmls = entries.filter((e) => e.name.toLowerCase().endsWith(".kml"));
  if (!kmls.length) {
    throw new KmzError("Arsip tidak memuat berkas .kml sama sekali.");
  }
  const chosen =
    kmls.find((e) => e.name.toLowerCase() === "doc.kml") ??
    kmls.find((e) => e.name.toLowerCase().endsWith("/doc.kml")) ??
    kmls[0];
  return readEntry(buf, chosen).toString("utf8");
}

/**
 * Menerima KMZ maupun KML mentah, mengembalikan XML-nya.
 *
 * Jenisnya ditentukan dari ISI berkas, bukan dari namanya — nama berkas
 * dikendalikan pengunggah dan sering salah.
 */
export function readKmlSource(buf: Buffer): string {
  if (isZip(buf)) return extractKmlFromKmz(buf);
  return buf.toString("utf8");
}
