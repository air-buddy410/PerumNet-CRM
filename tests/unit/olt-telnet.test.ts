import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { bacaKredensialOlt, OltTelnetError, adaPrompt, tandaGagalMasuk, periksaPerintahBaca, PerintahDitolak, jalankanPerintah } from "@/lib/olt-telnet";

describe("bacaKredensialOlt", () => {
  test("penanda sementara Fase 81 DITOLAK dengan alasan yang benar", () => {
    // Kalau lolos, sambungan mencoba masuk memakai token pemantauan sebagai
    // password dan gagal dengan pesan "password salah" — menyesatkan orang
    // memeriksa kredensial, padahal yang salah penunjuknya.
    assert.throws(
      () => bacaKredensialOlt("LIBRENMS_API_TOKEN"),
      (e: Error) => e instanceof OltTelnetError && /penanda sementara/.test(e.message)
    );
  });

  test("credentialRef kosong ditolak sebelum menyentuh jaringan", () => {
    assert.throws(() => bacaKredensialOlt(null), OltTelnetError);
    assert.throws(() => bacaKredensialOlt("   "), OltTelnetError);
  });

  test("env var yang belum diisi disebut NAMANYA supaya bisa dicari", () => {
    assert.throws(
      () => bacaKredensialOlt("OLT_TIDAK_ADA_CRED"),
      (e: Error) => /OLT_TIDAK_ADA_CRED/.test(e.message)
    );
  });

  test("bentuk user:password diurai; password boleh memuat titik dua", () => {
    process.env.OLT_UJI_CRED = "admin:sandi:dengan:titikdua";
    const k = bacaKredensialOlt("OLT_UJI_CRED");
    assert.equal(k.user, "admin");
    assert.equal(k.password, "sandi:dengan:titikdua");
    delete process.env.OLT_UJI_CRED;
  });

  test("isi tanpa titik dua ditolak, dan pesannya TIDAK mengutip isinya", () => {
    process.env.OLT_UJI2_CRED = "cumapassword";
    try {
      bacaKredensialOlt("OLT_UJI2_CRED");
      assert.fail("seharusnya melempar");
    } catch (e) {
      assert.ok(e instanceof OltTelnetError);
      // Mengutip isinya berarti menaruh rahasia di log.
      assert.doesNotMatch((e as Error).message, /cumapassword/);
    }
    delete process.env.OLT_UJI2_CRED;
  });
});

// ── Keluaran perangkat SUNGGUHAN, direkam 17 Agustus 2026 ───────

const BANNER_C600 =
  "        *********************************************************\r\n" +
  "                Welcome to TITAN series OLT of ZTE Corporation\r\n" +
  "        *********************************************************\r\n" +
  "Login at 10:54:47 08-17-2026 from 192.168.100.1 through TELNET.\r\n" +
  "The last successful login was performed at 10:53:16 08-17-2026 from 192.168.100.\r\n" +
  "1 through TELNET. Afterwards, 0 authentication failure occurred.\r\nZXAN#";

const BANNER_HSGQ =
  "\r\n\r\nOLT> \r\n[2026/08/17 11:34:19]  Info: ONU 6/61 ZTEGcc98debf ONU authorization success\r\n";

const GALAT_PERINTAH = "show version\r\n      ^\r\n%Error 140303: Invalid input detected at '^' marker.\r\nZXAN#";

describe("adaPrompt", () => {
  test("prompt ZTE di ujung banner dikenali", () => {
    assert.equal(adaPrompt(BANNER_C600), true);
  });

  test("baris log HSGQ yang menyusul prompt tidak menyembunyikannya", () => {
    // HSGQ menyelipkan `[2026/08/17 …] Info: ONU …` tanpa diminta. Deteksi
    // yang menuntut prompt persis di ujung buffer akan menunggu selamanya.
    assert.equal(adaPrompt(BANNER_HSGQ), true);
  });

  test("teks tanpa prompt tetap ditolak", () => {
    assert.equal(adaPrompt("Username:"), false);
    assert.equal(adaPrompt("sedang memproses...\r\n"), false);
  });
});

describe("tandaGagalMasuk", () => {
  test("banner sukses TIDAK dianggap gagal meski memuat kata authentication", () => {
    // "Afterwards, 0 authentication failure occurred." adalah kalimat pada
    // login yang BERHASIL. Salah membacanya membuat orang mengganti password
    // yang sebenarnya sudah benar.
    assert.equal(tandaGagalMasuk(BANNER_C600), false);
  });

  test("galat PERINTAH bukan galat kredensial", () => {
    // `%Error 140303` datang dari perintah yang tidak dikenal perangkat.
    // Versi pertama melaporkannya sebagai "kredensial ditolak" — diagnosis
    // yang menyesatkan, dan inilah tes yang menahannya kembali.
    assert.equal(tandaGagalMasuk(GALAT_PERINTAH), false);
  });

  test("kegagalan masuk yang sungguhan dikenali", () => {
    assert.equal(tandaGagalMasuk("Login incorrect"), true);
    assert.equal(tandaGagalMasuk("% Authentication failed"), true);
    assert.equal(tandaGagalMasuk("Access denied"), true);
  });
});

