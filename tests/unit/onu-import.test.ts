import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { bacaPosisiOnu, bersihkanOnu } from "@/lib/onu-import";

// Seluruh nilai di berkas ini disalin dari catatan ONU PerumNet yang sungguhan.

describe("bacaPosisiOnu", () => {
  test("bentuk ZTE — rak diabaikan, slot/port/ONU diambil", () => {
    assert.deepEqual(bacaPosisiOnu("1/17/3:2"), { slot: 17, port: 3, index: 2 });
    assert.deepEqual(bacaPosisiOnu("1/1/11:2"), { slot: 1, port: 11, index: 2 });
    assert.deepEqual(bacaPosisiOnu("1/17/5:55"), { slot: 17, port: 5, index: 55 });
  });

  test("bentuk HSGQ — satu slot, port dan ONU saja", () => {
    assert.deepEqual(bacaPosisiOnu("8:3"), { slot: 1, port: 8, index: 3 });
    assert.deepEqual(bacaPosisiOnu("3:75"), { slot: 1, port: 3, index: 75 });
  });

  test("ONU NOL itu sah pada HSGQ, bukan ketiadaan", () => {
    // 94 pelanggan HSGQ Kecicang memakainya. Memeriksa dengan `> 0` akan
    // membuang satu ONU sungguhan di tiap port.
    assert.deepEqual(bacaPosisiOnu("8:0"), { slot: 1, port: 8, index: 0 });
    assert.deepEqual(bacaPosisiOnu("1/17/3:0"), { slot: 17, port: 3, index: 0 });
  });

  test("port yang hilang DITOLAK, tidak ditebak", () => {
    // Nilai sungguhan dari PN100202305. Menebak portnya berarti menempatkan
    // pelanggan pada serat yang tidak dilaluinya.
    assert.equal(bacaPosisiOnu("1/17/:19"), null);
  });

  test("bentuk lain menghasilkan null", () => {
    assert.equal(bacaPosisiOnu(""), null);
    assert.equal(bacaPosisiOnu(null), null);
    assert.equal(bacaPosisiOnu("1/17/3"), null);
    assert.equal(bacaPosisiOnu("online"), null);
    assert.equal(bacaPosisiOnu("0:5"), null);
  });
});

describe("bersihkanOnu", () => {
  test("yang terbaca menjadi SIAP, yang tidak tetap dikembalikan berikut alasannya", () => {
    const h = bersihkanOnu([
      { serviceNumber: "PN100012524", onu: "1/17/3:2" },
      { serviceNumber: "PN100220169", onu: "8:0" },
      { serviceNumber: "PN100202305", onu: "1/17/:19" },
      { serviceNumber: "PN000000000", onu: null },
    ]);
    assert.deepEqual(h.map((x) => x.status), ["SIAP", "SIAP", "TOLAK", "TOLAK"]);
    assert.match(h[2].pesan, /tidak terbaca/);
    assert.match(h[3].pesan, /tidak mencatat/);
  });

  test("nilai mentah disimpan verbatim, termasuk pada yang ditolak", () => {
    // Itulah yang diketik teknisi ke konsol OLT; kehilangan bentuk aslinya
    // membuat baris yang ditolak mustahil ditelusuri orang.
    const [t] = bersihkanOnu([{ serviceNumber: "PN100202305", onu: " 1/17/:19 " }]);
    assert.equal(t.posisi, "1/17/:19");
    assert.equal(t.terurai, null);
  });
});
