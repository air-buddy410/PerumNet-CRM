import { listKmzEntries, readZipEntry, isZip, KmzError } from "@/lib/kmz";

// ── Pembaca xlsx seperlunya (Fase 51) ───────────────────────────
//
// Berkas xlsx adalah arsip ZIP berisi XML. Karena repo ini sudah punya
// pembaca ZIP tanpa dependensi dari Fase 35 — lengkap dengan tiga pagar
// anti zip-bomb — membacanya di sini tidak menambah dependensi apa pun.
//
// Cakupannya SENGAJA sempit: hanya yang dibutuhkan untuk membaca tabel data
// datar dari template yang kita terbitkan sendiri. Bukan pengganti pustaka
// spreadsheet, dan tidak berpura-pura begitu.
//
// Yang TIDAK didukung, dan ditolak dengan jelas alih-alih dibaca setengah
// benar: berkas .xls lama (format biner berbeda) dan arsip terenkripsi.

export class XlsxError extends Error {}

/** Batas baris yang dibaca — template HRD sendiri hanya menyediakan 200. */
export const MAX_ROWS = 5000;

// ── Pembacaan XML seperlunya ────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    // &amp; DIURAI TERAKHIR. Kalau lebih dulu, "&amp;lt;" yang memang berarti
    // teks "&lt;" akan terurai dua kali menjadi "<".
    .replace(/&amp;/g, "&");
}

/** Isi seluruh elemen <t> di dalam sepotong XML, digabung. */
function textOf(xml: string): string {
  const parts: string[] = [];
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) parts.push(decodeEntities(m[1]));
  return parts.join("");
}

/** Kolom dari referensi sel: "A1" → 0, "AB12" → 27. */
export function columnIndexOf(ref: string): number {
  const letters = ref.replace(/\d+/g, "").toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// ── Tabel ───────────────────────────────────────────────────────

function sharedStringsOf(buf: Buffer, entries: ReturnType<typeof listKmzEntries>): string[] {
  const entry = entries.find((e) => e.name === "xl/sharedStrings.xml");
  if (!entry) return [];
  const xml = readZipEntry(buf, entry).toString("utf8");
  const out: string[] = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  // Teks kaya (rich text) terpecah menjadi beberapa <r><t>, jadi seluruh <t>
  // di dalam satu <si> digabung — kalau hanya yang pertama diambil, nama yang
  // sebagian dicetak tebal akan terpotong.
  while ((m = re.exec(xml))) out.push(textOf(m[1]));
  return out;
}

/**
 * Membaca sheet pertama sebagai tabel teks.
 *
 * Sel kosong tetap menempati kolomnya — xlsx menghilangkan sel kosong dari
 * XML, dan tanpa penataan ulang berdasarkan referensi selnya, satu kolom
 * kosong akan menggeser seluruh baris ke kiri. Itu jenis kerusakan yang tidak
 * terlihat sampai datanya sudah masuk.
 */
export function readSheetRows(buf: Buffer): string[][] {
  if (!isZip(buf)) {
    throw new XlsxError(
      "Berkas ini bukan .xlsx. Format .xls lama tidak didukung — simpan ulang sebagai .xlsx."
    );
  }

  let entries: ReturnType<typeof listKmzEntries>;
  try {
    entries = listKmzEntries(buf);
  } catch (e) {
    throw new XlsxError(e instanceof KmzError ? e.message : String(e));
  }

  const sheet =
    entries.find((e) => e.name === "xl/worksheets/sheet1.xml") ??
    entries.find((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name));
  if (!sheet) throw new XlsxError("Arsip tidak memuat lembar kerja sama sekali.");

  const shared = sharedStringsOf(buf, entries);
  const xml = readZipEntry(buf, sheet).toString("utf8");

  const rows: string[][] = [];
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(xml))) {
    if (rows.length >= MAX_ROWS) {
      throw new XlsxError(`Berkas memuat lebih dari ${MAX_ROWS} baris — terlalu besar untuk diimpor sekaligus.`);
    }
    const row: string[] = [];
    // Atributnya TIDAK BOLEH rakus. Sel kosong ditulis self-closing
    // (`<c r="A4" s="4"/>`), dan `[^>]*` yang rakus ikut menelan garis
    // miringnya — alternasi lalu jatuh ke cabang `>...</c>` dan membaca
    // MELEWATI sel berikutnya. Akibatnya seluruh baris bergeser satu kolom:
    // nama masuk ke kolom NIK, dan tidak ada yang terlihat salah sampai
    // datanya sudah tersimpan.
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRe.exec(rowMatch[1]))) {
      const attrs = cellMatch[1] ?? "";
      const inner = cellMatch[2] ?? "";
      const refMatch = /\br="([A-Z]+\d+)"/.exec(attrs);
      const col = refMatch ? columnIndexOf(refMatch[1]) : row.length;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? "n";

      let value = "";
      if (type === "s") {
        const idx = Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
        value = Number.isInteger(idx) ? (shared[idx] ?? "") : "";
      } else if (type === "inlineStr") {
        value = textOf(inner);
      } else {
        // Termasuk sel berformula: <f> diabaikan, <v> yang dibaca. Formula
        // tanpa nilai tersimpan menghasilkan string kosong — itu benar, sebab
        // memang belum pernah dihitung.
        value = decodeEntities(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
      }

      while (row.length < col) row.push("");
      row[col] = value.trim();
    }
    rows.push(row);
  }
  return rows;
}

// ── Tanggal ─────────────────────────────────────────────────────

/**
 * Ambang bawah agar sebuah angka dianggap tanggal serial Excel.
 * 25569 = 1 Januari 1970.
 *
 * Ada gunanya: "2026" yang diketik sendirian juga berupa angka, dan tanpa
 * ambang ini akan terbaca sebagai 18 Juli 1905 — tanggal yang masuk akal bagi
 * mesin tetapi jelas salah bagi manusia. Di atas ambang, angka sekecil itu
 * tidak mungkin muncul sebagai salah ketik.
 */
export const SERIAL_DATE_FLOOR = 25569;
export const SERIAL_DATE_CEIL = 2958465; // 31 Desember 9999

/**
 * Membaca tanggal dari sel, menerima DUA bentuk.
 *
 * Excel menyimpan sel bertipe tanggal sebagai angka serial, tetapi sel
 * bertipe teks menyimpannya apa adanya. Template kita memakai format tanggal,
 * namun HRD bisa saja menyalin-tempel dari tempat lain dan menghasilkan teks.
 * Menerima keduanya jauh lebih murah daripada menolak satu file utuh karena
 * satu kolom bertipe berbeda.
 */
export function parseCellDate(raw: string): Date | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial < SERIAL_DATE_FLOOR || serial > SERIAL_DATE_CEIL) return null;
    // Epoch Excel adalah 1899-12-30, bukan 1900-01-01: Excel menganggap 1900
    // tahun kabisat padahal bukan, dan pergeseran itu sudah termasuk di sini.
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    const d = new Date(ms);
    // Dinormalkan ke tengah hari UTC supaya pergeseran zona waktu tidak
    // memundurkan tanggalnya sehari saat ditampilkan.
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12));
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12));
  }
  // Bentuk lain (mis. 06/01/2026) sengaja DITOLAK: 06/01 bisa berarti 6
  // Januari atau 1 Juni, dan menebaknya berarti memasukkan tanggal yang salah
  // tanpa ada yang tahu.
  return null;
}
