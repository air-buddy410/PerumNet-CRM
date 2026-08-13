import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { db, makeUser, tag, ensureMasterData, resetTransactionalData } from "./fixtures";
import {
  requestAccountRecovery,
  RECOVERY_REPLY,
  RECOVERY_ACTION,
  RECOVERY_COOLDOWN_MINUTES,
  RECOVERY_HOURLY_CAP,
} from "@/lib/account-recovery";
import type { MailSender } from "@/lib/smtp";
import { PERMISSIONS } from "@/lib/constants";

// Formulir ini dipanggil TANPA LOGIN. Yang diuji di sini bukan "email
// terkirim", melainkan apa yang TIDAK boleh terjadi: bocornya daftar karyawan,
// dan berubahnya formulir ini menjadi alat membanjiri kotak surat orang.

const ENV = { host: "SMTP_HOST", user: "SMTP_USER", pass: "SMTP_PASSWORD" };

/** Mencatat setiap surat yang hendak dikirim. */
function fakeSender() {
  const sent: { to: string; subject: string; body: string }[] = [];
  const sender: MailSender = async (_cfg, to, subject, body) => {
    sent.push({ to, subject, body });
    return { ok: true };
  };
  return { sender, sent };
}

describe("permintaan pemulihan akses", () => {
  let email: string;

  before(async () => {
    await resetTransactionalData();
    await ensureMasterData();
    process.env[ENV.host] = "mail.test.local";
    process.env[ENV.user] = "admin@perumnet.id";
    process.env[ENV.pass] = "rahasia-uji";
    process.env.IT_SUPPORT_EMAIL = "it@perumnet.id";
    const u = await makeUser(tag("pulih").toLowerCase(), "Pemohon Uji");
    email = u.email;

    // Harus ada yang MEMEGANG users.edit, kalau tidak pemberitahuan dalam
    // aplikasi tidak sampai ke siapa pun. Fixture bawaan membuat peran tanpa
    // izin sama sekali, jadi pemegangnya dirakit di sini.
    const izin = await db.permission.upsert({
      where: { code: PERMISSIONS.USERS_EDIT },
      update: {},
      create: { code: PERMISSIONS.USERS_EDIT, module: "users", action: "edit" },
    });
    const peranIT = await db.role.upsert({
      where: { code: "it_uji" },
      update: {},
      create: { code: "it_uji", name: "IT Uji" },
    });
    await db.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: peranIT.id, permissionId: izin.id } },
      update: {},
      create: { roleId: peranIT.id, permissionId: izin.id },
    });
    const orangIT = await makeUser(tag("it").toLowerCase(), "Petugas IT");
    await db.userRole.upsert({
      where: { userId_roleId: { userId: orangIT.id, roleId: peranIT.id } },
      update: {},
      create: { userId: orangIT.id, roleId: peranIT.id },
    });
  });
  after(async () => {
    await resetTransactionalData();
    for (const k of Object.values(ENV)) delete process.env[k];
    delete process.env.IT_SUPPORT_EMAIL;
    await db.$disconnect();
  });

  test("dua surat terkirim: ke IT dan ke pemohon", async () => {
    const f = fakeSender();
    const r = await requestAccountRecovery(email, { sender: f.sender });
    assert.equal(r.ok, true);
    assert.equal(f.sent.length, 2);
    assert.equal(f.sent[0].to, "it@perumnet.id");
    assert.equal(f.sent[1].to, email);
  });

  test("surat ke IT memuat rincian yang dibutuhkan untuk memastikan identitas", async () => {
    await db.auditLog.deleteMany({ where: { action: RECOVERY_ACTION } });
    const f = fakeSender();
    await requestAccountRecovery(email, { sender: f.sender });
    const keIT = f.sent[0].body;
    assert.match(keIT, /Nama pengguna/);
    assert.match(keIT, new RegExp(email));
    // Yang paling penting dari surat ini: IT diminta MEMASTIKAN dulu, dan
    // tidak lewat jalur yang sama dengan permintaannya.
    assert.match(keIT, /Pastikan lebih dahulu/);
    assert.match(keIT, /bukan membalas email ini/);
    assert.match(keIT, /tidak mengubah apa pun secara otomatis/);
  });

  test("surat ke pemohon memberi tahu bila BUKAN dia yang meminta", async () => {
    // Ini satu-satunya alasan surat itu dikirim ke alamat yang sedang tidak
    // bisa dibuka: kalau orang lain mengajukan atas namanya, ia melihatnya
    // dari perangkat yang masih tersambung.
    await db.auditLog.deleteMany({ where: { action: RECOVERY_ACTION } });
    const f = fakeSender();
    await requestAccountRecovery(email, { sender: f.sender });
    const kePemohon = f.sent[1].body;
    assert.match(kePemohon, /BUKAN berasal dari Anda/);
    assert.match(kePemohon, /segera hubungi tim IT/);
    assert.match(kePemohon, /Tidak ada kata sandi\s*\n?yang berubah/);
  });

  test("ALAMAT TAK DIKENAL: jawaban SAMA PERSIS, dan tidak ada surat terkirim", async () => {
    // Membedakan keduanya menjadikan formulir ini alat memeriksa siapa saja
    // yang bekerja di PerumNet. Dan mengirim surat untuk alamat sembarangan
    // menjadikannya pengirim surat bagi siapa pun.
    await db.auditLog.deleteMany({ where: { action: RECOVERY_ACTION } });
    const f = fakeSender();
    const r = await requestAccountRecovery("bukan-siapa-siapa@perumnet.id", { sender: f.sender });
    assert.equal(r.message, RECOVERY_REPLY);
    assert.equal(f.sent.length, 0, "tidak boleh ada surat untuk alamat tak dikenal");

    const f2 = fakeSender();
    const r2 = await requestAccountRecovery(email, { sender: f2.sender });
    assert.equal(r2.message, RECOVERY_REPLY, "kalimatnya harus sama persis dengan yang tak dikenal");
  });

  test("bentuk email yang ngawur tetap dijawab sama, tanpa menyentuh apa pun", async () => {
    const f = fakeSender();
    for (const buruk of ["", "bukan-email", "a@b", "a@b.c\r\nBcc: korban@x.id"]) {
      const r = await requestAccountRecovery(buruk, { sender: f.sender });
      assert.equal(r.message, RECOVERY_REPLY);
    }
    assert.equal(f.sent.length, 0);
  });

  test("PERMINTAAN BERUNTUN ditahan — kotak surat tidak bisa dibanjiri", async () => {
    await db.auditLog.deleteMany({ where: { action: RECOVERY_ACTION } });
    const f = fakeSender();
    await requestAccountRecovery(email, { sender: f.sender });
    assert.equal(f.sent.length, 2);

    // Percobaan kedua dalam jeda yang sama tidak mengirim apa pun lagi.
    await requestAccountRecovery(email, { sender: f.sender });
    await requestAccountRecovery(email, { sender: f.sender });
    assert.equal(f.sent.length, 2, "hanya permintaan pertama yang mengirim surat");
  });

  test("setelah jeda lewat, permintaan diterima lagi", async () => {
    await db.auditLog.deleteMany({ where: { action: RECOVERY_ACTION } });
    const f = fakeSender();
    await requestAccountRecovery(email, { sender: f.sender });
    const nanti = new Date(Date.now() + (RECOVERY_COOLDOWN_MINUTES + 1) * 60_000);
    await requestAccountRecovery(email, { sender: f.sender, now: nanti });
    assert.equal(f.sent.length, 4, "dua surat lagi setelah jedanya lewat");
  });

  test("batas per JAM menahan banjir dari banyak alamat sekaligus", async () => {
    await db.auditLog.deleteMany({ where: { action: RECOVERY_ACTION } });
    for (let i = 0; i < RECOVERY_HOURLY_CAP; i++) {
      await db.auditLog.create({
        data: { action: RECOVERY_ACTION, module: "auth", description: `pengisi-${i}@x.id` },
      });
    }
    const f = fakeSender();
    await requestAccountRecovery(email, { sender: f.sender });
    assert.equal(f.sent.length, 0, "sudah lewat batas per jam");
    assert.equal(
      await db.auditLog.count({ where: { action: "ACCOUNT_RECOVERY_THROTTLED" } }) > 0,
      true,
      "penahanannya harus tercatat, bukan senyap"
    );
  });

  test("SMTP belum disiapkan → pemberitahuan dalam aplikasi tetap jalan", async () => {
    // IT tidak boleh kehilangan kabar hanya karena pengiriman email belum siap.
    await db.auditLog.deleteMany({ where: { action: RECOVERY_ACTION } });
    await db.notification.deleteMany({});
    const simpan = process.env[ENV.pass];
    delete process.env[ENV.pass];

    const f = fakeSender();
    const r = await requestAccountRecovery(email, { sender: f.sender });
    assert.equal(r.message, RECOVERY_REPLY);
    assert.equal(f.sent.length, 0);
    assert.equal(await db.notification.count({ where: { type: "ACCOUNT_RECOVERY" } }) > 0, true);
    assert.equal(await db.auditLog.count({ where: { action: "ACCOUNT_RECOVERY_MAIL_SKIPPED" } }) > 0, true);

    process.env[ENV.pass] = simpan;
  });
});
