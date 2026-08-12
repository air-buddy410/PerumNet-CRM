import { test, describe, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import {
  db,
  actor,
  tag,
  approvedTermination,
  makeUser,
  ensureMasterData,
  resetTransactionalData,
} from "./fixtures";
import {
  assignRecovery,
  recordAttempt,
  pickupDevices,
  confirmPhysicalDisconnect,
  signRecoveryPickup,
  saveRecoverySignatureImage,
  attachRecoveryEvidence,
} from "@/lib/device-recovery";
import { PERMISSIONS } from "@/lib/constants";

// Fase 48 — cakupan teknisi pada jalur TULIS.
//
// Fase 40 menutup jalur BACA: teknisi tidak bisa membuka penarikan orang lain.
// Jalur tulis ternyata masih terbuka sepenuhnya — memegang izin
// `device_recovery.pickup` sudah cukup untuk mencatat kunjungan, menarik
// perangkat, memutus port ODP, dan membubuhkan tanda tangan pada penarikan
// milik teknisi lain, hanya dengan tahu id-nya.
//
// Setiap tes di bawah menguji SATU jalur tulis. Ditulis satu per satu, bukan
// digabung, supaya kalau kelak ada jalur yang kehilangan pemeriksaannya,
// yang gagal menunjuk persis jalur mana.

const TECH_PERMS = new Set([PERMISSIONS.RECOVERY_PICKUP, PERMISSIONS.INVENTORY_VIEW]);
const COORD_PERMS = new Set([
  PERMISSIONS.RECOVERY_ASSIGN,
  PERMISSIONS.RECOVERY_PICKUP,
  PERMISSIONS.INVENTORY_VIEW,
]);

/** Berkas PNG sah sekecil mungkin — magic byte-nya diperiksa saveAttachment. */
function pngFile(name = "ttd.png"): File {
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415478da6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
    "hex"
  );
  return new File([new Uint8Array(png)], name, { type: "image/png" });
}

