import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  idTokenRejection,
  resolveAccount,
  localLoginBlocker,
  isBreakGlassLogin,
  callbackRejection,
  timingSafeEqual,
  displayNameFrom,
  isOidcBypassPath,
} from "@/lib/oidc-rules";

const ISSUER = "https://auth.perumnet.id/application/o/perumnet-crm/";
const CLIENT = "zrNnvlhUj15p5X2HRPP0i2TDqpVlCmjMH1pyk6nf";
const NOW = new Date("2026-08-12T22:00:00Z");
const nowSec = Math.floor(NOW.getTime() / 1000);

const baseClaims = {
  iss: ISSUER,
  aud: CLIENT,
  sub: "sub-teguh",
  exp: nowSec + 300,
  iat: nowSec - 5,
  nonce: "nonce-abc",
  email: "teguh@perumnet.id",
};
const expect = { issuer: ISSUER, clientId: CLIENT, nonce: "nonce-abc", now: NOW };

describe("idTokenRejection — isi token", () => {
  test("token yang sah diterima", () => {
    assert.equal(idTokenRejection(baseClaims, expect), null);
  });

  test("issuer berbeda ditolak", () => {
    const r = idTokenRejection({ ...baseClaims, iss: "https://jahat.id/" }, expect);
    assert.match(r ?? "", /Issuer token tidak dikenal/);
  });

  test("issuer yang BERAWALAN sama tetap ditolak", () => {
    // Membandingkan "berawalan" alih-alih sama persis akan meloloskan
    // penyedia palsu yang mendaftarkan host mirip.
    const r = idTokenRejection(
      { ...baseClaims, iss: ISSUER + "jahat/" },
      expect
    );
    assert.notEqual(r, null);
  });

  test("audience bukan client kita ditolak", () => {
    const r = idTokenRejection({ ...baseClaims, aud: "aplikasi-lain" }, expect);
    assert.match(r ?? "", /tidak ditujukan untuk aplikasi ini/);
  });

  test("audience berupa daftar diterima bila memuat client kita", () => {
    assert.equal(idTokenRejection({ ...baseClaims, aud: ["lain", CLIENT] }, expect), null);
  });

  test("audience berupa daftar tanpa client kita ditolak", () => {
    const r = idTokenRejection({ ...baseClaims, aud: ["lain", "lagi"] }, expect);
    assert.notEqual(r, null);
  });

  test("token kedaluwarsa ditolak", () => {
    const r = idTokenRejection({ ...baseClaims, exp: nowSec - 3600 }, expect);
    assert.match(r ?? "", /kedaluwarsa/);
  });

  test("kedaluwarsa dalam toleransi jam masih diterima", () => {
    // Selisih jam kecil antara CRM dan IdP tidak boleh menolak login.
    assert.equal(idTokenRejection({ ...baseClaims, exp: nowSec - 30 }, expect), null);
  });

  test("token dari masa depan ditolak", () => {
    const r = idTokenRejection({ ...baseClaims, iat: nowSec + 3600 }, expect);
    assert.match(r ?? "", /masa depan/);
  });

  test("NONCE TIDAK COCOK ditolak — penjaga terhadap pemutaran ulang", () => {
    const r = idTokenRejection({ ...baseClaims, nonce: "nonce-lain" }, expect);
    assert.match(r ?? "", /Nonce tidak cocok/);
  });

  test("token tanpa nonce ditolak, bukan dilewatkan", () => {
    const { nonce: _drop, ...tanpaNonce } = baseClaims;
    const r = idTokenRejection(tanpaNonce, expect);
    assert.match(r ?? "", /tanpa nonce/);
  });

  test("token tanpa email ditolak — pencocokan akun memakai email", () => {
    const { email: _drop, ...tanpaEmail } = baseClaims;
    assert.match(idTokenRejection(tanpaEmail, expect) ?? "", /tanpa alamat email/);
  });

  test("email_verified=false ditolak", () => {
    const r = idTokenRejection({ ...baseClaims, email_verified: false }, expect);
    assert.match(r ?? "", /belum diverifikasi/);
  });

  test("email_verified tidak dikirim tetap diterima", () => {
    // Menolak ketiadaan klaim akan mematikan penyedia yang memang tidak
    // mengirimkannya.
    assert.equal(idTokenRejection(baseClaims, expect), null);
  });

  test("token tanpa subject ditolak", () => {
    const { sub: _drop, ...tanpaSub } = baseClaims;
    assert.match(idTokenRejection(tanpaSub, expect) ?? "", /tanpa subject/);
  });
});

