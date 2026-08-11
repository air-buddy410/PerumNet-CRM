import { test, describe, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { db, actor, tag, makeUser, ensureMasterData, resetTransactionalData } from "./fixtures";
import { previewKmlImport, applyKmlImport } from "@/lib/ftth-kml";
import { PERMISSIONS } from "@/lib/constants";

// Fase 36 — impor multi-jenis. Yang dijaga paling ketat adalah keputusan D5:
// impor hanya MENGISI koordinat yang kosong, tidak pernah menimpa. Menimpa
// berarti hasil survei lama bisa memindahkan ODP produksi tanpa disadari.

function kml(body: string) {
  return `<?xml version="1.0"?><kml><Document>${body}</Document></kml>`;
}
function point(name: string, lng: number, lat: number) {
  return `<Placemark><name>${name}</name><Point><coordinates>${lng},${lat},0</coordinates></Point></Placemark>`;
}
function folder(name: string, inner: string) {
  return `<Folder><name>${name}</name>${inner}</Folder>`;
}

const SURVEY = kml(
  folder("POP", point("SPOP Abang", 115.1, -8.4)) +
    folder("MS", point("MS Abiansoan", 115.15, -8.45)) +
    folder("ODP", point("ABB 012405", 115.2, -8.5) + point("ABB 022404", 115.25, -8.55)) +
    folder("HOME PASS", point("Budi Santoso", 115.26, -8.56))
);

describe("impor KML/KMZ multi-jenis (Fase 36)", () => {
  before(async () => { await resetTransactionalData(); await ensureMasterData(); });
  beforeEach(async () => { await resetTransactionalData(); await ensureMasterData(); });
  after(async () => { await resetTransactionalData(); await db.$disconnect(); });

  async function importer() {
    const row = await makeUser(`kml-${tag("U")}`, "Petugas FTTH");
    return actor(row.id, "Petugas FTTH", {
      permissions: new Set([PERMISSIONS.FTTH_MANAGE]),
    });
  }

  test("jenis ditebak dari folder, bukan dari nama titik", async () => {
    const p = await previewKmlImport(SURVEY);
    const byName = new Map(p.rows.map((r) => [r.name, r]));
    assert.equal(byName.get("SPOP Abang")?.type, "POP");
    assert.equal(byName.get("MS Abiansoan")?.type, "MS");
    assert.equal(byName.get("ABB 012405")?.type, "ODP");
    assert.equal(byName.get("Budi Santoso")?.type, "CUSTOMER");
  });

  test("titik pelanggan DILEWATI dengan alasan, bukan masuk sebagai ODP", async () => {
    // Inilah bahaya yang ditemukan di Fase 35 dan ditutup di sini.
    const p = await previewKmlImport(SURVEY);
    const cust = p.rows.find((r) => r.name === "Budi Santoso")!;
    assert.equal(cust.action, "SKIP");
    assert.match(String(cust.note), /manual/i);
  });

  test("menerapkan impor membuat POP, MS, dan ODP di tempat yang benar", async () => {
    const user = await importer();
    const res = await applyKmlImport(user, SURVEY, {
      createMissing: true,
      defaultCapacity: 16,
    });
    assert.ok(res.ok, res.ok ? "" : res.error);
    // Berkas memuat 5 placemark: POP + MS + dua ODP + satu pelanggan.
    // Yang dibuat hanya empat; pelanggan dilewati.
    assert.equal(res.ok && res.data?.created, 4);
    assert.equal(res.ok && res.data?.skipped, 1, "tepat satu dilewati, yaitu pelanggan");

    const site = await db.networkSite.findFirst({ where: { siteCode: "SPOP Abang" } });
    assert.ok(site, "POP tersimpan sebagai NetworkSite");
    assert.equal(site!.type, "POP");

    const ms = await db.odp.findFirst({ where: { code: "MS Abiansoan" } });
    assert.equal(ms?.role, "MS", "MS tersimpan sebagai Odp berperan MS");
    assert.equal(ms?.parentId, null, "MS berada di puncak kaskade");

    const odp = await db.odp.findFirst({ where: { code: "ABB 012405" } });
    assert.equal(odp?.role, "ODP");
    assert.equal(odp?.portCapacity, 16);
    assert.equal(odp?.status, "PLANNED", "hasil survei belum tentu terpasang");

    assert.equal(await db.customer.count(), 0, "pelanggan tidak dibuat dari KML");
  });

  describe("D5 — hanya mengisi yang kosong", () => {
    test("koordinat yang SUDAH terisi tidak pernah ditimpa", async () => {
      const user = await importer();
      const existing = await db.odp.create({
        data: { code: "ABB 012405", portCapacity: 8, latitude: -8.9, longitude: 115.9 },
      });

      const p = await previewKmlImport(SURVEY);
      const row = p.rows.find((r) => r.name === "ABB 012405")!;
      assert.equal(row.action, "KEEP");
      assert.ok(row.moveMeters! > 1000, "selisihnya tetap dilaporkan");
      assert.match(String(row.note), /tidak diubah/i);

      await applyKmlImport(user, SURVEY, { createMissing: true, defaultCapacity: 16 });
      const after = await db.odp.findUnique({ where: { id: existing.id } });
      assert.equal(after!.latitude, -8.9, "lintang lama utuh");
      assert.equal(after!.longitude, 115.9, "bujur lama utuh");
    });

    test("koordinat yang KOSONG diisi", async () => {
      const user = await importer();
      const existing = await db.odp.create({
        data: { code: "ABB 022404", portCapacity: 8 },
      });

      const p = await previewKmlImport(SURVEY);
      assert.equal(p.rows.find((r) => r.name === "ABB 022404")?.action, "FILL");

      const res = await applyKmlImport(user, SURVEY, {
        createMissing: false,
        defaultCapacity: 16,
      });
      assert.ok(res.ok, res.ok ? "" : res.error);
      const after = await db.odp.findUnique({ where: { id: existing.id } });
      assert.equal(after!.latitude, -8.55);
      assert.equal(after!.longitude, 115.25);
    });

    test("kapasitas dan relasi TIDAK ikut disentuh saat mengisi koordinat", async () => {
      const user = await importer();
      const existing = await db.odp.create({
        data: { code: "ABB 022404", portCapacity: 32, status: "ACTIVE" },
      });
      await applyKmlImport(user, SURVEY, { createMissing: false, defaultCapacity: 16 });
      const after = await db.odp.findUnique({ where: { id: existing.id } });
      assert.equal(after!.portCapacity, 32, "kapasitas operasional tidak ditimpa");
      assert.equal(after!.status, "ACTIVE");
    });
  });

  test("titik tanpa folder dilewati kecuali jenisnya ditentukan", async () => {
    const user = await importer();
    const noFolder = kml(point("LEPAS-01", 115.3, -8.6));

    const skipped = await previewKmlImport(noFolder);
    assert.equal(skipped.rows[0].action, "SKIP");
    assert.equal(skipped.rows[0].type, "UNKNOWN");

    const chosen = await previewKmlImport(noFolder, { unknownAs: "ODP" });
    assert.equal(chosen.rows[0].action, "NEW");
    assert.equal(chosen.rows[0].type, "ODP");

    const res = await applyKmlImport(user, noFolder, {
      createMissing: true,
      defaultCapacity: 8,
      unknownAs: "ODP",
    });
    assert.ok(res.ok, res.ok ? "" : res.error);
    assert.ok(await db.odp.findFirst({ where: { code: "LEPAS-01" } }));
  });

  test("nama ganda di dalam berkas hanya diproses sekali", async () => {
    const user = await importer();
    const dup = kml(folder("ODP", point("SAMA", 115.1, -8.1) + point("SAMA", 115.2, -8.2)));
    const p = await previewKmlImport(dup);
    assert.equal(p.counts.new, 1);
    assert.equal(p.counts.duplicate, 1);

    await applyKmlImport(user, dup, { createMissing: true, defaultCapacity: 8 });
    assert.equal(await db.odp.count({ where: { code: "SAMA" } }), 1);
  });

  test("tanpa izin FTTH, impor ditolak", async () => {
    const row = await makeUser(`kml-noperm-${tag("U")}`, "Tanpa Izin");
    const nobody = actor(row.id, "Tanpa Izin", { permissions: new Set<string>() });
    const res = await applyKmlImport(nobody, SURVEY, {
      createMissing: true,
      defaultCapacity: 16,
    });
    assert.equal(res.ok, false);
    assert.equal(await db.odp.count(), 0);
  });

  test("createMissing=false tidak membuat apa pun", async () => {
    const user = await importer();
    const res = await applyKmlImport(user, SURVEY, {
      createMissing: false,
      defaultCapacity: 16,
    });
    assert.ok(res.ok, res.ok ? "" : res.error);
    assert.equal(await db.odp.count(), 0);
    assert.equal(await db.networkSite.count(), 0);
  });
});
