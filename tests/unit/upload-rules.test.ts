import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  safeExtension,
  uploadRejection,
  sniffMime,
  contentMismatch,
  MAX_UPLOAD_BYTES,
} from "@/lib/upload-rules";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0, 0, 0, 0, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const HTML = new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e, 0, 0, 0, 0, 0, 0]);

describe("safeExtension", () => {
  test("ekstensi biasa diambil huruf kecil", () => {
    assert.equal(safeExtension("Foto.JPG"), ".jpg");
    assert.equal(safeExtension("arsip.tar.gz"), ".gz");
  });

  test("upaya path traversal tidak menghasilkan ekstensi berbahaya", () => {
    // Yang menutup traversal sebenarnya nama file yang dibangkitkan sendiri,
    // tapi ekstensi pun tidak boleh menyelundupkan pemisah path.
    for (const name of ["../../etc/passwd", "..\\..\\win.ini", "a.pn/g", "/etc/shadow"]) {
      const ext = safeExtension(name);
      assert.ok(!ext.includes("/") && !ext.includes("\\"), `${name} → ${ext}`);
    }
  });

  test("nama tanpa ekstensi atau berawalan titik → kosong", () => {
    assert.equal(safeExtension("tanpaekstensi"), "");
    assert.equal(safeExtension(".bashrc"), "");
  });

  test("ekstensi dengan karakter aneh ditolak", () => {
    assert.equal(safeExtension("foto.pn g"), "");
    assert.equal(safeExtension("foto.p%00ng"), "");
  });
});

describe("uploadRejection", () => {
  const ok = { name: "bukti.png", type: "image/png", size: 1000 };

  test("berkas wajar diterima", () => {
    assert.equal(uploadRejection(ok), null);
  });

  test("berkas kosong ditolak", () => {
    assert.match(String(uploadRejection({ ...ok, size: 0 })), /kosong/i);
  });

  test("melebihi batas ukuran ditolak", () => {
    assert.match(String(uploadRejection({ ...ok, size: MAX_UPLOAD_BYTES + 1 })), /maksimal/i);
  });

  test("tepat pada batas ukuran diterima", () => {
    assert.equal(uploadRejection({ ...ok, size: MAX_UPLOAD_BYTES }), null);
  });

  test("tipe di luar daftar ditolak", () => {
    assert.match(String(uploadRejection({ ...ok, type: "text/html", name: "x.html" })), /JPG, PNG/);
  });

  test("ekstensi yang tidak cocok dengan MIME ditolak", () => {
    // Inti §15: MIME dan ekstensi dipasangkan, bukan dua daftar terpisah.
    assert.match(String(uploadRejection({ ...ok, name: "bukti.php" })), /tidak cocok/i);
    assert.match(String(uploadRejection({ ...ok, name: "bukti.pdf" })), /tidak cocok/i);
  });

  test("jpg dan jpeg sama-sama sah untuk image/jpeg", () => {
    assert.equal(uploadRejection({ name: "a.jpg", type: "image/jpeg", size: 10 }), null);
    assert.equal(uploadRejection({ name: "a.jpeg", type: "image/jpeg", size: 10 }), null);
  });

  test("tanpa ekstensi ditolak", () => {
    assert.match(String(uploadRejection({ ...ok, name: "bukti" })), /ekstensi/i);
  });
});

describe("sniffMime & contentMismatch", () => {
  test("mengenali format yang didukung", () => {
    assert.equal(sniffMime(PNG), "image/png");
    assert.equal(sniffMime(JPEG), "image/jpeg");
    assert.equal(sniffMime(PDF), "application/pdf");
    assert.equal(sniffMime(WEBP), "image/webp");
  });

  test("isi yang tidak dikenali → null", () => {
    assert.equal(sniffMime(HTML), null);
    assert.equal(sniffMime(new Uint8Array(12)), null);
  });

  test("isi cocok dengan yang dinyatakan → lolos", () => {
    assert.equal(contentMismatch("image/png", PNG), null);
  });

  test("MIME dibohongi → ditolak", () => {
    // Skenario §19.3: HTML dikirim sebagai image/png agar tersaji inline.
    assert.match(String(contentMismatch("image/png", HTML)), /tidak dikenali/i);
  });

  test("format sah tapi bukan yang diakui → ditolak", () => {
    assert.match(String(contentMismatch("image/png", JPEG)), /sebenarnya image\/jpeg/);
  });
});
