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

/**
 * Batas baris BERISI yang dibaca dari satu berkas.
 *
 * Angka 5.000 ditulis ketika satu-satunya pemakai pembaca ini adalah impor
 * pegawai, yang templatnya sendiri hanya menyediakan 200 baris. Buku kerja
 * katalog material bekerja lain: enam lembar dalam satu berkas, dan dua di
 * antaranya riwayat pergerakan sepanjang empat ribu baris yang tidak diimpor
 * tetapi tetap harus dilewati pembacanya. Berkas katalog PerumNet yang sah
 * berisi 8.871 baris dan tertolak sebagai "terlalu besar".
 *
 * Batas ini menjaga memori, bukan menjaga bentuk berkas. Lima puluh ribu baris
 * teks pendek masih beberapa megabita — jauh di bawah yang berbahaya, dan jauh
 * di atas berkas mana pun yang orang benar-benar impor.
 */
export const MAX_ROWS = 50_000;

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

/** Nomor urut sheetN.xml — sheet10 harus datang sesudah sheet9, bukan sesudah sheet1. */
function sheetOrder(name: string): number {
  return Number(/sheet(\d+)\.xml$/.exec(name)?.[1] ?? Number.MAX_SAFE_INTEGER);
}

/** Membuka arsip dan mengurutkan lembar kerjanya; dipakai kedua pembaca di bawah. */
function openWorkbook(buf: Buffer) {
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

  const sheets = entries
    .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name))
    .sort((a, b) => sheetOrder(a.name) - sheetOrder(b.name));
  if (sheets.length === 0) throw new XlsxError("Arsip tidak memuat lembar kerja sama sekali.");

  return { entries, sheets, shared: sharedStringsOf(buf, entries) };
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
  const { sheets, shared } = openWorkbook(buf);
  return parseSheetXml(readZipEntry(buf, sheets[0]).toString("utf8"), shared, 0);
}

/**
 * Membaca SELURUH lembar kerja, berurutan seperti di dalam berkas.
 *
 * Ada workbook yang satu berkasnya memuat beberapa tabel berbeda — katalog
 * material, vendor, dan kategori misalnya. Batas {@link MAX_ROWS} berlaku
 * untuk seluruh berkas, bukan per lembar: sepuluh lembar yang masing-masing
 * setengah batas tetap berukuran sama besarnya bagi mesin yang membacanya.
 */
export function readAllSheetRows(buf: Buffer): string[][][] {
  const { sheets, shared } = openWorkbook(buf);
  const out: string[][][] = [];
  let sudah = 0;
  for (const sheet of sheets) {
    const rows = parseSheetXml(readZipEntry(buf, sheet).toString("utf8"), shared, sudah);
    sudah += jumlahBerisi(rows);
    out.push(rows);
  }
  return out;
}

/** Baris yang punya setidaknya satu sel berisi. */
export function jumlahBerisi(rows: string[][]): number {
  return rows.reduce((n, r) => n + (r.some((c) => c !== "") ? 1 : 0), 0);
}

/**
 * @param sudah Jumlah baris BERISI yang sudah terbaca dari lembar sebelumnya,
 *   supaya batas {@link MAX_ROWS} dihitung untuk seluruh berkas.
 */
function parseSheetXml(xml: string, shared: string[], sudah: number): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  // Dihitung berjalan, bukan dihitung ulang tiap baris: berkas sebelas ribu
  // baris akan menjadi kuadratik kalau seluruh larik disapu setiap kali.
  let berisi = 0;

  while ((rowMatch = rowRe.exec(xml))) {
    // Yang dihitung terhadap batas adalah baris BERISI, bukan jumlah elemen
    // `<row>`. Google Sheets memadatkan tiap lembar sampai seribu baris kosong
    // atau lebih ketika diekspor, sehingga berkas berisi tiga ratus material
    // terhitung sebelas ribu baris dan ditolak sebagai "terlalu besar". Pesan
    // itu menyesatkan sepenuhnya: berkasnya kecil, yang besar hanya bingkainya.
    if (berisi + sudah >= MAX_ROWS) {
      throw new XlsxError(`Berkas memuat lebih dari ${MAX_ROWS} baris berisi — terlalu besar untuk diimpor sekaligus.`);
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
    if (row.some((c) => c !== "")) berisi++;
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
