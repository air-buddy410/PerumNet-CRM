import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { db, makeUser, tag, ensureMasterData, resetTransactionalData } from "./fixtures";
import { verifyMailserverPassword, MAILCOW_CODE } from "@/lib/mailserver";
import type { ImapProbe } from "@/lib/mail-auth";

// Mailserver sebagai sumber identitas (Fase 53).
//
// Yang diuji di sini bukan "bisa login", melainkan batas-batasnya — terutama
// apa yang terjadi ketika mailserver TIDAK menjawab. Password yang lewat jalur
// ini adalah password email, saluran reset untuk segalanya.

const ENV = "MAILCOW_LOGIN_KEY";

/** Mailserver palsu: menerima satu pasang kredensial, menolak sisanya. */
function fakeProbe(benar: Record<string, string>, opts: { mati?: boolean } = {}): ImapProbe {
  return async (_host, email, password) => {
    if (opts.mati) return { ok: false, reason: "UNREACHABLE", detail: "ECONNREFUSED" };
    return benar[email] === password ? { ok: true } : { ok: false, reason: "REJECTED" };
  };
}

async function setupIntegration(enabled = true) {
  process.env[ENV] = "kunci-uji";
  await db.integration.upsert({
    where: { code: MAILCOW_CODE },
    update: { isEnabled: enabled, baseUrl: "https://mail.test.local", credentialRef: ENV },
    create: {
      code: MAILCOW_CODE,
      name: "Mailserver mailcow",
      category: "ITOPS",
      provider: "MAILCOW",
      baseUrl: "https://mail.test.local",
      authType: "API_KEY",
      credentialRef: ENV,
      isEnabled: enabled,
      webhookToken: "login-token",
    },
  });
}

describe("mailserver sebagai sumber identitas", () => {
  let email: string;

  before(async () => {
    await resetTransactionalData();
    await ensureMasterData();
    await setupIntegration();
    email = (await makeUser(tag("mail").toLowerCase(), "HRD")).email;
  });
  after(async () => {
    await resetTransactionalData();
    delete process.env[ENV];
    await db.$disconnect();
  });
  beforeEach(async () => {
    await setupIntegration(true);
  });

  test("password benar diterima", async () => {
    const r = await verifyMailserverPassword(email, "benar", fakeProbe({ [email]: "benar" }));
    assert.equal(r.ok, true);
  });

  test("password salah DITOLAK, bukan dianggap gangguan", async () => {
    const r = await verifyMailserverPassword(email, "salah", fakeProbe({ [email]: "benar" }));
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, "REJECTED");
  });

  test("MAILSERVER MATI berbeda dari password salah", async () => {
    // Bedanya menentukan pesan yang dilihat orang. "Password salah" saat
    // mailserver-nya yang mati akan membuat orang mereset password email
    // yang sebenarnya tidak bermasalah — dan itu memperparah keadaan.
    const r = await verifyMailserverPassword(email, "benar", fakeProbe({ [email]: "benar" }, { mati: true }));
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, "UNREACHABLE");
  });

  test("MAILSERVER MATI TIDAK PERNAH berarti lolos", async () => {
    // Penjaga terpenting di seluruh berkas ini. Kalau gangguan jaringan bisa
    // menghasilkan { ok: true }, maka siapa pun bisa masuk sebagai siapa pun
    // dengan cara memutus jalur ke mailserver.
    for (const p of ["", "apa saja", "benar"]) {
      const r = await verifyMailserverPassword(email, p, fakeProbe({ [email]: "benar" }, { mati: true }));
      assert.equal(r.ok, false, `password "${p}" tidak boleh lolos saat mailserver mati`);
    }
  });

  test("integrasi DINONAKTIFKAN → tidak terjangkau, bukan lolos", async () => {
    await setupIntegration(false);
    const r = await verifyMailserverPassword(email, "benar", fakeProbe({ [email]: "benar" }));
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, "UNREACHABLE");
  });

  test("akun TANPA email tidak bisa diverifikasi ke mailserver", async () => {
    // Alamat email adalah satu-satunya kunci pencocokan. Tanpa itu tidak ada
    // yang bisa ditanyakan ke mailserver — dan menganggapnya lolos berarti
    // membuka akun yang tidak punya identitas di sana.
    const r = await verifyMailserverPassword("", "apa pun", fakeProbe({ "": "apa pun" }));
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, "UNREACHABLE");
  });

  test("PASSWORD TIDAK PERNAH muncul di pesan galat", async () => {
    const rahasia = "SangatRahasia123!";
    const r = await verifyMailserverPassword(email, rahasia, fakeProbe({}, { mati: true }));
    assert.equal(r.ok, false);
    const teks = JSON.stringify(r);
    assert.equal(teks.includes(rahasia), false, "password bocor ke hasil");
  });

  test("password TIDAK ikut tercatat di AuditLog", async () => {
    // Jalur ini menerima password EMAIL. Satu baris log yang memuatnya berarti
    // seluruh kotak surat perusahaan ada di tabel audit.
    const rahasia = "JanganSampaiTercatat99";
    await verifyMailserverPassword(email, rahasia, fakeProbe({}));
    const bocor = await db.auditLog.count({ where: { description: { contains: rahasia } } });
    assert.equal(bocor, 0);
  });
});
