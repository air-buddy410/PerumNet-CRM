import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveOrigin } from "@/lib/recovery-origin";

// Aksi penarikan kembali ke halaman asal lewat TOKEN, bukan URL. Berkas ini
// menjaga satu hal: tidak ada masukan dari form yang bisa menentukan alamat
// tujuan. Kalau suatu saat `resolveOrigin` diubah menerima URL, tes-tes di
// bawah ini gagal — dan itulah gunanya.

describe("resolveOrigin", () => {
  test("token portal mengarah ke portal teknisi", () => {
    assert.equal(resolveOrigin("portal", "abc"), "/portal/recoveries/abc");
  });

  test("token backoffice mengarah ke halaman backoffice", () => {
    assert.equal(resolveOrigin("backoffice", "abc"), "/inventory/device-recoveries/abc");
  });

  test("tanpa token, tujuannya backoffice — perilaku lama tidak berubah", () => {
    assert.equal(resolveOrigin(null, "abc"), "/inventory/device-recoveries/abc");
    assert.equal(resolveOrigin(undefined, "abc"), "/inventory/device-recoveries/abc");
    assert.equal(resolveOrigin("", "abc"), "/inventory/device-recoveries/abc");
  });

  test("huruf besar dan spasi tetap dikenali", () => {
    assert.equal(resolveOrigin("  PORTAL ", "abc"), "/portal/recoveries/abc");
  });
});

describe("resolveOrigin — kebal open redirect", () => {
  // Semua ini adalah bentuk yang biasa dipakai untuk membajak redirect.
  // Karena alamatnya disusun di server dari daftar tertutup, tidak satu pun
  // bisa keluar dari aplikasi.
  const jahat = [
    "https://situs-palsu.id",
    "//situs-palsu.id",
    "http://localhost:3300@situs-palsu.id",
    "/portal/recoveries/x?next=https://situs-palsu.id",
    "javascript:alert(1)",
    "\\\\situs-palsu.id",
    "/inventory/device-recoveries/../../etc/passwd",
    "portal/../../../admin",
  ];

  for (const input of jahat) {
    test(`"${input}" jatuh ke backoffice, bukan diikuti`, () => {
      const out = resolveOrigin(input, "abc");
      assert.equal(out, "/inventory/device-recoveries/abc");
    });
  }

  test("hasilnya selalu path internal yang diawali garis miring tunggal", () => {
    for (const input of [...jahat, "portal", "backoffice", null]) {
      const out = resolveOrigin(input, "abc");
      assert.equal(out.startsWith("/"), true);
      assert.equal(out.startsWith("//"), false);
      assert.equal(out.includes("://"), false);
    }
  });
});
