import { test, describe, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { db, tag, approvedTermination, ensureMasterData, resetTransactionalData, onHandOf } from "./fixtures";
import {
  assignRecovery,
  recordAttempt,
  pickupDevices,
  receiveDevices,
  inspectDevice,
  markNotReturned,
  confirmPhysicalDisconnect,
  attachRecoveryEvidence,
} from "@/lib/device-recovery";

// Invariant §6 rencana implementasi. Kalau salah satu bocor, akibatnya bukan
// tampilan yang salah: barang rusak masuk stok siap pakai, atau port ODP
// dijual ke pelanggan lain padahal kabelnya masih tersambung.

const CHECKLIST = {
  casing: true, boot: true, reset: true, lan: true, wifi: true, optical: true, accessories: true,
};
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(48).fill(0)]);
const photo = (name = "bukti.png") => new File([new Uint8Array(PNG)], name, { type: "image/png" });

/** Membawa satu skenario sampai perangkatnya berada di karantina gudang. */
async function untilQuarantined(label: string) {
  const s = await approvedTermination({ label });
  const row = s.itemRows[0];
  await assignRecovery(s.cs, s.recoveryId, s.manager.id, new Date());
  await pickupDevices(s.cs, s.recoveryId, [
    { itemId: row.id, actualSerial: row.snapshotSerial },
  ]);
  await receiveDevices(s.cs, s.recoveryId, [row.id]);
  return { s, row };
}

