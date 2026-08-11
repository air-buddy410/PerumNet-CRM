import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { linkStatusOf, emptyLinkCounts, occupancyOf } from "@/lib/noc-map";

// Perbedaan yang dijaga di sini kecil tetapi menentukan: "tidak tahu" tidak
// boleh dilaporkan sebagai "mati". Hitungan pelanggan offline dipakai NOC
// untuk memutuskan tindakan, jadi angkanya harus berarti apa adanya.

describe("linkStatusOf", () => {
  test("status dari router diteruskan apa adanya", () => {
    assert.equal(linkStatusOf({ status: "ONLINE" }), "ONLINE");
    assert.equal(linkStatusOf({ status: "OFFLINE" }), "OFFLINE");
    assert.equal(linkStatusOf({ status: "DISABLED" }), "DISABLED");
  });

  test("tanpa sesi → UNKNOWN, BUKAN OFFLINE", () => {
    // Langganan yang routernya belum didaftarkan bukan pelanggan yang mati.
    assert.equal(linkStatusOf(null), "UNKNOWN");
    assert.equal(linkStatusOf(undefined), "UNKNOWN");
  });

  test("status asing tidak dipaksa jadi salah satu yang dikenal", () => {
    assert.equal(linkStatusOf({ status: "" }), "UNKNOWN");
    assert.equal(linkStatusOf({ status: "online" }), "UNKNOWN");
    assert.equal(linkStatusOf({ status: "TIMEOUT" }), "UNKNOWN");
  });
});

describe("emptyLinkCounts", () => {
  test("seluruh status dimulai dari nol", () => {
    assert.deepEqual(emptyLinkCounts(), {
      ONLINE: 0,
      OFFLINE: 0,
      DISABLED: 0,
      UNKNOWN: 0,
    });
  });

  test("setiap pemanggilan menghasilkan objek baru", () => {
    // Kalau dipakai bersama, hitungan satu peta akan bocor ke peta lain.
    const a = emptyLinkCounts();
    a.OFFLINE = 5;
    assert.equal(emptyLinkCounts().OFFLINE, 0);
  });
});

describe("occupancyOf tetap utuh", () => {
  test("ambang okupansi tidak berubah oleh Fase 37b", () => {
    assert.equal(occupancyOf(0, 8), "FREE");
    assert.equal(occupancyOf(8, 8), "FULL");
    assert.equal(occupancyOf(0, 0), "FULL");
  });
});
