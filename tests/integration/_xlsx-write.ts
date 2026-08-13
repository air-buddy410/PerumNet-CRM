// Penulis xlsx seadanya — HANYA untuk tes.
//
// Ada supaya tes impor menempuh jalur yang SAMA dengan HRD: berkas nyata →
// ZIP → XML → tabel → basis data. Menyuntikkan tabel teks langsung ke
// parseEmployeeSheet akan melewatkan justru bagian yang paling mudah rusak,
// yaitu pembacaan zip dan penempatan kolom.
//
// Entri ditulis tanpa kompresi (metode 0). Berkas tes kecil, dan tanpa
// deflate penulis ini muat dalam beberapa puluh baris.

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

interface Entry {
  name: string;
  data: Buffer;
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
    local.writeUInt16LE(0, 8); // stored
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
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
 * Membangun xlsx dari tabel teks.
 *
 * Sel kosong SENGAJA dihilangkan sepenuhnya dari XML, persis seperti yang
 * dilakukan Excel. Itulah yang membuat penempatan kolom berbasis referensi sel
 * benar-benar teruji di sini.
 */
export function buildXlsx(rows: string[][]): Buffer {
  const shared: string[] = [];
  const indexOfText = (s: string) => {
    const at = shared.indexOf(s);
    if (at >= 0) return at;
    shared.push(s);
    return shared.length - 1;
  };

  const xmlRows = rows
    .map((cells, r) => {
      const cs = cells
        .map((v, c) => (v === "" ? "" : `<c r="${columnRef(c)}${r + 1}" t="s"><v>${indexOfText(v)}</v></c>`))
        .join("");
      return `<row r="${r + 1}">${cs}</row>`;
    })
    .join("");

  const sheet =
    `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${xmlRows}</sheetData></worksheet>`;

  const sst =
    `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">` +
    shared.map((s) => `<si><t>${escapeXml(s)}</t></si>`).join("") +
    `</sst>`;

  return zip([
    { name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheet, "utf8") },
    { name: "xl/sharedStrings.xml", data: Buffer.from(sst, "utf8") },
  ]);
}

/** Berkas siap kirim ke server action, seperti dari <input type="file">. */
export function xlsxFile(rows: string[][], name = "data-pegawai.xlsx"): File {
  const buf = buildXlsx(rows);
  return new File([new Uint8Array(buf)], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
