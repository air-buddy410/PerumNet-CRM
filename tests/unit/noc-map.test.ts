import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { occupancyOf, projector } from "@/lib/noc-map";

describe("occupancyOf", () => {
  test("batas-batas ambang", () => {
    assert.equal(occupancyOf(0, 8), "FREE");
    assert.equal(occupancyOf(3, 8), "FREE");
    assert.equal(occupancyOf(4, 8), "MODERATE", "tepat 50% masuk MODERATE");
    assert.equal(occupancyOf(6, 8), "MODERATE", "75% masih MODERATE");
    assert.equal(occupancyOf(8, 10), "TIGHT", "tepat 80% masuk TIGHT");
    assert.equal(occupancyOf(7, 8), "TIGHT", "87,5% masuk TIGHT");
    assert.equal(occupancyOf(8, 8), "FULL");
  });

  test("terisi melebihi kapasitas tetap FULL, bukan meluap", () => {
    assert.equal(occupancyOf(12, 8), "FULL");
  });

  test("kapasitas nol dianggap FULL — tidak bisa menerima siapa pun", () => {
    assert.equal(occupancyOf(0, 0), "FULL");
  });
});

describe("projector", () => {
  const bounds = { minLat: -8.47, maxLat: -8.45, minLng: 115.6, maxLng: 115.63 };
  const project = projector(bounds, 1000, 600);

  test("lintang lebih utara digambar lebih ATAS", () => {
    const utara = project(bounds.maxLat, bounds.minLng);
    const selatan = project(bounds.minLat, bounds.minLng);
    assert.ok(utara.y < selatan.y, `${utara.y} harus < ${selatan.y}`);
  });

  test("bujur lebih timur digambar lebih KANAN", () => {
    const barat = project(bounds.minLat, bounds.minLng);
    const timur = project(bounds.minLat, bounds.maxLng);
    assert.ok(timur.x > barat.x, `${timur.x} harus > ${barat.x}`);
  });

  test("seluruh titik berada di dalam kanvas", () => {
    for (const [lat, lng] of [
      [bounds.minLat, bounds.minLng],
      [bounds.maxLat, bounds.maxLng],
      [bounds.minLat, bounds.maxLng],
      [bounds.maxLat, bounds.minLng],
    ] as const) {
      const p = project(lat, lng);
      assert.ok(p.x >= 0 && p.x <= 1000, `x=${p.x} keluar kanvas`);
      assert.ok(p.y >= 0 && p.y <= 600, `y=${p.y} keluar kanvas`);
    }
  });

  test("skala sama di kedua sumbu — bentuk tidak melar", () => {
    // Dua jarak lintang yang sama harus menghasilkan jarak layar yang sama.
    const a = project(-8.45, 115.6);
    const b = project(-8.46, 115.6);
    const c = project(-8.47, 115.6);
    assert.ok(Math.abs((b.y - a.y) - (c.y - b.y)) < 0.001);
  });

  test("titik tunggal tidak membuat pembagian nol", () => {
    const p = projector({ minLat: -8.45, maxLat: -8.45, minLng: 115.6, maxLng: 115.6 }, 800, 400);
    const r = p(-8.45, 115.6);
    assert.ok(Number.isFinite(r.x) && Number.isFinite(r.y));
  });
});