describe("cakupan teknisi pada jalur tulis (Fase 48)", () => {
  before(async () => {
    await resetTransactionalData();
    await ensureMasterData();
  });
  beforeEach(async () => {
    await resetTransactionalData();
    await ensureMasterData();
  });
  after(async () => {
    await resetTransactionalData();
    await db.$disconnect();
  });

  /**
   * Penarikan yang sudah ditugaskan, plus dua aktor: pemiliknya dan orang lain.
   *
   * "Orang lain" WAJIB user sungguhan. Dengan id karangan, jalur tulis yang
   * lolos pemeriksaan cakupan akan tersandung foreign key sebelum sempat
   * berhasil — dan tes penolakan jadi hijau tanpa menguji aturannya sama
   * sekali. Persis itu yang terjadi pada tes pickupDevices sampai dijalankan
   * terhadap kode sebelum perbaikan.
   */
  async function tugasTerpasang() {
    const s = await approvedTermination({ label: tag("WS") });
    await assignRecovery(s.cs, s.recoveryId, s.manager.id, new Date());
    const lain = await makeUser(tag("lain").toLowerCase(), "Teknisi Lain");
    return {
      ...s,
      pemilik: actor(s.manager.id, "Teknisi Ditugaskan", { permissions: TECH_PERMS }),
      orangLain: actor(lain.id, lain.username, { permissions: TECH_PERMS }),
    };
  }

  test("recordAttempt: teknisi lain DITOLAK", async () => {
    const s = await tugasTerpasang();
    const r = await recordAttempt(s.orangLain, s.recoveryId, {
      result: "BERHASIL",
      note: "seolah saya yang datang",
    });
    assert.equal(r.ok, false);
    const jumlah = await db.deviceRecoveryAttempt.count({ where: { recoveryId: s.recoveryId } });
    assert.equal(jumlah, 0, "tidak boleh ada catatan kunjungan yang tertulis");
  });

  test("recordAttempt: teknisi yang ditugaskan tetap bisa", async () => {
    // Pasangan wajib dari setiap tes penolakan: memastikan yang ditutup
    // memang hanya jalur orang lain, bukan fiturnya secara keseluruhan.
    const s = await tugasTerpasang();
    const r = await recordAttempt(s.pemilik, s.recoveryId, {
      result: "BERHASIL",
      note: "kunjungan sah",
    });
    assert.equal(r.ok, true, r.ok ? "" : r.error);
  });

  test("pickupDevices: teknisi lain DITOLAK — custody tidak berpindah", async () => {
    const s = await tugasTerpasang();
    const items = await db.deviceRecoveryItem.findMany({ where: { recoveryId: s.recoveryId } });
    assert.equal(items.length > 0, true);

    // Serial DIISI BENAR dengan sengaja. Tanpa itu penarikan ditolak karena
    // serial kosong, bukan karena cakupan — dan tes ini akan lulus tanpa
    // menguji apa pun. Ketahuan saat dijalankan terhadap kode sebelum
    // perbaikan: ia satu-satunya yang tetap hijau padahal lubangnya terbuka.
    const r = await pickupDevices(s.orangLain, s.recoveryId, [
      { itemId: items[0].id, actualSerial: items[0].snapshotSerial ?? "SN-UJI" },
    ]);
    assert.equal(r.ok, false);
    const after = await db.deviceRecoveryItem.findUnique({ where: { id: items[0].id } });
    assert.equal(after!.status, "RECOVERY_PENDING", "status perangkat tidak boleh berubah");
  });

  test("pickupDevices: teknisi yang ditugaskan tetap bisa", async () => {
    const s = await tugasTerpasang();
    const items = await db.deviceRecoveryItem.findMany({ where: { recoveryId: s.recoveryId } });
    // Serial yang ditemukan di lapangan memang wajib — aturan lama, bukan
    // bagian dari perubahan ini.
    const r = await pickupDevices(s.pemilik, s.recoveryId, [
      { itemId: items[0].id, actualSerial: items[0].snapshotSerial ?? "SN-UJI" },
    ]);
    assert.equal(r.ok, true, r.ok ? "" : r.error);
  });

  test("confirmPhysicalDisconnect: teknisi lain DITOLAK — port ODP tidak dilepas", async () => {
    // Yang paling berkonsekuensi: aksi ini memutus sambungan pelanggan.
    const s = await tugasTerpasang();
    const r = await confirmPhysicalDisconnect(s.orangLain, s.recoveryId);
    assert.equal(r.ok, false);
  });

  test("signRecoveryPickup: teknisi lain DITOLAK — tidak ada tanda tangan tertulis", async () => {
    const s = await tugasTerpasang();
    const r = await signRecoveryPickup(s.orangLain, s.recoveryId, "TECHNICIAN", "Orang Lain");
    assert.equal(r.ok, false);
    const jumlah = await db.documentSignature.count({ where: { docId: s.recoveryId } });
    assert.equal(jumlah, 0);
  });

  test("signRecoveryPickup: teknisi yang ditugaskan tetap bisa", async () => {
    const s = await tugasTerpasang();
    const r = await signRecoveryPickup(s.pemilik, s.recoveryId, "TECHNICIAN", "Teknisi Sah");
    assert.equal(r.ok, true, r.ok ? "" : r.error);
  });

  test("attachRecoveryEvidence: teknisi lain DITOLAK melampirkan pada kunjungan orang lain", async () => {
    const s = await tugasTerpasang();
    const dicatat = await recordAttempt(s.pemilik, s.recoveryId, {
      result: "BERHASIL",
      note: "kunjungan sah",
    });
    assert.equal(dicatat.ok, true);

    const r = await attachRecoveryEvidence(s.orangLain, "ATTEMPT", (dicatat as { id: string }).id, pngFile("bukti.png"));
    assert.equal(r.ok, false);
    const lampiran = await db.attachment.count({ where: { entityType: "DeviceRecoveryAttempt" } });
    assert.equal(lampiran, 0);
  });

  test("pesan penolakan sama dengan 'tidak ditemukan' — id tidak bocor", async () => {
    // Membedakan "tidak ada" dari "bukan milikmu" memberi tahu penebak id
    // bahwa penarikan itu memang ada.
    const s = await tugasTerpasang();
    const ditolak = await recordAttempt(s.orangLain, s.recoveryId, { result: "BERHASIL" });
    const tidakAda = await recordAttempt(s.orangLain, "id-yang-tidak-ada", { result: "BERHASIL" });
    assert.equal(ditolak.ok, false);
    assert.equal(tidakAda.ok, false);
    assert.equal(
      (ditolak as { error: string }).error,
      (tidakAda as { error: string }).error
    );
  });

  test("koordinator tetap bisa menulis pada penarikan siapa pun", async () => {
    // Fase 40 sengaja hanya mempersempit TEKNISI MURNI. Gudang, koordinator,
    // dan management tidak boleh ikut kehilangan akses.
    const s = await tugasTerpasang();
    // User sungguhan: attempt menyimpan byUserId yang berelasi ke User.
    const koorUser = await makeUser(tag("koor").toLowerCase(), "Koordinator");
    const koordinator = actor(koorUser.id, koorUser.username, { permissions: COORD_PERMS });
    const r = await recordAttempt(koordinator, s.recoveryId, {
      result: "TIDAK_DI_TEMPAT",
      note: "pelanggan tidak di rumah",
    });
    assert.equal(r.ok, true, r.ok ? "" : r.error);
  });
});