describe("tandaGagalMasuk — kalimat vendor yang sungguhan", () => {
  test("ZTE C600: '% Username or password error' dikenali", () => {
    // Kalimat ini tidak memuat "failed" maupun "denied". Daftar kata kunci
    // saja melewatkannya, dan sesi menggantung sampai kehabisan waktu — yang
    // terbaca seperti perangkat mati, padahal sandinya yang salah.
    assert.equal(tandaGagalMasuk("\r\n% Username or password error\r\nUsername:"), true);
  });

  test("kembali ke prompt Username = penolakan, apa pun bahasanya", () => {
    // Tanda yang tidak bergantung vendor: sesudah sandi dikirim, satu-satunya
    // alasan perangkat menanyakan nama lagi adalah karena yang tadi ditolak.
    assert.equal(tandaGagalMasuk("\r\nUsername:"), true);
    assert.equal(tandaGagalMasuk("login: "), true);
  });

  test("prompt Username SEBELUM sandi dikirim tidak ikut terjaring", () => {
    // Pemeriksaan ini hanya berjalan pada tahap MASUK — sesudah sandi
    // terkirim — jadi banner awal tidak pernah sampai ke sini.
    assert.equal(tandaGagalMasuk(BANNER_C600), false);
    assert.equal(tandaGagalMasuk(BANNER_HSGQ), false);
  });
});

describe("tembok baca-saja", () => {
  test("perintah yang MENGUBAH ditolak sebelum menyentuh soket", () => {
    // Diminta pemilik jaringan: yang boleh berubah hanya basis data CRM.
    for (const p of [
      "no vlan 100", "reboot", "save", "write memory", "copy running startup",
      "ont delete 8 0", "service-port 1 vlan 100", "user add admin", "set interface",
    ]) {
      assert.throws(() => periksaPerintahBaca(p), PerintahDitolak, `"${p}" harus ditolak`);
    }
  });

  test("perintah membaca dan berpindah mode diizinkan", () => {
    for (const p of ["show ont-info 8 all", "enable", "configure", "exit", "?", "show ?"]) {
      assert.doesNotThrow(() => periksaPerintahBaca(p), `"${p}" harus lolos`);
    }
  });

  test("perintah menumpang di belakang pemisah ditolak", () => {
    // Tanpa ini, "show version; reboot" lolos karena kata pertamanya `show`.
    assert.throws(() => periksaPerintahBaca("show version; reboot"), PerintahDitolak);
    assert.throws(() => periksaPerintahBaca("show version\nno vlan 1"), PerintahDitolak);
    assert.throws(() => periksaPerintahBaca("show version | reboot"), PerintahDitolak);
  });

  test("kata pertama yang diperiksa, bukan pola di tengah kalimat", () => {
    // "reboot show" tidak boleh lolos hanya karena memuat kata `show`.
    assert.throws(() => periksaPerintahBaca("reboot show"), PerintahDitolak);
  });
});

describe("tembok terpasang pada jalur kirim, bukan cuma tersedia", () => {
  test("jalankanPerintah menolak perintah mengubah TANPA membuka soket", () => {
    // Tes ini menjaga hal yang berbeda dari tes daftar putih di atas: bukan
    // "apakah aturannya benar", melainkan "apakah aturannya DIPAKAI". Tanpa
    // ini, menghapus satu baris pemanggil membuat seluruh tembok tidak
    // berguna sementara semua tes tetap hijau.
    //
    // Host-nya sengaja alamat yang tidak bisa dirutekan: kalau penjaga hilang,
    // fungsinya akan mencoba menyambung alih-alih melempar seketika.
    assert.throws(
      () =>
        jalankanPerintah(
          { host: "192.0.2.1", port: 23, user: "x", password: "y" },
          ["show version", "reboot"]
        ),
      PerintahDitolak
    );
  });

  test("perintah membaca tidak ditolak penjaga (gagalnya nanti di jaringan)", () => {
    // Tidak melempar SEKETIKA — ia mengembalikan Promise yang gagal belakangan
    // karena hostnya tidak ada. Yang diuji di sini: penjaga tidak menahannya.
    const janji = jalankanPerintah(
      { host: "192.0.2.1", port: 23, user: "x", password: "y", timeoutMs: 300 },
      ["show version"]
    );
    assert.ok(janji instanceof Promise);
    janji.catch(() => {});
  });
});