describe("penarikan & inspeksi perangkat", () => {
  before(async () => { await resetTransactionalData(); await ensureMasterData(); });
  beforeEach(async () => { await resetTransactionalData(); await ensureMasterData(); });
  after(async () => { await resetTransactionalData(); await db.$disconnect(); });

  test("perangkat yang ditarik masuk custody teknisi, BUKAN stok gudang", async () => {
    const s = await approvedTermination({ label: tag("PICK") });
    const row = s.itemRows[0];
    await assignRecovery(s.cs, s.recoveryId, s.manager.id, new Date());
    const picked = await pickupDevices(s.cs, s.recoveryId, [
      { itemId: row.id, actualSerial: row.snapshotSerial },
    ]);
    assert.ok(picked.ok, picked.ok ? "" : picked.error);

    const device = await db.serializedDevice.findUnique({ where: { id: row.deviceId } });
    assert.equal(device!.status, "RETURN_IN_TRANSIT");
    assert.equal(device!.custodianId, s.manager.id);
    assert.equal(device!.warehouseId, null);
    assert.equal(await onHandOf(s.itemId, s.warehouseId), 0, "stok gudang belum bertambah");
  });

  test("penerimaan gudang masuk KARANTINA dan tidak menambah stok tersedia", async () => {
    const { s, row } = await untilQuarantined(tag("QRT"));
    const device = await db.serializedDevice.findUnique({ where: { id: row.deviceId } });
    assert.equal(device!.status, "QUARANTINED");
    assert.equal(await onHandOf(s.itemId, s.warehouseId), 0, "karantina TIDAK menambah stok");
  });

  test("hanya LAYAK_DIGUNAKAN yang menambah stok, dan selalu sebagai SECOND", async () => {
    const { s, row } = await untilQuarantined(tag("FIT"));
    await attachRecoveryEvidence(s.cs, "INSPECTION", row.id, photo());
    const done = await inspectDevice(s.cs, row.id, {
      checklist: CHECKLIST,
      decision: "LAYAK_DIGUNAKAN",
      note: "semua fungsi normal",
    });
    assert.ok(done.ok, done.ok ? "" : done.error);

    const device = await db.serializedDevice.findUnique({ where: { id: row.deviceId } });
    assert.equal(device!.status, "AVAILABLE");
    assert.equal(device!.condition, "SECOND", "tidak pernah kembali jadi barang baru");
    assert.equal(await onHandOf(s.itemId, s.warehouseId), 1);

    const posted = await db.stockTransaction.count({ where: { status: "POSTED", type: "STOCK_RETURN" } });
    assert.equal(posted, 1, "saldo berubah lewat transaksi yang diposting");
  });

  test("keputusan RUSAK tidak menambah stok tersedia", async () => {
    const { s, row } = await untilQuarantined(tag("BAD"));
    await attachRecoveryEvidence(s.cs, "INSPECTION", row.id, photo());
    const done = await inspectDevice(s.cs, row.id, {
      checklist: { ...CHECKLIST, boot: false },
      decision: "RUSAK",
      note: "tidak menyala",
    });
    assert.ok(done.ok, done.ok ? "" : done.error);

    const device = await db.serializedDevice.findUnique({ where: { id: row.deviceId } });
    assert.equal(device!.status, "DAMAGED");
    assert.equal(await onHandOf(s.itemId, s.warehouseId), 0, "barang rusak tidak masuk stok siap pakai");
    const level = await db.stockLevel.findUnique({
      where: { itemId_warehouseId: { itemId: s.itemId, warehouseId: s.warehouseId } },
    });
    assert.equal(level?.damaged, 1, "tercatat di dimensi rusak");
  });

  test("keputusan final wajib berbukti foto", async () => {
    const { s, row } = await untilQuarantined(tag("PHOTO"));
    const tanpa = await inspectDevice(s.cs, row.id, {
      checklist: CHECKLIST,
      decision: "LAYAK_DIGUNAKAN",
      note: "tanpa foto",
    });
    assert.equal(tanpa.ok, false);
    assert.match(tanpa.ok ? "" : tanpa.error, /foto/i);
    assert.equal(await onHandOf(s.itemId, s.warehouseId), 0, "penolakan tidak menyentuh stok");
  });

  test("SCRAP butuh izin tersendiri", async () => {
    const { s, row } = await untilQuarantined(tag("SCRAP"));
    await attachRecoveryEvidence(s.cs, "INSPECTION", row.id, photo());
    const tanpaIzin = { ...s.cs, permissions: new Set([...s.cs.permissions].filter((p) => p !== "device_recovery.dispose")) };
    const ditolak = await inspectDevice(tanpaIzin, row.id, {
      checklist: CHECKLIST,
      decision: "SCRAP",
      note: "hancur",
    });
    assert.equal(ditolak.ok, false);
    assert.match(ditolak.ok ? "" : ditolak.error, /dispose/i);
  });

  test("port ODP hanya dilepas setelah pemutusan fisik dikonfirmasi", async () => {
    const s = await approvedTermination({ label: tag("ODP") });
    const odp = await db.odp.create({
      data: { code: `ODP-${tag("X")}`, portCapacity: 8 },
    });
    const port = await db.odpPort.create({
      data: { odpId: odp.id, portNumber: 1, subscriptionId: s.subscriptionId, status: "USED" },
    });

    // Terminasi diberlakukan — layanan berhenti, tapi port belum boleh lepas.
    const row = s.itemRows[0];
    await assignRecovery(s.cs, s.recoveryId, s.manager.id, new Date());
    await pickupDevices(s.cs, s.recoveryId, [{ itemId: row.id, actualSerial: row.snapshotSerial }]);
    let after = await db.odpPort.findUnique({ where: { id: port.id } });
    assert.equal(after!.subscriptionId, s.subscriptionId, "port masih terikat sebelum konfirmasi");
    assert.equal(after!.status, "USED");

    const confirmed = await confirmPhysicalDisconnect(s.cs, s.recoveryId);
    assert.ok(confirmed.ok, confirmed.ok ? "" : confirmed.error);
    after = await db.odpPort.findUnique({ where: { id: port.id } });
    assert.equal(after!.subscriptionId, null, "baru dilepas setelah dikonfirmasi");
    assert.equal(after!.status, "FREE");
  });

  test("vonis tidak kembali menuntut SLA terlewat DAN percobaan cukup", async () => {
    const s = await approvedTermination({ label: tag("LOST") });
    const row = s.itemRows[0];
    await assignRecovery(s.cs, s.recoveryId, s.manager.id, new Date());

    const terlaluDini = await markNotReturned(s.manager, row.id, "menyerah");
    assert.equal(terlaluDini.ok, false);
    assert.match(terlaluDini.ok ? "" : terlaluDini.error, /belum terlewat/i);

    await db.deviceRecoveryIssue.update({
      where: { id: s.recoveryId },
      data: { slaDueAt: new Date(Date.now() - 86_400_000) },
    });
    const percobaanKurang = await markNotReturned(s.manager, row.id, "menyerah");
    assert.equal(percobaanKurang.ok, false);
    assert.match(percobaanKurang.ok ? "" : percobaanKurang.error, /minimal 3/i);

    for (const n of ["kunjungan 1", "kunjungan 2", "kunjungan 3"]) {
      await recordAttempt(s.cs, s.recoveryId, { result: "TIDAK_DI_TEMPAT", note: n });
    }
    const vonis = await markNotReturned(s.manager, row.id, "tiga kali gagal");
    assert.ok(vonis.ok, vonis.ok ? "" : vonis.error);

    const device = await db.serializedDevice.findUnique({ where: { id: row.deviceId } });
    assert.equal(device!.status, "LOST");
    const dri = await db.deviceRecoveryIssue.findUnique({ where: { id: s.recoveryId } });
    assert.equal(dri!.status, "CLOSED_UNRECOVERED", "tidak ada yang kembali");
  });

  test("penarikan sebagian menyisakan surat tetap terbuka", async () => {
    const s = await approvedTermination({
      label: tag("PART"),
      devices: [{ serial: "SN-P1" }, { serial: "SN-P2" }],
    });
    await assignRecovery(s.cs, s.recoveryId, s.manager.id, new Date());
    const satu = s.itemRows[0];
    await pickupDevices(s.cs, s.recoveryId, [{ itemId: satu.id, actualSerial: satu.snapshotSerial }]);

    const dri = await db.deviceRecoveryIssue.findUnique({ where: { id: s.recoveryId } });
    assert.equal(dri!.status, "PARTIAL");
    const sisa = await db.deviceRecoveryItem.findFirst({
      where: { recoveryId: s.recoveryId, status: "RECOVERY_PENDING" },
    });
    assert.ok(sisa, "perangkat kedua tetap terpantau");
  });

  test("serial berbeda di lapangan wajib berketerangan", async () => {
    const s = await approvedTermination({ label: tag("MISS") });
    const row = s.itemRows[0];
    await assignRecovery(s.cs, s.recoveryId, s.manager.id, new Date());
    const tanpaKeterangan = await pickupDevices(s.cs, s.recoveryId, [
      { itemId: row.id, actualSerial: "SN-TERTUKAR" },
    ]);
    assert.equal(tanpaKeterangan.ok, false);
    assert.match(tanpaKeterangan.ok ? "" : tanpaKeterangan.error, /keterangan wajib/i);

    const dengan = await pickupDevices(s.cs, s.recoveryId, [
      { itemId: row.id, actualSerial: "SN-TERTUKAR", mismatchNote: "casing tertukar saat instalasi" },
    ]);
    assert.ok(dengan.ok, dengan.ok ? "" : dengan.error);
    const item = await db.deviceRecoveryItem.findUnique({ where: { id: row.id } });
    assert.equal(item!.actualSerial, "SN-TERTUKAR");
    assert.match(String(item!.mismatchNote), /tertukar/);
  });
});