describe("unggah gambar tanda tangan (Fase 48)", () => {
  before(async () => {
    await resetTransactionalData();
    await ensureMasterData();
  });
  after(async () => {
    await resetTransactionalData();
    await db.$disconnect();
  });

  test("mengembalikan attachmentId yang bisa dipakai signRecoveryPickup", async () => {
    const s = await approvedTermination({ label: tag("SG") });
    await assignRecovery(s.cs, s.recoveryId, s.manager.id, new Date());
    const tech = actor(s.manager.id, "Teknisi", { permissions: TECH_PERMS });

    const uploaded = await saveRecoverySignatureImage(tech, s.recoveryId, pngFile());
    assert.equal(uploaded.ok, true, uploaded.ok ? "" : uploaded.error);

    const signed = await signRecoveryPickup(
      tech,
      s.recoveryId,
      "CUSTOMER",
      "Pak Budi",
      (uploaded as { id: string }).id
    );
    assert.equal(signed.ok, true, signed.ok ? "" : signed.error);

    const sig = await db.documentSignature.findFirst({ where: { docId: s.recoveryId, role: "CUSTOMER" } });
    assert.equal(sig!.attachmentId, (uploaded as { id: string }).id);
  });

  test("lampirannya berjangkar pada PENARIKAN, bukan pada perangkat", async () => {
    const att = await db.attachment.findFirst({ where: { entityType: "DeviceRecoverySignature" } });
    assert.notEqual(att, null, "entityType harus DeviceRecoverySignature agar izin penyajiannya jelas");
  });

  test("gambar tetap OPSIONAL — tanda tangan tanpa gambar tetap sah", async () => {
    // Nama penanda tangan satu-satunya yang wajib: itulah yang masih terbaca
    // bertahun-tahun kemudian saat berkas gambarnya tidak bisa dibuka lagi.
    const s = await approvedTermination({ label: tag("SG") });
    await assignRecovery(s.cs, s.recoveryId, s.manager.id, new Date());
    const tech = actor(s.manager.id, "Teknisi", { permissions: TECH_PERMS });
    const r = await signRecoveryPickup(tech, s.recoveryId, "TECHNICIAN", "Teknisi Sah");
    assert.equal(r.ok, true, r.ok ? "" : r.error);
  });

  test("teknisi lain tidak bisa mengunggah tanda tangan ke penarikan orang lain", async () => {
    const s = await approvedTermination({ label: tag("SG") });
    await assignRecovery(s.cs, s.recoveryId, s.manager.id, new Date());
    const lain = await makeUser(tag("lain").toLowerCase(), "Teknisi Lain");
    const orangLain = actor(lain.id, lain.username, { permissions: TECH_PERMS });
    const r = await saveRecoverySignatureImage(orangLain, s.recoveryId, pngFile());
    assert.equal(r.ok, false);
  });

  test("berkas non-gambar ditolak mesin lampiran", async () => {
    const s = await approvedTermination({ label: tag("SG") });
    await assignRecovery(s.cs, s.recoveryId, s.manager.id, new Date());
    const tech = actor(s.manager.id, "Teknisi", { permissions: TECH_PERMS });
    const jahat = new File([new Uint8Array([60, 63, 112, 104, 112])], "ttd.php", {
      type: "application/x-php",
    });
    const r = await saveRecoverySignatureImage(tech, s.recoveryId, jahat);
    assert.equal(r.ok, false);
  });
});
