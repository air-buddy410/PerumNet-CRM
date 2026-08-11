import { test, describe, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { db, actor, tag, approvedTermination, ensureMasterData, resetTransactionalData } from "./fixtures";
import { assignRecovery, pickupDevices, loadRecoveryList, loadRecoveryDetail } from "@/lib/device-recovery";
import { PERMISSIONS } from "@/lib/constants";

// Fase 40 — pembatasan visibilitas ditegakkan di service layer, bukan di
// halaman. Yang diuji: teknisi tidak bisa menembus lewat URL detail, dan
// pencarian serial benar-benar menemukan perangkat.

const TECH_PERMS = new Set([PERMISSIONS.RECOVERY_PICKUP, PERMISSIONS.INVENTORY_VIEW]);
const COORD_PERMS = new Set([PERMISSIONS.RECOVERY_ASSIGN, PERMISSIONS.INVENTORY_VIEW]);

describe("pembatasan akses penarikan (Fase 40)", () => {
  before(async () => { await resetTransactionalData(); await ensureMasterData(); });
  beforeEach(async () => { await resetTransactionalData(); await ensureMasterData(); });
  after(async () => { await resetTransactionalData(); await db.$disconnect(); });

  test("teknisi lain TIDAK bisa membuka detail lewat URL", async () => {
    const s = await approvedTermination({ label: tag("SC") });
    await assignRecovery(s.cs, s.recoveryId, s.manager.id, new Date());

    const ditugaskan = actor(s.manager.id, "Teknisi Ditugaskan", { permissions: TECH_PERMS });
    const orangLain = actor("teknisi-lain", "Teknisi Lain", { permissions: TECH_PERMS });

    assert.ok(await loadRecoveryDetail(ditugaskan, s.recoveryId), "yang ditugaskan boleh");
    assert.equal(
      await loadRecoveryDetail(orangLain, s.recoveryId),
      null,
      "yang tidak ditugaskan ditolak — bukan sekadar disembunyikan dari daftar"
    );
  });

  test("koordinator tetap bisa membuka penarikan siapa pun", async () => {
    const s = await approvedTermination({ label: tag("SC") });
    await assignRecovery(s.cs, s.recoveryId, s.manager.id, new Date());
    const koordinator = actor("koor", "Koordinator", { permissions: COORD_PERMS });
    assert.ok(await loadRecoveryDetail(koordinator, s.recoveryId));
  });

  test("daftar teknisi hanya memuat tugasnya sendiri", async () => {
    const a = await approvedTermination({ label: tag("SC") });
    const b = await approvedTermination({ label: tag("SC") });
    await assignRecovery(a.cs, a.recoveryId, a.manager.id, new Date());
    await assignRecovery(b.cs, b.recoveryId, b.manager.id, new Date());
    // Tugas kedua dialihkan ke orang lain.
    await db.deviceRecoveryIssue.update({
      where: { id: b.recoveryId },
      data: { assigneeId: null },
    });
    await db.workOrder.updateMany({
      where: { deviceRecovery: { id: b.recoveryId } },
      data: { technicianId: null },
    });

    const tech = actor(a.manager.id, "Teknisi", { permissions: TECH_PERMS });
    const list = await loadRecoveryList(tech);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, a.recoveryId);
  });

  test("penarikan yang belum ditugaskan tidak muncul bagi teknisi", async () => {
    const s = await approvedTermination({ label: tag("SC") });
    const tech = actor("teknisi-bebas", "Teknisi", { permissions: TECH_PERMS });
    assert.equal((await loadRecoveryList(tech)).length, 0);
    assert.equal(await loadRecoveryDetail(tech, s.recoveryId), null);
  });

  test("id yang tidak ada mengembalikan null, bukan galat", async () => {
    const koordinator = actor("koor", "Koordinator", { permissions: COORD_PERMS });
    assert.equal(await loadRecoveryDetail(koordinator, "tidak-ada"), null);
  });

  describe("pencarian (FR-UI-001)", () => {
    test("menemukan lewat serial di catatan", async () => {
      const s = await approvedTermination({ label: tag("SC"), devices: [{ serial: "SN-CARI-1" }] });
      const koor = actor("koor", "Koordinator", { permissions: COORD_PERMS });
      const hasil = await loadRecoveryList(koor, { query: "SN-CARI-1" });
      assert.equal(hasil.length, 1);
      assert.equal(hasil[0].id, s.recoveryId);
    });

    test("menemukan lewat serial yang DITEMUKAN di lapangan", async () => {
      // Perangkat tertukar justru yang paling sering dicari orang.
      const s = await approvedTermination({ label: tag("SC"), devices: [{ serial: "SN-ASLI" }] });
      await assignRecovery(s.cs, s.recoveryId, s.manager.id, new Date());
      await pickupDevices(s.cs, s.recoveryId, [
        { itemId: s.itemRows[0].id, actualSerial: "SN-TERTUKAR", mismatchNote: "casing tertukar" },
      ]);

      const koor = actor("koor", "Koordinator", { permissions: COORD_PERMS });
      const hasil = await loadRecoveryList(koor, { query: "SN-TERTUKAR" });
      assert.equal(hasil.length, 1, "serial lapangan ikut dicari, bukan hanya snapshot");
    });

    test("menemukan lewat nama pelanggan dan nomor penarikan", async () => {
      const s = await approvedTermination({ label: tag("SC") });
      const dri = await db.deviceRecoveryIssue.findUnique({ where: { id: s.recoveryId } });
      const koor = actor("koor", "Koordinator", { permissions: COORD_PERMS });

      assert.equal((await loadRecoveryList(koor, { query: dri!.recoveryNumber })).length, 1);
      assert.equal((await loadRecoveryList(koor, { query: "Pelanggan" })).length >= 1, true);
    });

    test("pencarian tidak menembus pembatasan teknisi", async () => {
      // Kalau pencarian mengabaikan pagar, ia menjadi jalan memutar.
      const s = await approvedTermination({ label: tag("SC"), devices: [{ serial: "SN-RAHASIA" }] });
      const orangLain = actor("teknisi-lain", "Teknisi Lain", { permissions: TECH_PERMS });
      assert.equal((await loadRecoveryList(orangLain, { query: "SN-RAHASIA" })).length, 0);
    });
  });
});
