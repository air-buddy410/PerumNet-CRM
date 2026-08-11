import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseKml, buildKml } from "@/lib/kml";

describe("parseKml", () => {
  test("membaca urutan KML lng,lat — BUKAN lat,lng", () => {
    const { placemarks } = parseKml(
      `<Placemark><name>ODP-1</name><Point><coordinates>115.605,-8.452,0</coordinates></Point></Placemark>`
    );
    assert.equal(placemarks.length, 1);
    assert.equal(placemarks[0].longitude, 115.605);
    assert.equal(placemarks[0].latitude, -8.452);
  });

  test("menolak koordinat di luar rentang bumi", () => {
    const { placemarks, rejected } = parseKml(
      `<Placemark><name>Ngawur</name><Point><coordinates>999,999</coordinates></Point></Placemark>`
    );
    assert.equal(placemarks.length, 0);
    assert.equal(rejected.length, 1);
    assert.match(rejected[0].reason, /di luar rentang bumi/);
  });

  test("melaporkan placemark rusak, tidak membuangnya diam-diam", () => {
    const { placemarks, rejected } = parseKml(`
      <Placemark><name>Baik</name><Point><coordinates>115,-8</coordinates></Point></Placemark>
      <Placemark><name>Tanpa Koordinat</name></Placemark>
      <Placemark><Point><coordinates>115,-8</coordinates></Point></Placemark>
      <Placemark><name>Rusak</name><Point><coordinates>abc,def</coordinates></Point></Placemark>
    `);
    assert.equal(placemarks.length, 1);
    assert.equal(rejected.length, 3, "tiga placemark rusak harus dilaporkan");
  });

  test("men-decode entitas XML dan CDATA", () => {
    const { placemarks } = parseKml(
      `<Placemark><name>A &amp; B</name><description><![CDATA[<b>catatan</b>]]></description><Point><coordinates>115,-8</coordinates></Point></Placemark>`
    );
    assert.equal(placemarks[0].name, "A & B");
    assert.equal(placemarks[0].description, "<b>catatan</b>");
  });

  test("mengambil titik pertama bila coordinates berisi banyak titik", () => {
    const { placemarks } = parseKml(
      `<Placemark><name>Garis</name><Point><coordinates>115.1,-8.1,0 115.2,-8.2,0</coordinates></Point></Placemark>`
    );
    assert.equal(placemarks[0].longitude, 115.1);
  });
});

describe("buildKml", () => {
  test("meng-escape karakter berbahaya", () => {
    const kml = buildKml("Uji", [
      { name: 'A & B <script>alert(1)</script>', latitude: -8, longitude: 115 },
    ]);
    assert.ok(kml.includes("&amp;"));
    assert.ok(!kml.includes("<script>"), "markup mentah tidak boleh lolos ke KML");
  });

  test("menulis coordinates sebagai lng,lat,0", () => {
    const kml = buildKml("Uji", [{ name: "P", latitude: -8.45, longitude: 115.6 }]);
    assert.ok(kml.includes("<coordinates>115.6,-8.45,0</coordinates>"));
  });

  test("hasilnya bisa dibaca kembali oleh parser sendiri", () => {
    const kml = buildKml("Uji", [
      { name: "ODP-1", latitude: -8.45, longitude: 115.6 },
      { name: "ODP-2", latitude: -8.46, longitude: 115.61 },
    ]);
    const back = parseKml(kml);
    assert.equal(back.placemarks.length, 2);
    assert.equal(back.rejected.length, 0);
    assert.equal(back.placemarks[0].latitude, -8.45);
  });
});

