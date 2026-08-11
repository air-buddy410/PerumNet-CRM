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
