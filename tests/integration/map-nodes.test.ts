import { test, describe, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { db, tag, ensureMasterData, resetTransactionalData } from "./fixtures";
import { loadNetworkMap } from "@/lib/noc-map";
import { exportFtthKml, previewKmlImport } from "@/lib/ftth-kml";

// Fase 38 — POP dan MS/ODC ikut muncul di peta, dan ekspor mencakup seluruh
// jenis titik. Yang paling dijaga adalah perjalanan PULANG-PERGI: berkas yang
// kita ekspor harus bisa diimpor kembali dan dikenali sebagai jenis yang sama.
// Tanpa itu, ekspor hanya berguna untuk dilihat, bukan untuk dipertukarkan.

async function topology(label: string) {
  const site = await db.networkSite.create({
    data: {
      siteCode: `SPOP-${label}`,
      name: `POP ${label}`,
      type: "POP",
      latitude: -8.40,
      longitude: 115.10,
    },
  });
  const ms = await db.odp.create({
    data: {
      code: `MS-${label}`,
      role: "MS",
      portCapacity: 0,
      latitude: -8.45,
      longitude: 115.15,
    },
  });
  const odp = await db.odp.create({
    data: {
      code: `ODP-${label}`,
      role: "ODP",
      parentId: ms.id,
      portCapacity: 8,
      latitude: -8.50,
      longitude: 115.20,
    },
  });
  return { site, ms, odp };
}

describe("peta & ekspor seluruh jenis titik (Fase 38)", () => {
  before(async () => { await resetTransactionalData(); await ensureMasterData(); });
  beforeEach(async () => { await resetTransactionalData(); await ensureMasterData(); });
  after(async () => { await resetTransactionalData(); await db.$disconnect(); });

  test("POP ikut dirakit ke peta sebagai lapisan tersendiri", async () => {
    const t = await topology(tag("A"));
    const data = await loadNetworkMap();

    assert.equal(data.sites.length, 1);
    assert.equal(data.sites[0].code, t.site.siteCode);
    assert.equal(data.sites[0].type, "POP");
    // POP bukan simpul distribusi, jadi tidak ikut masuk daftar ODP.
    assert.ok(!data.odps.some((o) => o.code === t.site.siteCode));
  });

  test("MS dan ODP bisa dibedakan lewat peran", async () => {
    const t = await topology(tag("B"));
    const data = await loadNetworkMap();
    const byCode = new Map(data.odps.map((o) => [o.code, o]));
    assert.equal(byCode.get(t.ms.code)?.role, "MS");
    assert.equal(byCode.get(t.odp.code)?.role, "ODP");
  });

  test("kaskade MS → ODP tetap tergambar", async () => {
    const t = await topology(tag("C"));
    const data = await loadNetworkMap();
    assert.deepEqual(data.cascades, [{ fromId: t.odp.id, toId: t.ms.id }]);
  });

  test("POP ikut menentukan batas peta", async () => {
    // Kalau POP tidak dihitung, peta bisa memotong POP di pinggir wilayah.
    const t = await topology(tag("D"));
    const data = await loadNetworkMap();
    assert.ok(data.bounds);
    assert.ok(
      data.bounds!.maxLat >= t.site.latitude!,
      `batas atas ${data.bounds!.maxLat} harus mencakup POP di ${t.site.latitude}`
    );
  });

  test("peta tetap jalan meski belum ada POP sama sekali", async () => {
    await db.odp.create({
      data: { code: `ODP-${tag("E")}`, portCapacity: 4, latitude: -8.5, longitude: 115.2 },
    });
    const data = await loadNetworkMap();
    assert.deepEqual(data.sites, []);
    assert.equal(data.odps.length, 1);
  });

  describe("ekspor KML", () => {
    test("mencakup POP, MS, dan ODP, masing-masing di foldernya", async () => {
      const t = await topology(tag("F"));
      const xml = await exportFtthKml();

      assert.match(xml, /<Folder>\s*<name>POP<\/name>/);
      assert.match(xml, /<Folder>\s*<name>MS<\/name>/);
      assert.match(xml, /<Folder>\s*<name>ODP<\/name>/);
      for (const code of [t.site.siteCode, t.ms.code, t.odp.code]) {
        assert.ok(xml.includes(code), `${code} ada di berkas`);
      }
    });

    test("titik tanpa koordinat tidak ikut diekspor", async () => {
      await topology(tag("G"));
      await db.odp.create({ data: { code: "TANPA-KOORDINAT", portCapacity: 4 } });
      const xml = await exportFtthKml();
      assert.ok(!xml.includes("TANPA-KOORDINAT"));
    });
  });

  describe("pulang-pergi: ekspor lalu impor kembali", () => {
    test("jenis titik dikenali sama persis setelah diimpor ulang", async () => {
      const t = await topology(tag("H"));
      const xml = await exportFtthKml();

      const preview = await previewKmlImport(xml);
      const byName = new Map(preview.rows.map((r) => [r.name, r]));

      assert.equal(byName.get(t.site.siteCode)?.type, "POP", "POP kembali sebagai POP");
      assert.equal(byName.get(t.ms.code)?.type, "MS", "MS kembali sebagai MS");
      assert.equal(byName.get(t.odp.code)?.type, "ODP", "ODP kembali sebagai ODP");

      // Tidak ada satu pun yang jatuh ke "belum ditentukan" — itulah gunanya
      // folder pada berkas ekspor.
      assert.equal(preview.counts.skip, 0);
    });

    test("impor ulang tidak mengubah apa pun (D5)", async () => {
      const t = await topology(tag("I"));
      const xml = await exportFtthKml();
      const preview = await previewKmlImport(xml);

      // Semuanya sudah berkoordinat, jadi seluruhnya KEEP.
      assert.equal(preview.counts.keep, 3);
      assert.equal(preview.counts.new, 0);
      assert.equal(preview.counts.fill, 0);

      // Dan jaraknya nol, karena koordinatnya memang sama.
      for (const row of preview.rows) {
        assert.equal(row.moveMeters, 0, `${row.name} tidak bergeser`);
      }

      const after = await db.odp.findUnique({ where: { id: t.odp.id } });
      assert.equal(after!.latitude, -8.5);
    });
  });
});
