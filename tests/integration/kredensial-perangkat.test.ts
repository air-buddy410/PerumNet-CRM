import { test, describe, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { db, tag, makeUser, ensureMasterData, resetTransactionalData } from "./fixtures";
import {
  loadKredensial,
  pakaiKredensial,
  simpanKredensial,
  tandaiTerbukti,
  hapusKredensial,
} from "@/lib/kredensial-perangkat-service";
import { ENV_KUNCI } from "@/lib/rahasia-perangkat";

// Fase 89 — NOC menambah perangkat dari layar, bukan dari berkas .env.
//
// Aturan kriptonya sudah diuji tanpa basis data di `tests/unit/rahasia-perangkat`.
// Yang diuji DI SINI adalah hal-hal yang hanya muncul begitu basis data ikut
// bermain: urutan brankas-dulu-env-belakangan, sandi yang tidak boleh bocor ke
// layar, dan — yang paling penting — bahwa yang mendarat di kolom basis data
// memang bukan sandi aslinya.

const KUNCI_UJI = "a".repeat(64); // 32 byte hex; nilainya tidak rahasia, ini DB tes.

async function perangkat(label: string) {
  const site = await db.networkSite.create({
    data: { siteCode: `SITE-${label}`, name: `POP ${label}`, type: "POP", latitude: -8.6, longitude: 115.2 },
  });
  return db.networkDevice.create({
    data: { hostname: `olt-${label}`, deviceType: "OLT", siteId: site.id },
  });
}

describe("kredensial perangkat (Fase 89)", () => {
  let userId: string;
  let kunciAsli: string | undefined;

  before(async () => {
    // `tag()` itu penghitung per-proses, jadi ia mengulang angka yang sama
    // tiap kali suite dijalankan. Tanpa reset, jalankan KEDUA gagal karena
    // unique constraint — kegagalan yang menyesatkan, sebab kodenya benar.
    await resetTransactionalData();
    await ensureMasterData();
    const u = await makeUser(`kred-${tag("u")}`, "Penguji Kredensial");
    userId = u.id;
  });

  beforeEach(() => {
    kunciAsli = process.env[ENV_KUNCI];
    process.env[ENV_KUNCI] = KUNCI_UJI;
  });

  after(() => {
    if (kunciAsli === undefined) delete process.env[ENV_KUNCI];
    else process.env[ENV_KUNCI] = kunciAsli;
  });

  test("sandi yang tersimpan di basis data bukan sandi aslinya", async () => {
    const d = await perangkat(tag("segel"));
    const sandi = "R4hasi4-OLT-Kecicang";
    const hasil = await simpanKredensial(
      d.id,
      { protokol: "TELNET", port: null, username: "admin", sandi },
      userId
    );
    assert.equal(hasil.ok, true);

    // Dibaca MENTAH dari kolomnya — bukan lewat lapisan layanan, supaya tes ini
    // tetap jujur seandainya suatu hari lapisan itu diam-diam berhenti menyegel.
    const baris = await db.deviceCredential.findUniqueOrThrow({
      where: { networkDeviceId: d.id },
      select: { secretCipher: true, secretIv: true, secretTag: true, port: true },
    });
    const semuaKolom = `${baris.secretCipher}${baris.secretIv}${baris.secretTag}`;
    assert.ok(!semuaKolom.includes(sandi), "sandi tidak boleh muncul utuh di kolom mana pun");
    assert.ok(
      !Buffer.from(baris.secretCipher, "base64").toString("utf8").includes(sandi),
      "sandi tidak boleh muncul setelah cipher didekode base64"
    );
    assert.equal(baris.port, 23, "TELNET tanpa port eksplisit jatuh ke 23");
  });

  test("layar hanya menerima metadata; sandi tidak pernah ikut", async () => {
    const d = await perangkat(tag("tampil"));
    await simpanKredensial(
      d.id,
      { protokol: "SSH", port: null, username: "noc", sandi: "sandi-yang-panjang" },
      userId
    );

    const tampil = await loadKredensial(d.id);
    assert.equal(tampil.ada, true);
    assert.equal(tampil.sumber, "BRANKAS");
    assert.equal(tampil.protokol, "SSH");
    assert.equal(tampil.port, 22, "SSH tanpa port eksplisit jatuh ke 22");
    assert.equal(tampil.username, "noc");
    assert.equal(tampil.diperbaruiOleh, "Penguji Kredensial");

    // Bukan sekadar "tidak ada field sandi" — tidak boleh ada NILAI sandi itu
    // di mana pun dalam objek yang dikirim ke layar.
    assert.ok(
      !JSON.stringify(tampil).includes("sandi-yang-panjang"),
      "objek untuk layar tidak boleh memuat sandi dalam bentuk apa pun"
    );
  });

  test("pembaca perangkat mendapat sandi aslinya kembali", async () => {
    const d = await perangkat(tag("pakai"));
    await simpanKredensial(
      d.id,
      { protokol: "TELNET", port: 1024, username: "admin", sandi: "sandi:dengan:titikdua" },
      userId
    );

    const pakai = await pakaiKredensial(d.id);
    assert.equal(pakai.user, "admin");
    assert.equal(pakai.port, 1024);
    assert.equal(pakai.protokol, "TELNET");
    assert.equal(
      pakai.password,
      "sandi:dengan:titikdua",
      "titik dua di dalam sandi tidak boleh memotong sandinya — brankas bukan format user:password"
    );
  });

  test("brankas menang atas env var lama", async () => {
    const d = await perangkat(tag("menang"));
    const olt = await db.oltDevice.create({
      data: {
        networkDeviceId: d.id,
        vendor: "ZTE",
        managementIp: "127.0.0.1",
        credentialRef: "OLT_UJI_CRED",
        telnetPort: 23,
      },
    });
    process.env.OLT_UJI_CRED = "lama:sandilama";

    try {
      // Sebelum brankas diisi: env var yang dipakai.
      const sebelum = await pakaiKredensial(d.id);
      assert.equal(sebelum.user, "lama");
      assert.equal(sebelum.password, "sandilama");
      assert.equal((await loadKredensial(d.id)).sumber, "ENV");

      // Sesudah NOC mengisi dari layar: brankas yang dipakai, tanpa siapa pun
      // menyentuh .env. Ini inti Fase 89.
      await simpanKredensial(
        d.id,
        { protokol: "TELNET", port: null, username: "baru", sandi: "sandibaru" },
        userId
      );
      const sesudah = await pakaiKredensial(d.id);
      assert.equal(sesudah.user, "baru");
      assert.equal(sesudah.password, "sandibaru");
      assert.equal((await loadKredensial(d.id)).sumber, "BRANKAS");

      // Dan begitu brankasnya dikosongkan, env var lama kembali menopang —
      // jadi menghapus kredensial dari layar tidak mematikan OLT yang masih
      // berjalan lewat berkas.
      await hapusKredensial(d.id, userId);
      const kembali = await pakaiKredensial(d.id);
      assert.equal(kembali.user, "lama");
      assert.equal((await loadKredensial(d.id)).sumber, "ENV");
    } finally {
      delete process.env.OLT_UJI_CRED;
      await db.oltDevice.delete({ where: { id: olt.id } });
    }
  });

  test("mengganti sandi membatalkan bukti login yang lama", async () => {
    const d = await perangkat(tag("bukti"));
    await simpanKredensial(
      d.id,
      { protokol: "TELNET", port: null, username: "admin", sandi: "sandi-pertama" },
      userId
    );
    await tandaiTerbukti(d.id);
    assert.ok((await loadKredensial(d.id)).terakhirTerbukti, "uji login menandai waktunya");

    await simpanKredensial(
      d.id,
      { protokol: "TELNET", port: null, username: "admin", sandi: "sandi-kedua" },
      userId
    );
    assert.equal(
      (await loadKredensial(d.id)).terakhirTerbukti,
      null,
      "sandi berganti berarti bukti lama tidak lagi membuktikan apa pun"
    );
  });

  test("perangkat tanpa kredensial ditolak dengan sebab yang bisa ditindaklanjuti", async () => {
    const d = await perangkat(tag("kosong"));
    const tampil = await loadKredensial(d.id);
    assert.equal(tampil.ada, false);
    assert.equal(tampil.sumber, "BELUM ADA");

    await assert.rejects(
      () => pakaiKredensial(d.id),
      (e: Error) => {
        assert.match(e.message, /belum punya kredensial/i);
        assert.match(e.message, /layar/i, "pesannya harus menunjuk ke jalan keluarnya");
        return true;
      }
    );
  });

  test("masukan yang salah ditolak sebelum menyentuh basis data", async () => {
    const d = await perangkat(tag("tolak"));
    const kosong = await simpanKredensial(
      d.id,
      { protokol: "TELNET", port: null, username: "  ", sandi: "ada" },
      userId
    );
    assert.equal(kosong.ok, false);
    assert.equal(
      await db.deviceCredential.count({ where: { networkDeviceId: d.id } }),
      0,
      "masukan yang ditolak tidak boleh meninggalkan baris separuh jadi"
    );
  });

  test("perangkat yang tidak ada ditolak, bukan dibuatkan", async () => {
    const hasil = await simpanKredensial(
      "perangkat-yang-tidak-pernah-ada",
      { protokol: "TELNET", port: null, username: "admin", sandi: "apa saja" },
      userId
    );
    assert.equal(hasil.ok, false);
    if (!hasil.ok) assert.match(hasil.error, /tidak ditemukan/i);
  });

  test("tanpa kunci di env, menyimpan gagal terang-terangan — bukan menyimpan apa adanya", async () => {
    const d = await perangkat(tag("takada"));
    delete process.env[ENV_KUNCI];

    const hasil = await simpanKredensial(
      d.id,
      { protokol: "TELNET", port: null, username: "admin", sandi: "sandi-telanjang" },
      userId
    );
    assert.equal(hasil.ok, false, "tanpa kunci, jangan pernah menyimpan sandi mentah");
    if (!hasil.ok) {
      assert.ok(
        !hasil.error.includes("sandi-telanjang"),
        "pesan galat tidak boleh mengutip sandinya"
      );
    }
    assert.equal(await db.deviceCredential.count({ where: { networkDeviceId: d.id } }), 0);
  });
});
