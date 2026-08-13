import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  headerRejection,
  isPlainEmail,
  encodeHeaderValue,
  buildMessage,
  replyCode,
  smtpBlocker,
  SmtpError,
} from "@/lib/smtp";

const dasar = {
  fromName: "PerumNet CRM",
  fromAddress: "admin@perumnet.id",
  to: "budi@perumnet.id",
  subject: "Permintaan pemulihan akses",
  body: "Halo",
  date: new Date("2026-08-13T10:00:00Z"),
  messageId: "abc@mail.perumnet.id",
};

describe("PENYUNTIKAN HEADER EMAIL", () => {
  test("baris baru pada nilai header ditolak", () => {
    // Header dipisahkan CRLF. Sebuah nilai berisi baris baru dapat menutup
    // header To lalu menuliskan Bcc-nya sendiri — pesan pun diam-diam pergi
    // ke tempat yang tidak diminta siapa pun.
    assert.notEqual(headerRejection("x\r\nBcc: korban@x.id"), null);
    assert.notEqual(headerRejection("x\nBcc: korban@x.id"), null);
    assert.notEqual(headerRejection("x\0y"), null);
  });

  test("SUBJEK yang menyuntik header ditolak saat pesan disusun", () => {
    // Alamat email kebetulan sudah tertutup pemeriksaan bentuknya. Subjek
    // TIDAK — dan subjek justru sering datang dari data, bukan dari kode.
    assert.throws(
      () => buildMessage({ ...dasar, subject: "Halo\r\nBcc: korban@perumnet.id" }),
      SmtpError
    );
  });

  test("NAMA PENGIRIM yang menyuntik header juga ditolak", () => {
    assert.throws(
      () => buildMessage({ ...dasar, fromName: "CRM\r\nBcc: korban@perumnet.id" }),
      SmtpError
    );
  });

  test("alamat tujuan yang ngawur ditolak", () => {
    for (const buruk of ["bukan-email", "a@b", "a b@c.id", "a@b.c\r\nX: y", ""]) {
      assert.throws(() => buildMessage({ ...dasar, to: buruk }), SmtpError, `"${buruk}" seharusnya ditolak`);
    }
  });

  test("alamat wajar tetap diterima", () => {
    assert.equal(isPlainEmail("budi_prabhawa@perumnet.id"), true);
    assert.equal(isPlainEmail("a.b-c+d@sub.domain.co.id"), true);
  });
});

describe("penyusunan pesan", () => {
  const pesan = buildMessage(dasar);

  test("header wajib lengkap", () => {
    for (const h of ["From:", "To:", "Subject:", "Date:", "Message-ID:", "MIME-Version:"]) {
      assert.match(pesan, new RegExp(`^${h}`, "m"), `header ${h} hilang`);
    }
  });

  test("isi dikodekan base64", () => {
    // Dengan base64, baris sepanjang apa pun dan baris yang diawali titik
    // tidak perlu diperlakukan khusus — "dot-stuffing" jadi tidak relevan.
    assert.match(pesan, /^Content-Transfer-Encoding: base64$/m);
    const isi = pesan.split("\r\n\r\n")[1];
    assert.equal(Buffer.from(isi.replace(/\r\n/g, ""), "base64").toString("utf8"), "Halo");
  });

  test("isi yang memuat baris berawalan titik tetap utuh", () => {
    const p = buildMessage({ ...dasar, body: "baris satu\n.\nbaris tiga" });
    const isi = p.split("\r\n\r\n")[1];
    assert.equal(
      Buffer.from(isi.replace(/\r\n/g, ""), "base64").toString("utf8"),
      "baris satu\n.\nbaris tiga"
    );
  });

  test("subjek non-ASCII dikodekan supaya tidak rusak di klien email", () => {
    const p = buildMessage({ ...dasar, subject: "Pemulihan — akun Anda" });
    assert.match(p, /^Subject: =\?UTF-8\?B\?/m);
  });

  test("subjek ASCII dibiarkan terbaca apa adanya", () => {
    assert.match(pesan, /^Subject: Permintaan pemulihan akses$/m);
  });
});

describe("membaca balasan SMTP", () => {
  test("balasan satu baris terbaca", () => {
    assert.equal(replyCode("250 OK\r\n"), 250);
    assert.equal(replyCode("354 Start mail input\r\n"), 354);
  });

  test("balasan BERBARIS BANYAK hanya selesai di baris terakhir", () => {
    // "250-STARTTLS" belum berarti selesai; yang menandai akhir adalah baris
    // dengan spasi setelah angkanya. Salah baca di sini berarti mengirim
    // perintah berikutnya sebelum server siap.
    assert.equal(replyCode("250-mail.perumnet.id\r\n250-STARTTLS\r\n"), null);
    assert.equal(replyCode("250-mail.perumnet.id\r\n250-STARTTLS\r\n250 HELP\r\n"), 250);
  });

  test("potongan yang belum lengkap menghasilkan null", () => {
    assert.equal(replyCode("25"), null);
    assert.equal(replyCode(""), null);
  });
});

describe("konfigurasi", () => {
  test("konfigurasi kosong ditolak dengan sebutan variabelnya", () => {
    const r = smtpBlocker(null);
    assert.match(r ?? "", /SMTP_HOST/);
    assert.match(r ?? "", /SMTP_PASSWORD/);
  });

  test("port tidak masuk akal ditolak", () => {
    const cfg = { host: "mail.x.id", port: 0, user: "a@x.id", password: "p", fromName: "X" };
    assert.notEqual(smtpBlocker(cfg), null);
  });

  test("konfigurasi lengkap diterima", () => {
    const cfg = { host: "mail.x.id", port: 587, user: "a@x.id", password: "p", fromName: "X" };
    assert.equal(smtpBlocker(cfg), null);
  });
});
