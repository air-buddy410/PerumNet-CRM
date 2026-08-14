import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { db, makeUser, tag, ensureMasterData, resetTransactionalData } from "./fixtures";
import { loadEmployeeCards, newCardToken, cardAppUrl } from "@/lib/employee-card-service";

/** NODE_ENV bertipe hanya-baca di tipe Node; tesnya memang perlu menggesernya. */
const env_ = (e: NodeJS.ProcessEnv) => e as Record<string, string | undefined>;

// QR kartu pegawai sampai ke halaman (Fase 61).
//
// Mesin pembangkit QR sudah ada sejak Fase 50, tetapi TIDAK ADA yang
// memanggilnya: `loadEmployeeCards()` tidak pernah mengembalikan `qrSvg`,
// sehingga halaman cetak selamanya menampilkan "QR verifikasi resmi belum
// tersedia dari loader backend" dan tombol Print tidak pernah menyala.
//
// Kelas kegagalan yang sama dengan penjadwal Fase 27: seluruh mesin jadi dan
// teruji, tetapi tidak ada yang menyalakannya. Tes di sini menjaga
// SAMBUNGANNYA, bukan pembangkitnya.

describe("QR kartu pegawai", () => {
  let employeeId: string;
  let hrdId: string;

  before(async () => {
    await resetTransactionalData();
    await ensureMasterData();
    const hrd = await makeUser(tag("hrdqr").toLowerCase(), "HRD");
    hrdId = hrd.id;
    const emp = await db.employee.create({
      data: {
        employeeNo: "10009101",
        fullName: "Pemegang Kartu QR",
        jobTitle: "Teknisi",
        employeeType: "FULL_TIME",
        joinedAt: new Date("2026-01-06"),
      },
    });
    employeeId = emp.id;
  });
  after(async () => {
    await resetTransactionalData();
    await db.$disconnect();
  });

  async function buatKartu(over: Partial<{ status: string; expiresAt: Date | null }> = {}) {
    return db.employeeCard.create({
      data: {
        employeeId,
        cardNumber: `CARD-${tag("Q")}`,
        publicToken: newCardToken(),
        issuedById: hrdId,
        status: over.status ?? "ACTIVE",
        expiresAt: over.expiresAt === undefined ? null : over.expiresAt,
      },
    });
  }

  test("kartu berlaku PUNYA QR — inilah yang dulu tidak pernah terisi", async () => {
    await buatKartu();
    const [kartu] = await loadEmployeeCards(employeeId);
    assert.notEqual(kartu.qrSvg, null, "loader wajib mengisi qrSvg");
    assert.match(kartu.qrSvg!, /^<svg\b/, "harus SVG siap tempel");
    assert.equal(kartu.qrSvg!.length > 200, true, "SVG terlalu pendek untuk sebuah QR");
  });

  test("TOKEN TIDAK PERNAH IKUT KELUAR — hanya gambarnya", async () => {
    // Inti keamanannya. publicToken adalah kunci verifikasi publik; begitu ia
    // sampai ke peramban, ia ikut muncul di riwayat, ekstensi, dan tangkapan
    // layar. Membuat QR di server berarti kuncinya tidak pernah keluar.
    const kartu = await db.employeeCard.findFirstOrThrow({ where: { employeeId } });
    const [dimuat] = await loadEmployeeCards(employeeId);
    assert.equal("publicToken" in dimuat, false, "publicToken tidak boleh ada di hasil loader");
    assert.equal(
      JSON.stringify(dimuat).includes(kartu.publicToken),
      false,
      "token tidak boleh muncul di mana pun, termasuk di dalam SVG"
    );
  });

  test("kartu DICABUT tidak diberi QR", async () => {
    // Memberi QR pada kartu mati mengundang orang mencetaknya, dan hasilnya
    // kartu yang terlihat resmi tetapi gagal saat dipindai pelanggan.
    await db.employeeCard.deleteMany({ where: { employeeId } });
    await buatKartu({ status: "REVOKED" });
    const [kartu] = await loadEmployeeCards(employeeId);
    assert.equal(kartu.qrSvg, null);
  });

  test("kartu KEDALUWARSA tidak diberi QR", async () => {
    await db.employeeCard.deleteMany({ where: { employeeId } });
    await buatKartu({ expiresAt: new Date("2020-01-01") });
    const [kartu] = await loadEmployeeCards(employeeId);
    assert.equal(kartu.qrSvg, null);
  });

  test("PEGAWAI DIARSIPKAN mematikan QR-nya, meski kartunya masih ACTIVE", async () => {
    // Jawaban di sini harus sama persis dengan verifyCardToken(). Dua jawaban
    // berbeda untuk kartu yang sama berarti QR terbit dan tercetak, lalu
    // pemindaiannya gagal di depan pelanggan.
    await db.employeeCard.deleteMany({ where: { employeeId } });
    await buatKartu();
    await db.employee.update({ where: { id: employeeId }, data: { isActive: false } });
    const [mati] = await loadEmployeeCards(employeeId);
    assert.equal(mati.qrSvg, null);
    await db.employee.update({ where: { id: employeeId }, data: { isActive: true } });
    const [hidup] = await loadEmployeeCards(employeeId);
    assert.notEqual(hidup.qrSvg, null);
  });

  test("APP_URL kosong di PRODUKSI berarti tidak ada QR sama sekali", async () => {
    // QR dicetak ke kartu plastik. Alamat yang salah tidak bisa diperbaiki
    // dengan menyunting apa pun — kartunya harus dicetak ulang satu per satu.
    // Lebih baik tombol Print mati daripada 23 kartu menunjuk ke localhost.
    const url = process.env.APP_URL;
    const env = process.env.NODE_ENV;
    try {
      delete process.env.APP_URL;
      env_(process.env).NODE_ENV = "production";
      assert.equal(cardAppUrl(), null);
      const [kartu] = await loadEmployeeCards(employeeId);
      assert.equal(kartu.qrSvg, null, "jangan terbitkan QR yang alamatnya belum jelas");
    } finally {
      if (url === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = url;
      if (env === undefined) delete env_(process.env).NODE_ENV;
      else env_(process.env).NODE_ENV = env;
    }
  });

  test("di luar produksi, localhost adalah jawaban yang benar untuk mencoba", async () => {
    const url = process.env.APP_URL;
    try {
      delete process.env.APP_URL;
      assert.equal(cardAppUrl(), "http://localhost:3300");
    } finally {
      if (url === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = url;
    }
  });

  test("garis miring di ujung APP_URL tidak menghasilkan alamat berganda", async () => {
    const url = process.env.APP_URL;
    try {
      process.env.APP_URL = "https://crm.perumnet.id///";
      assert.equal(cardAppUrl(), "https://crm.perumnet.id");
    } finally {
      if (url === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = url;
    }
  });
});
