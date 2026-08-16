// ── Menulis xlsx yang benar-benar dibuka Excel (Fase 75) ────────
//
// Sudah ada penulis xlsx di `tests/integration/_xlsx-write.ts`, tetapi ia
// sengaja tidak lengkap: ia hanya memuat lembar dan tabel teks, cukup untuk
// dibaca kembali oleh pembaca kita sendiri. Excel MENOLAK berkas seperti itu
// — tanpa `[Content_Types].xml` dan `workbook.xml` ia bukan xlsx, hanya zip
// yang kebetulan berisi XML.
//
// Berkas ini menulis paket OOXML yang utuh, sebab keluarannya dibuka orang di
// Excel sungguhan, bukan oleh pembaca kita.
//
// Semua sel ditulis sebagai TEKS. Itu disengaja dan penting: nomor layanan
// (`PN102042532`), NIK, dan nomor telepon berawalan nol akan dirusak Excel
// kalau ia menganggapnya angka — nol di depan hilang, dan digit panjang
// berubah menjadi notasi ilmiah. Data yang akan dikirim balik untuk diimpor
// tidak boleh berubah hanya karena pernah dibuka.

interface Entry {
  name: string;
  data: Buffer;
}

export interface Lembar {
  /** Nama tab. Excel membatasi 31 karakter dan melarang : \ / ? * [ ] */
  nama: string;
  /** Baris pertama diperlakukan sebagai judul kolom oleh pembacanya. */
  baris: string[][];
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(entries: Entry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8); // disimpan apa adanya, tanpa deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(e.data.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, e.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(e.data.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += 30 + name.length + e.data.length;
  }

  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, cd, eocd]);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Karakter kendali membuat Excel menolak berkasnya sebagai rusak. Yang
    // boleh lewat hanya tab, baris baru, dan carriage return.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function columnRef(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Nama tab yang aman.
 *
 * Excel menolak berkasnya secara keseluruhan — bukan hanya lembar itu —
 * kalau ada nama tab yang memuat karakter terlarang atau melebihi 31 karakter.
 */
export function safeSheetName(nama: string, urutan: number): string {
  const bersih = nama.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31);
  return bersih || `Lembar${urutan + 1}`;
}

/** Membangun xlsx berlembar banyak dari tabel teks. */
export function buildWorkbook(lembar: Lembar[]): Buffer {
  if (lembar.length === 0) throw new Error("Buku kerja harus punya minimal satu lembar.");

  const shared: string[] = [];
  const indeks = new Map<string, number>();
  const idText = (s: string) => {
    const ada = indeks.get(s);
    if (ada !== undefined) return ada;
    shared.push(s);
    indeks.set(s, shared.length - 1);
    return shared.length - 1;
  };

  const sheetXml = lembar.map((l) => {
    const xmlRows = l.baris
      .map((cells, r) => {
        const cs = cells
          .map((v, c) => (v === "" ? "" : `<c r="${columnRef(c)}${r + 1}" t="s"><v>${idText(v)}</v></c>`))
          .join("");
        return `<row r="${r + 1}">${cs}</row>`;
      })
      .join("");
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<sheetData>${xmlRows}</sheetData></worksheet>`
    );
  });

  const nama = lembar.map((l, i) => safeSheetName(l.nama, i));

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
    nama.map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
    `</sheets></workbook>`;

  const idSst = lembar.length + 1;
  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    nama
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
      )
      .join("") +
    `<Relationship Id="rId${idSst}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
    `</Relationships>`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    lembar
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
      .join("") +
    `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
    `</Types>`;

  // sharedStrings dibangun TERAKHIR: isinya baru lengkap setelah seluruh
  // lembar selesai ditulis.
  const sst =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">` +
    shared.map((s) => `<si><t xml:space="preserve">${escapeXml(s)}</t></si>`).join("") +
    `</sst>`;

  const buf = (s: string) => Buffer.from(s, "utf8");
  return zip([
    { name: "[Content_Types].xml", data: buf(contentTypes) },
    { name: "_rels/.rels", data: buf(rels) },
    { name: "xl/workbook.xml", data: buf(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: buf(workbookRels) },
    ...sheetXml.map((x, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: buf(x) })),
    { name: "xl/sharedStrings.xml", data: buf(sst) },
  ]);
}
