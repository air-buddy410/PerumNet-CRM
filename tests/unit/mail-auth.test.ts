import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  imapHostFrom,
  credentialRejection,
  quoteImap,
  isTaggedOk,
  MailAuthError,
} from "@/lib/mail-auth";
import { localLoginBlocker } from "@/lib/oidc-rules";

describe("alamat IMAP diturunkan dari baseUrl mailcow", () => {
  test("dari URL lengkap", () => {
    assert.equal(imapHostFrom("https://mail.perumnet.id/"), "mail.perumnet.id");
    assert.equal(imapHostFrom("https://mail.perumnet.id/api/v1"), "mail.perumnet.id");
  });

  test("tanpa skema pun diterima", () => {
    assert.equal(imapHostFrom("mail.perumnet.id"), "mail.perumnet.id");
  });

  test("kosong ditolak, bukan menghasilkan host kosong", () => {
    // Host kosong akan menyambung ke localhost — dan localhost bisa saja
    // menjawab sesuatu. Ditolak terang-terangan.
    assert.throws(() => imapHostFrom(""), MailAuthError);
    assert.throws(() => imapHostFrom("   "), MailAuthError);
  });
});

describe("PENYUNTIKAN PERINTAH IMAP", () => {
  test("baris baru pada kredensial DITOLAK", () => {
    // Perintah IMAP dipisahkan CRLF. Tanpa penjaga ini, sebuah "password"
    // seperti  x\r\na2 DELETE INBOX  akan mengakhiri perintah LOGIN lalu
    // menuliskan perintahnya sendiri ke mailserver.
    assert.notEqual(credentialRejection("rahasia\r\na2 LOGOUT"), null);
    assert.notEqual(credentialRejection("rahasia\nx"), null);
    assert.notEqual(credentialRejection("rahasia\0x"), null);
  });

  test("password wajar tetap lolos", () => {
    assert.equal(credentialRejection('P@ssw0rd!#$%^&*()"\\'), null);
    assert.equal(credentialRejection("budi_prabhawa@perumnet.id"), null);
  });

  test("kosong dan kepanjangan ditolak", () => {
    assert.notEqual(credentialRejection(""), null);
    assert.notEqual(credentialRejection("x".repeat(513)), null);
  });

  test("kutip dan garis miring dilarikan dengan benar", () => {
    assert.equal(quoteImap('ab"cd'), '"ab\\"cd"');
    assert.equal(quoteImap("ab\\cd"), '"ab\\\\cd"');
    // Urutannya penting: garis miring dulu, baru kutip. Kebalikannya
    // menghasilkan garis miring ganda yang salah.
    assert.equal(quoteImap('a\\"b'), '"a\\\\\\"b"');
  });
});

describe("membaca balasan server", () => {
  test("OK bertanda berarti berhasil", () => {
    assert.equal(isTaggedOk("a1 OK Logged in\r\n", "a1"), true);
  });

  test("NO dan BAD berarti ditolak", () => {
    assert.equal(isTaggedOk("a1 NO [AUTHENTICATIONFAILED] Failed\r\n", "a1"), false);
    assert.equal(isTaggedOk("a1 BAD Error in IMAP command\r\n", "a1"), false);
  });

  test("balasan yang belum lengkap menghasilkan null, bukan ditebak", () => {
    // Data TCP datang sepotong-sepotong. Menebak "belum ada NO berarti OK"
    // akan meloloskan siapa pun yang paketnya kebetulan terpecah.
    assert.equal(isTaggedOk("* CAPABILITY IMAP4rev1\r\n", "a1"), null);
    assert.equal(isTaggedOk("a1 O", "a1"), null);
    assert.equal(isTaggedOk("", "a1"), null);
  });

  test("balasan bertanda LAIN tidak ikut terbaca", () => {
    // Server bisa mengirim baris untuk tag lain; salah baca berarti menerima
    // jawaban atas pertanyaan yang berbeda.
    assert.equal(isTaggedOk("a2 OK done\r\n", "a1"), null);
  });
});

describe("mode MAILSERVER tidak memblokir form password", () => {
  test("OIDC tetap memblokir", () => {
    // Di mode OIDC memang tidak ada form password; mengetiknya pasti keliru.
    assert.notEqual(localLoginBlocker("OIDC", { allowLocalLogin: false }), null);
  });

  test("MAILSERVER TIDAK memblokir", () => {
    // Form-nya justru tetap dipakai — yang pindah cuma tempat pemeriksaannya.
    // Memblokirnya akan mematikan satu-satunya jalan masuk yang tersedia.
    assert.equal(localLoginBlocker("MAILSERVER", { allowLocalLogin: false }), null);
  });

  test("akun darurat tetap lolos di kedua mode", () => {
    assert.equal(localLoginBlocker("OIDC", { allowLocalLogin: true }), null);
    assert.equal(localLoginBlocker("MAILSERVER", { allowLocalLogin: true }), null);
  });
});
