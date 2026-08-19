import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { keputusanJalur, TERBUKA_PATHS, TAMU_SAJA_PATHS } from "@/lib/middleware-rules";

// Bug Fase 96, ditulis sebagai tes supaya tidak bisa kembali diam-diam.
//
// `/api/avatar/<token>` dulu satu daftar dengan `/login`, dan aturan "sudah
// masuk + jalur publik → lempar ke /dashboard" ikut mengenainya. Tag <img>
// pada halaman profil karena itu menerima HTML dasbor 184 KB alih-alih WebP,
// dan SETIAP staf melihat ikon gambar rusak di tempat fotonya.
describe("jalur terbuka tidak pernah dialihkan — apa pun keadaan sesinya", () => {
  const contoh = [
    "/api/avatar/ZaiYlQjGZ-ziUsk1Ry883t_PgclMCXs_",
    "/verify/token-kartu",
    "/api/verify/token-kartu/photo",
    "/api/health",
  ];

  for (const pathname of contoh) {
    test(`${pathname} — tanpa sesi`, () => {
      assert.equal(keputusanJalur({ pathname, authenticated: false }), "lanjut");
    });
    // Inilah kasus yang dulu rusak. Yang anonim SELALU bekerja, jadi menguji
    // dari terminal tanpa cookie tidak pernah menemukannya.
    test(`${pathname} — SUDAH login`, () => {
      assert.equal(keputusanJalur({ pathname, authenticated: true }), "lanjut");
    });
  }
});

describe("layar masuk tetap hanya untuk tamu", () => {
  test("belum masuk → boleh melihat /login", () => {
    assert.equal(keputusanJalur({ pathname: "/login", authenticated: false }), "lanjut");
  });

  test("sudah masuk → dilempar ke dasbor", () => {
    assert.equal(keputusanJalur({ pathname: "/login", authenticated: true }), "ke-dashboard");
  });

  test("cabangnya ikut, mis. /login/forgot-password", () => {
    assert.equal(
      keputusanJalur({ pathname: "/login/forgot-password", authenticated: false }),
      "lanjut",
    );
  });
});

describe("jalur biasa tetap dijaga", () => {
  for (const pathname of ["/dashboard", "/crm/customers", "/noc/map", "/settings/users"]) {
    test(`${pathname} tanpa sesi → ke layar masuk`, () => {
      assert.equal(keputusanJalur({ pathname, authenticated: false }), "ke-login");
    });
    test(`${pathname} dengan sesi → lanjut`, () => {
      assert.equal(keputusanJalur({ pathname, authenticated: true }), "lanjut");
    });
  }
});

// Penjaga terhadap kesalahan yang paling mudah terulang: menaruh jalur penyaji
// data ke daftar tamu-saja karena keduanya sama-sama terasa "publik".
describe("kedua daftar tidak boleh beririsan", () => {
  test("tidak ada jalur yang muncul di dua daftar", () => {
    const irisan = TERBUKA_PATHS.filter((p) => TAMU_SAJA_PATHS.includes(p));
    assert.deepEqual(irisan, []);
  });

  test("daftar tamu-saja tidak memuat jalur API", () => {
    const api = TAMU_SAJA_PATHS.filter((p) => p.startsWith("/api/"));
    assert.deepEqual(api, [], "jalur API tidak pernah boleh mengalihkan ke dasbor");
  });
});