describe("resolveAccount — pencocokan akun", () => {
  const claims = { sub: "sub-teguh", email: "teguh@perumnet.id" };
  const akun = {
    id: "u1",
    email: "teguh@perumnet.id",
    isActive: true,
    frozenAt: null,
    oidcSubject: null,
  };

  test("akun belum tertaut → diterima dan ditandai untuk ditautkan", () => {
    const r = resolveAccount(claims, akun);
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.bindSubject, true);
  });

  test("akun sudah tertaut ke subject yang sama → diterima tanpa menautkan ulang", () => {
    const r = resolveAccount(claims, { ...akun, oidcSubject: "sub-teguh" });
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.bindSubject, false);
  });

  test("TIDAK ADA AKUN CRM → ditolak, bukan dibuatkan otomatis", () => {
    // Membuat akun otomatis berarti siapa pun yang diterima IdP langsung
    // punya akun CRM, dan peran/izinnya harus ditetapkan sadar oleh admin.
    const r = resolveAccount(claims, null);
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /Tidak ada akun CRM/);
  });

  test("SUBJECT BERBEDA dengan email sama → DITOLAK", () => {
    // Tanpa aturan ini, menghapus lalu membuat ulang pengguna di IdP dengan
    // alamat yang sama akan mengambil alih akun CRM beserta seluruh izinnya.
    const r = resolveAccount(claims, { ...akun, oidcSubject: "sub-orang-lain" });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /sudah tertaut ke identitas lain/);
  });

  test("akun nonaktif ditolak meski identitasnya sah", () => {
    const r = resolveAccount(claims, { ...akun, isActive: false });
    assert.equal(r.ok, false);
  });

  test("akun beku ditolak — keputusan CRM tidak dibatalkan oleh IdP", () => {
    const r = resolveAccount(claims, { ...akun, frozenAt: new Date("2026-06-01") });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /dibekukan/);
  });
});

describe("localLoginBlocker — jalur darurat", () => {
  test("provider LOCAL: semua akun boleh password lokal", () => {
    assert.equal(localLoginBlocker("LOCAL", { allowLocalLogin: false }), null);
  });

  test("provider OIDC: akun biasa DITOLAK memakai password lokal", () => {
    // Tanpa ini, mencabut akses seseorang di Authentik tidak berarti apa-apa
    // selama hash lamanya masih ada di CRM.
    const r = localLoginBlocker("OIDC", { allowLocalLogin: false });
    assert.match(r ?? "", /sudah dinonaktifkan/);
  });

  test("provider OIDC: akun darurat tetap boleh", () => {
    assert.equal(localLoginBlocker("OIDC", { allowLocalLogin: true }), null);
  });

  test("MAILSERVER TIDAK lagi diperlakukan sama dengan OIDC (Fase 53)", () => {
    // Diubah saat mailserver benar-benar menjadi sumber identitas. Bedanya:
    // di mode OIDC tidak ada form password sama sekali, sedangkan di mode
    // MAILSERVER form-nya justru tetap dipakai — yang pindah cuma tempat
    // pemeriksaannya, dari hash lokal ke mailserver. Memblokirnya di sini
    // akan mematikan satu-satunya jalan masuk yang tersedia.
    assert.equal(localLoginBlocker("MAILSERVER", { allowLocalLogin: false }), null);
    assert.equal(localLoginBlocker("MAILSERVER", { allowLocalLogin: true }), null);
    // Tapi pemakaiannya tetap dianggap jalur darurat bila akunnya memang
    // ditandai begitu — catatan dan pemberitahuannya tidak boleh hilang.
    assert.equal(isBreakGlassLogin("MAILSERVER", { allowLocalLogin: true }), true);
  });

  test("pemakaian darurat dikenali untuk dicatat", () => {
    assert.equal(isBreakGlassLogin("OIDC", { allowLocalLogin: true }), true);
    assert.equal(isBreakGlassLogin("LOCAL", { allowLocalLogin: true }), false, "di mode LOCAL itu login biasa");
    assert.equal(isBreakGlassLogin("OIDC", { allowLocalLogin: false }), false);
  });
});

