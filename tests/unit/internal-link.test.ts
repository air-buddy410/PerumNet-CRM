import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { safeInternalHref, isAppRoute } from "@/lib/internal-link";

// Nilai href berasal dari database dan akhirnya dipasang ke elemen navigasi.
// Yang dijaga di sini: tidak ada bentuk yang bisa membelokkan tautan internal
// menjadi jalur keluar atau jalur eksekusi.

describe("safeInternalHref", () => {
  test("path internal biasa diterima apa adanya", () => {
    for (const href of [
      "/dashboard",
      "/crm/customers/abc123",
      "/billing/invoices?status=OPEN",
      "/a#bagian",
    ]) {
      assert.equal(safeInternalHref(href), href);
    }
  });

  test("kosong, null, atau hanya spasi → null", () => {
    for (const v of [null, undefined, "", "   "]) {
      assert.equal(safeInternalHref(v), null);
    }
  });

  test("URL absolut ditolak", () => {
    for (const href of ["https://evil.com/x", "http://evil.com", "HTTPS://EVIL.COM"]) {
      assert.equal(safeInternalHref(href), null, href);
    }
  });

  test("protocol-relative ditolak — itu host lain meski diawali garis miring", () => {
    assert.equal(safeInternalHref("//evil.com/pwn"), null);
  });

  test("backslash setelah garis miring ditolak", () => {
    // Sebagian peramban menafsirkan "/\\evil.com" seperti "//evil.com".
    assert.equal(safeInternalHref("/\\evil.com"), null);
  });

  test("skema berbahaya ditolak", () => {
    for (const href of [
      "javascript:alert(1)",
      "data:text/html,<script>",
      "/javascript:alert(1)",
    ]) {
      assert.equal(safeInternalHref(href), null, href);
    }
  });

  test("path relatif ditolak — tujuannya bergantung halaman saat ini", () => {
    for (const href of ["../admin", "./x", "admin"]) {
      assert.equal(safeInternalHref(href), null, href);
    }
  });

  test("whitespace dan karakter kendali di tengah ditolak", () => {
    // Bentuk-bentuk ini dipakai untuk memecah parser URL.
    assert.equal(safeInternalHref("/x\njavascript:alert(1)"), null);
    assert.equal(safeInternalHref("/x\ty"), null);
    assert.equal(safeInternalHref("/x y"), null);
    assert.equal(safeInternalHref("/x\u0000y"), null);
    assert.equal(safeInternalHref("/x\u000By"), null);
    assert.equal(safeInternalHref("/x\u007Fy"), null);
  });

  test("spasi di ujung dipangkas, bukan membuat gagal", () => {
    assert.equal(safeInternalHref("  /dashboard  "), "/dashboard");
  });
});

describe("isAppRoute", () => {
  test("route aplikasi dikenali", () => {
    assert.equal(isAppRoute("/crm/customers"), true);
  });

  test("api dan aset internal bukan route aplikasi", () => {
    assert.equal(isAppRoute("/api/files/x"), false);
    assert.equal(isAppRoute("/_next/static/x.js"), false);
  });
});
