import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { db, makeUser, tag, ensureMasterData, resetTransactionalData } from "./fixtures";
import { changeOwnMailPassword, MAILCOW_CODE } from "@/lib/mailserver";
import { newMailPasswordRejection, MIN_MAIL_PASSWORD } from "@/lib/mail-auth";
import type { ImapProbe } from "@/lib/mail-auth";
import type { Fetcher } from "@/lib/mailcow";

// Ganti password email dari halaman profil (Fase 54).
//
// Yang diuji terutama: kapan mailcow TIDAK BOLEH ditulis. Sekali password
// mailbox berubah tanpa pemiliknya membuktikan diri, orang itu kehilangan
// kotak suratnya — dan lewat itu, seluruh akun lain yang meresetnya via email.

const ENV = "MAILCOW_PWD_KEY";

/** Mencatat setiap penulisan ke mailcow supaya bisa dipastikan TIDAK terjadi. */
function fakeMailcow() {
  const writes: { email: string; password?: string }[] = [];
  const fetcher: Fetcher = async (url, init) => {
    if (url.includes("/get/status/version")) {
      return new Response(JSON.stringify({ version: "2026-08" }), { status: 200 });
    }
    if (url.includes("/get/mailbox/all")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.includes("/edit/mailbox")) {
      const body = JSON.parse(String(init.body));
      writes.push({ email: body.items[0], password: body.attr?.password });
      return new Response(JSON.stringify([{ type: "success", msg: "ok" }]), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };
  return { fetcher, writes };
}

function fakeProbe(pasangan: Record<string, string>, opts: { mati?: boolean } = {}): ImapProbe {
  return async (_h, email, password) => {
    if (opts.mati) return { ok: false, reason: "UNREACHABLE", detail: "ECONNREFUSED" };
    return pasangan[email] === password ? { ok: true } : { ok: false, reason: "REJECTED" };
  };
}

async function setupIntegration() {
  process.env[ENV] = "kunci-uji";
  await db.integration.upsert({
    where: { code: MAILCOW_CODE },
    update: { isEnabled: true, baseUrl: "https://mail.test.local", credentialRef: ENV },
    create: {
      code: MAILCOW_CODE, name: "Mailserver mailcow", category: "ITOPS", provider: "MAILCOW",
      baseUrl: "https://mail.test.local", authType: "API_KEY", credentialRef: ENV,
      isEnabled: true, webhookToken: "pwd-token",
    },
  });
}

describe("aturan password email baru", () => {
  test("lebih ketat dari password CRM biasa", () => {
    // Password email adalah saluran reset untuk hampir semua akun lain.
    assert.equal(MIN_MAIL_PASSWORD > 8, true);
    assert.notEqual(newMailPasswordRejection("lama123456", "pendek12", "pendek12"), null);
  });

  test("konfirmasi tidak sama ditolak", () => {
    assert.match(newMailPasswordRejection("lama123456", "barubaru12", "barubaru13") ?? "", /Konfirmasi/);
  });

  test("password baru sama dengan yang lama ditolak", () => {
    assert.notEqual(newMailPasswordRejection("samasama12", "samasama12", "samasama12"), null);
  });

  test("password lama kosong ditolak — bukti kepemilikan wajib", () => {
    assert.notEqual(newMailPasswordRejection("", "barubaru12", "barubaru12"), null);
  });

  test("karakter penyuntik perintah ditolak", () => {
    assert.notEqual(newMailPasswordRejection("lama123456", "baru\r\njahat12", "baru\r\njahat12"), null);
  });

  test("password yang wajar diterima", () => {
    assert.equal(newMailPasswordRejection("lama123456", "BaruYangPanjang99", "BaruYangPanjang99"), null);
  });
});

describe("mengganti password email sendiri", () => {
  let akun: { id: string; name: string; email: string };

  before(async () => {
    await resetTransactionalData();
    await ensureMasterData();
    await setupIntegration();
    const u = await makeUser(tag("pwd").toLowerCase(), "HRD");
    akun = { id: u.id, name: u.name, email: u.email };
  });
  after(async () => {
    await resetTransactionalData();
    delete process.env[ENV];
    await db.$disconnect();
  });

  test("berhasil, dan alamat yang dikirim ke mailcow adalah alamat AKUN ITU", async () => {
    // Dengan API key read-write, alamat yang bisa dikendalikan pemanggil
    // berarti siapa pun bisa mengganti password mailbox siapa pun. Alamatnya
    // harus datang dari akun yang login, bukan dari input.
    const mc = fakeMailcow();
    const r = await changeOwnMailPassword(akun, "lamaBanget1", "BaruYangPanjang99", "BaruYangPanjang99", {
      probe: fakeProbe({ [akun.email]: "lamaBanget1" }),
      fetcher: mc.fetcher,
    });
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    assert.equal(mc.writes.length, 1);
    assert.equal(mc.writes[0].email, akun.email);
    assert.equal(mc.writes[0].password, "BaruYangPanjang99");
  });

  test("PASSWORD LAMA SALAH → mailcow TIDAK DITULIS sama sekali", async () => {
    // Penjaga terpenting di berkas ini. Tanpa verifikasi ini, sesi CRM yang
    // dibajak cukup untuk mengambil alih kotak surat seseorang.
    const mc = fakeMailcow();
    const r = await changeOwnMailPassword(akun, "tebakanNgawur", "BaruYangPanjang99", "BaruYangPanjang99", {
      probe: fakeProbe({ [akun.email]: "lamaBanget1" }),
      fetcher: mc.fetcher,
    });
    assert.equal(r.ok, false);
    assert.equal(mc.writes.length, 0, "tidak boleh ada satu pun penulisan ke mailcow");
  });

  test("MAILSERVER MATI → tidak ditulis, dan pesannya bukan 'password salah'", async () => {
    const mc = fakeMailcow();
    const r = await changeOwnMailPassword(akun, "lamaBanget1", "BaruYangPanjang99", "BaruYangPanjang99", {
      probe: fakeProbe({}, { mati: true }),
      fetcher: mc.fetcher,
    });
    assert.equal(r.ok, false);
    assert.equal(mc.writes.length, 0);
    assert.match(r.ok ? "" : r.error, /tidak bisa dihubungi/);
  });

  test("password baru yang lemah ditolak SEBELUM menyentuh mailserver", async () => {
    const mc = fakeMailcow();
    const r = await changeOwnMailPassword(akun, "lamaBanget1", "pendek1", "pendek1", {
      probe: fakeProbe({ [akun.email]: "lamaBanget1" }),
      fetcher: mc.fetcher,
    });
    assert.equal(r.ok, false);
    assert.equal(mc.writes.length, 0);
  });

  test("PASSWORD TIDAK PERNAH tercatat di AuditLog", async () => {
    const rahasia = "RahasiaBanget777";
    const mc = fakeMailcow();
    await changeOwnMailPassword(akun, "lamaBanget1", rahasia, rahasia, {
      probe: fakeProbe({ [akun.email]: "lamaBanget1" }),
      fetcher: mc.fetcher,
    });
    assert.equal(await db.auditLog.count({ where: { description: { contains: rahasia } } }), 0);
    assert.equal(await db.auditLog.count({ where: { description: { contains: "lamaBanget1" } } }), 0);
  });

  test("perubahan yang berhasil TETAP tercatat — tanpa nilainya", async () => {
    const log = await db.auditLog.findFirst({
      where: { action: "MAIL_PASSWORD_CHANGE" },
      orderBy: { createdAt: "desc" },
    });
    assert.notEqual(log, null);
    assert.match(log!.description, /mengganti password email/);
    assert.match(log!.description, new RegExp(akun.email));
  });
});