describe("callbackRejection — penjaga di titik balik", () => {
  const stored = { state: "state-xyz" };

  test("state cocok dan ada kode → diterima", () => {
    assert.equal(callbackRejection({ state: "state-xyz", code: "kode" }, stored), null);
  });

  test("STATE TIDAK COCOK ditolak", () => {
    const r = callbackRejection({ state: "state-palsu", code: "kode" }, stored);
    assert.match(r ?? "", /state tidak cocok/);
  });

  test("tanpa state ditolak", () => {
    assert.notEqual(callbackRejection({ code: "kode" }, stored), null);
  });

  test("tanpa cookie alur → ditolak, tidak dianggap sah", () => {
    const r = callbackRejection({ state: "apa pun", code: "kode" }, null);
    assert.match(r ?? "", /tidak dikenali atau sudah kedaluwarsa/);
  });

  test("penyedia mengirim error diteruskan apa adanya", () => {
    const r = callbackRejection({ error: "access_denied" }, stored);
    assert.match(r ?? "", /access_denied/);
  });

  test("state cocok tapi tanpa kode ditolak", () => {
    const r = callbackRejection({ state: "state-xyz" }, stored);
    assert.match(r ?? "", /kode otorisasi/);
  });
});

describe("timingSafeEqual", () => {
  test("sama → true", () => assert.equal(timingSafeEqual("abc", "abc"), true));
  test("beda → false", () => assert.equal(timingSafeEqual("abc", "abd"), false));
  test("panjang beda → false", () => assert.equal(timingSafeEqual("abc", "ab"), false));
  test("kosong sama → true", () => assert.equal(timingSafeEqual("", ""), true));
});

describe("displayNameFrom", () => {
  test("memakai name bila ada", () => {
    assert.equal(displayNameFrom({ name: "Teguh" }, "x"), "Teguh");
  });
  test("jatuh ke preferred_username", () => {
    assert.equal(displayNameFrom({ preferred_username: "teguh" }, "x"), "teguh");
  });
  test("jatuh ke nilai cadangan bila keduanya kosong", () => {
    assert.equal(displayNameFrom({}, "cadangan"), "cadangan");
  });
});

describe("isOidcBypassPath — jalur yang lolos middleware", () => {
  test("jalur mulai dan callback dilewatkan", () => {
    assert.equal(isOidcBypassPath("/api/auth/oidc/start"), true);
    assert.equal(isOidcBypassPath("/api/auth/callback/oidc"), true);
  });

  test("halaman biasa TIDAK dilewatkan", () => {
    // Kalau ini pernah jadi true, seluruh aplikasi terbuka tanpa sesi.
    for (const p of ["/dashboard", "/settings/users", "/api/search", "/"]) {
      assert.equal(isOidcBypassPath(p), false, `${p} tidak boleh lolos`);
    }
  });

  test("path yang hanya MENGANDUNG jalur oidc tidak lolos", () => {
    // startsWith, bukan includes — "/x/api/auth/oidc/" tidak boleh lolos.
    assert.equal(isOidcBypassPath("/x/api/auth/oidc/start"), false);
  });
});
