import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync, crc32 } from "node:zlib";
import { isZip, listKmzEntries, extractKmlFromKmz, readKmlSource, KmzError, MAX_ENTRIES } from "@/lib/kmz";

// KMZ berasal dari luar dan tidak tepercaya. Yang dijaga di sini bukan cuma
// "bisa dibaca", melainkan juga bahwa arsip yang dirancang untuk merusak
// ditolak dengan pesan yang jelas — bukan dibaca setengah benar.

/** Merakit ZIP sungguhan supaya pembacanya benar-benar diuji, bukan dimock. */
function buildZip(
  files: { name: string; content: Buffer | string; store?: boolean }[]
): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, "utf8");
    const raw = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, "utf8");
    const method = f.store ? 0 : 8;
    const data = method === 0 ? raw : deflateRawSync(raw);
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([Buffer.concat(locals), centralBuf, eocd]);
}

const SAMPLE_KML = `<?xml version="1.0"?><kml><Document>
  <Placemark><name>ODP-01</name><Point><coordinates>115.21,-8.65,0</coordinates></Point></Placemark>
</Document></kml>`;

describe("isZip", () => {
  test("mengenali arsip dari ISI-nya, bukan dari nama berkas", () => {
    assert.equal(isZip(buildZip([{ name: "doc.kml", content: SAMPLE_KML }])), true);
    assert.equal(isZip(Buffer.from(SAMPLE_KML)), false);
    assert.equal(isZip(Buffer.alloc(2)), false);
  });
});

describe("listKmzEntries", () => {
  test("membaca daftar isi arsip", () => {
    const zip = buildZip([
      { name: "doc.kml", content: SAMPLE_KML },
      { name: "files/icon.png", content: Buffer.from([1, 2, 3]) },
    ]);
    const entries = listKmzEntries(zip);
    assert.deepEqual(entries.map((e) => e.name), ["doc.kml", "files/icon.png"]);
  });

  test("berkas bukan ZIP ditolak dengan pesan yang jelas", () => {
    assert.throws(() => listKmzEntries(Buffer.from("bukan zip sama sekali")), KmzError);
  });
});

describe("extractKmlFromKmz", () => {
  test("mengambil doc.kml", () => {
    const zip = buildZip([
      { name: "files/icon.png", content: Buffer.from([9, 9]) },
      { name: "doc.kml", content: SAMPLE_KML },
    ]);
    assert.match(extractKmlFromKmz(zip), /ODP-01/);
  });

  test("doc.kml didahulukan meski ada .kml lain", () => {
    const zip = buildZip([
      { name: "lain.kml", content: "<kml>SALAH</kml>" },
      { name: "doc.kml", content: SAMPLE_KML },
    ]);
    assert.match(extractKmlFromKmz(zip), /ODP-01/);
  });

  test("tanpa doc.kml, berkas .kml pertama dipakai", () => {
    const zip = buildZip([{ name: "survey-abang.kml", content: SAMPLE_KML }]);
    assert.match(extractKmlFromKmz(zip), /ODP-01/);
  });

  test("entri tersimpan tanpa kompresi juga terbaca", () => {
    const zip = buildZip([{ name: "doc.kml", content: SAMPLE_KML, store: true }]);
    assert.match(extractKmlFromKmz(zip), /ODP-01/);
  });

  test("arsip tanpa .kml ditolak", () => {
    const zip = buildZip([{ name: "catatan.txt", content: "halo" }]);
    assert.throws(() => extractKmlFromKmz(zip), /tidak memuat berkas \.kml/i);
  });

  test("isi UTF-8 tidak rusak", () => {
    const kml = `<kml><Placemark><name>ODP Ubud — Selatan</name>
      <Point><coordinates>115.2,-8.5</coordinates></Point></Placemark></kml>`;
    const zip = buildZip([{ name: "doc.kml", content: kml }]);
    assert.match(extractKmlFromKmz(zip), /Ubud — Selatan/);
  });
});

describe("pagar terhadap arsip berbahaya", () => {
  test("jumlah entri berlebihan ditolak", () => {
    const zip = buildZip([{ name: "doc.kml", content: SAMPLE_KML }]);
    // Palsukan jumlah entri pada EOCD.
    const forged = Buffer.from(zip);
    forged.writeUInt16LE(MAX_ENTRIES + 1, forged.length - 22 + 10);
    assert.throws(() => listKmzEntries(forged), /batasnya/i);
  });

  test("arsip terkunci sandi ditolak, bukan ditebak isinya", () => {
    const zip = buildZip([{ name: "doc.kml", content: SAMPLE_KML }]);
    const forged = Buffer.from(zip);
    // Nyalakan bit enkripsi pada central directory.
    const centralStart = forged.readUInt32LE(forged.length - 22 + 16);
    forged.writeUInt16LE(0x1, centralStart + 8);
    assert.throws(() => listKmzEntries(forged), /terkunci sandi/i);
  });

  test("rasio kompresi tidak wajar ditolak (zip bomb)", () => {
    // 5 MB nol memampat sangat kecil — persis pola zip bomb.
    const zip = buildZip([{ name: "doc.kml", content: Buffer.alloc(5 * 1024 * 1024) }]);
    assert.throws(() => extractKmlFromKmz(zip), /rasio kompresi tidak wajar/i);
  });
});

describe("readKmlSource", () => {
  test("menerima KMZ maupun KML mentah", () => {
    assert.match(readKmlSource(buildZip([{ name: "doc.kml", content: SAMPLE_KML }])), /ODP-01/);
    assert.match(readKmlSource(Buffer.from(SAMPLE_KML)), /ODP-01/);
  });
});
