import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { safeInternalHref, isAppRoute } from "@/lib/internal-link";

// Tujuan setelah login datang dari URL — dikendalikan siapa pun yang bisa
// mengirimi seseorang tautan.
//
// Sejak login memakai password EMAIL, pengalihan ke luar bukan sekadar
// tersesat: tautan crm.perumnet.id/login?next=//tiruan.id mengantar orang yang
// BARU SAJA memasukkan password ke halaman palsu — pada detik ketika ia paling
// percaya sedang berada di dalam sistem.
//
// Aturan yang dipakai jalur login sekarang sama persis dengan yang menjaga
// notifikasi dan hasil pencarian.

function tujuanLogin(next: unknown): string {
  const aman = typeof next === "string" ? safeInternalHref(next) : null;
  return aman && isAppRoute(aman) ? aman : "/dashboard";
}

describe("pengalihan setelah login tidak bisa keluar dari aplikasi", () => {
  test("path internal biasa diikuti", () => {
    assert.equal(tujuanLogin("/hrd/employees"), "/hrd/employees");
    assert.equal(tujuanLogin("/settings/users?tab=aktif"), "/settings/users?tab=aktif");
  });

  test("URL PROTOCOL-RELATIVE ditolak — ini yang lolos dari startsWith(\"/\")", () => {
    // Diawali garis miring, jadi pemeriksaan lama meloloskannya. Peramban
    // membacanya sebagai https://tiruan.id.
    assert.equal(tujuanLogin("//tiruan.id"), "/dashboard");
    assert.equal(tujuanLogin("//tiruan.id/login"), "/dashboard");
  });

  test("garis miring terbalik juga ditolak", () => {
    // Sebagian peramban menafsirkan "/\host" seperti "//host".
    assert.equal(tujuanLogin("/\\tiruan.id"), "/dashboard");
  });

  test("URL absolut ditolak", () => {
    for (const j of ["https://tiruan.id", "http://tiruan.id", "javascript:alert(1)"]) {
      assert.equal(tujuanLogin(j), "/dashboard", j);
    }
  });

  test("skema yang diselipkan setelah garis miring ditolak", () => {
    assert.equal(tujuanLogin("/javascript:alert(1)"), "/dashboard");
  });

  test("nilai bukan teks ditolak tanpa melempar", () => {
    for (const j of [null, undefined, 123, {}, []]) {
      assert.equal(tujuanLogin(j), "/dashboard");
    }
  });

  test("jalur API bukan tujuan yang masuk akal setelah login", () => {
    // Mengalihkan orang ke /api/... setelah login menampilkan JSON mentah,
    // bukan halaman. Middleware memang menambahkannya ke ?next, jadi ini
    // benar-benar terjadi.
    assert.equal(tujuanLogin("/api/search?q=a"), "/dashboard");
  });
});
