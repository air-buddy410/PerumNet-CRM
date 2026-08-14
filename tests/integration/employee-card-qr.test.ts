import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { db, makeUser, tag, actor, ensureMasterData, resetTransactionalData } from "./fixtures";
import sharp from "sharp";
import { loadEmployeeCards, newCardToken, cardAppUrl, uploadEmployeePhoto } from "@/lib/employee-card-service";
import { cardPhotoWidth, CARD_PHOTO_HEIGHT } from "@/lib/employee-card";

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

// ── Foto kartu dipotong saat diunggah (Fase 63) ─────────────────
//
// Kartu sungguhan yang pertama diterbitkan menampilkan foto LANSKAP sebagai
// pita tipis di tengah bidang tosca: slot memakai `object-fit: contain`, jadi
// rasio yang berbeda menyisakan bidang kosong dan kartunya terlihat rusak.
//
// Meminta HRD memotong sendiri sebelum mengunggah berarti menaruh syarat yang
// tidak terlihat di tempat yang tidak memeriksanya. Jadi dipotong di server.

describe("foto resmi dipotong ke bentuk slot kartu", () => {
  let employeeId: string;
  let HRD: ReturnType<typeof actor>;

  before(async () => {
    await ensureMasterData();
    HRD = actor((await makeUser(tag("hrdfoto").toLowerCase(), "HRD")).id, "hrd");
    const emp = await db.employee.create({
      data: {
        employeeNo: "10009301",
        fullName: "Pemilik Foto Lanskap",
        employeeType: "FULL_TIME",
        joinedAt: new Date("2026-01-06"),
      },
    });
    employeeId = emp.id;
  });

  /** Gambar uji dengan rasio apa pun, dibuat di tempat — tanpa berkas contoh. */
  async function gambar(w: number, h: number, mime = "image/jpeg"): Promise<File> {
    const buf = await sharp({
      create: { width: w, height: h, channels: 3, background: { r: 20, g: 160, b: 150 } },
    })
      [mime === "image/png" ? "png" : "jpeg"]()
      .toBuffer();
    return new File([new Uint8Array(buf)], mime === "image/png" ? "uji.png" : "uji.jpg", { type: mime });
  }

  async function fotoTersimpan(): Promise<Buffer> {
    const e = await db.employee.findUniqueOrThrow({ where: { id: employeeId } });
    const att = await db.attachment.findUniqueOrThrow({ where: { id: e.photoAttachmentId! } });
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    return readFile(path.join(process.cwd(), "uploads", att.storedName));
  }

  test("FOTO LANSKAP jadi tegak seukuran slot — bukan dikotaki", async () => {
    const r = await uploadEmployeePhoto(HRD, employeeId, await gambar(3000, 1200));
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    const meta = await sharp(await fotoTersimpan()).metadata();
    assert.equal(meta.width, cardPhotoWidth());
    assert.equal(meta.height, CARD_PHOTO_HEIGHT);
  });

  test("foto TEGAK ekstrem juga diseragamkan", async () => {
    const r = await uploadEmployeePhoto(HRD, employeeId, await gambar(600, 4000));
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    const meta = await sharp(await fotoTersimpan()).metadata();
    assert.equal(meta.width, cardPhotoWidth());
    assert.equal(meta.height, CARD_PHOTO_HEIGHT);
  });

  test("PNG diterima dan keluar sebagai JPEG — alur cetak menerima JPEG di mana pun", async () => {
    const r = await uploadEmployeePhoto(HRD, employeeId, await gambar(2000, 2000, "image/png"));
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    const meta = await sharp(await fotoTersimpan()).metadata();
    assert.equal(meta.format, "jpeg");
  });

  test("METADATA HILANG — foto ini disajikan di URL publik", async () => {
    // Foto langsung dari ponsel bisa membawa koordinat GPS tempat ia diambil,
    // dan alamat kartunya bisa dipindai siapa pun.
    const meta = await sharp(await fotoTersimpan()).metadata();
    assert.equal(meta.exif, undefined, "EXIF tidak boleh ikut tersimpan");
  });

  test("hasilnya JAUH LEBIH RINGAN dari berkas kamera", async () => {
    // Foto kamera 1,8 MB terkirim ulang setiap kali ada orang memindai kartu,
    // sering lewat kuota, sambil berdiri di depan pintu.
    await uploadEmployeePhoto(HRD, employeeId, await gambar(4000, 3000));
    const bytes = (await fotoTersimpan()).length;
    assert.equal(bytes < 900_000, true, `masih ${Math.round(bytes / 1024)} KB`);
  });

  test("berkas yang bukan gambar DITOLAK, tidak tersimpan", async () => {
    const bukan = new File([new Uint8Array([1, 2, 3, 4])], "dok.pdf", { type: "application/pdf" });
    const r = await uploadEmployeePhoto(HRD, employeeId, bukan);
    assert.equal(r.ok, false);
  });

  test("gambar RUSAK ditolak dengan kalimat yang bisa dibaca orang", async () => {
    // Galat pustaka menyebut jalur berkas dan versi — tidak menolong siapa pun
    // yang sedang mengunggah foto.
    const rusak = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])], "rusak.jpg", {
      type: "image/jpeg",
    });
    const r = await uploadEmployeePhoto(HRD, employeeId, rusak);
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /tidak bisa dibaca|JPG atau PNG/i);
  });
});