describe("parseKml — kesadaran folder (Fase 35)", () => {
  const XML = `<?xml version="1.0"?><kml><Document>
    <Folder><name>POP</name>
      <Placemark><name>SPOP Abang</name><Point><coordinates>115.1,-8.4</coordinates></Point></Placemark>
    </Folder>
    <Folder><name>ODP</name>
      <Placemark><name>ABB 012405</name><Point><coordinates>115.2,-8.5</coordinates></Point></Placemark>
      <Folder><name>ODP Kaskade</name>
        <Placemark><name>ABB 022404</name><Point><coordinates>115.3,-8.6</coordinates></Point></Placemark>
      </Folder>
      <Placemark><name>ABB 032403</name><Point><coordinates>115.4,-8.7</coordinates></Point></Placemark>
    </Folder>
    <Placemark><name>Lepas</name><Point><coordinates>115.5,-8.8</coordinates></Point></Placemark>
  </Document></kml>`;

  test("setiap titik tahu folder terdalamnya", () => {
    const { placemarks } = parseKml(XML);
    const folderOf = new Map(placemarks.map((p) => [p.name, p.folder]));
    assert.equal(folderOf.get("SPOP Abang"), "POP");
    assert.equal(folderOf.get("ABB 012405"), "ODP");
    assert.equal(folderOf.get("ABB 022404"), "ODP Kaskade", "folder bersarang");
  });

  test("keluar dari folder bersarang mengembalikan folder induk", () => {
    // Kalau tumpukan folder salah, titik SETELAH folder anak akan ikut
    // terlabeli folder anak — dan seluruh impor jadi salah jenis.
    const { placemarks } = parseKml(XML);
    const after = placemarks.find((p) => p.name === "ABB 032403");
    assert.equal(after?.folder, "ODP");
  });

  test("titik di luar folder mana pun bernilai null, bukan tebakan", () => {
    const { placemarks } = parseKml(XML);
    assert.equal(placemarks.find((p) => p.name === "Lepas")?.folder, null);
  });

  test("folder tanpa nama tidak membuat parser gagal", () => {
    const xml = `<kml><Folder><Placemark><name>X</name>
      <Point><coordinates>115,-8</coordinates></Point></Placemark></Folder></kml>`;
    const { placemarks } = parseKml(xml);
    assert.equal(placemarks.length, 1);
    assert.equal(placemarks[0].folder, null);
  });
});

describe("parseKml — rute kabel (LineString)", () => {
  test("garis dibaca terpisah dari titik", () => {
    const xml = `<kml><Document>
      <Folder><name>Feeder</name>
        <Placemark><name>Feeder Abang</name><LineString><coordinates>
          115.1,-8.4,0 115.2,-8.5,0 115.3,-8.6,0
        </coordinates></LineString></Placemark>
      </Folder>
      <Placemark><name>ODP-1</name><Point><coordinates>115.2,-8.5</coordinates></Point></Placemark>
    </Document></kml>`;
    const { placemarks, lines } = parseKml(xml);
    assert.equal(placemarks.length, 1, "titik tidak tercampur ke garis");
    assert.equal(lines.length, 1);
    assert.equal(lines[0].name, "Feeder Abang");
    assert.equal(lines[0].folder, "Feeder");
    assert.equal(lines[0].coordinates.length, 3);
    assert.deepEqual(lines[0].coordinates[0], [115.1, -8.4], "urutan [bujur, lintang] dipertahankan");
  });

  test("garis bersimpul satu ditolak, tidak diam-diam jadi titik", () => {
    const xml = `<kml><Placemark><name>Cacat</name><LineString>
      <coordinates>115.1,-8.4</coordinates></LineString></Placemark></kml>`;
    const { placemarks, lines, rejected } = parseKml(xml);
    assert.equal(lines.length, 0);
    assert.equal(placemarks.length, 0, "TIDAK boleh berubah jadi titik");
    assert.match(rejected[0].reason, /kurang dari dua titik/i);
  });

  test("simpul di luar rentang bumi dibuang, sisanya tetap dipakai", () => {
    const xml = `<kml><Placemark><name>Rute</name><LineString><coordinates>
      115.1,-8.4 999,-8.5 115.3,-8.6
    </coordinates></LineString></Placemark></kml>`;
    const { lines } = parseKml(xml);
    assert.equal(lines[0].coordinates.length, 2);
  });

  test("dokumen tanpa garis mengembalikan array kosong, bukan undefined", () => {
    const xml = `<kml><Placemark><name>A</name><Point><coordinates>115,-8</coordinates></Point></Placemark></kml>`;
    assert.deepEqual(parseKml(xml).lines, []);
  });
});
