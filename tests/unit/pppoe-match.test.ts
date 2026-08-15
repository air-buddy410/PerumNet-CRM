import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { matchUsernames, nameCorroborates, numbersIn } from "@/lib/pppoe-match";

// Nilai di berkas ini disalin dari data PerumNet yang sebenarnya.
const K = [
  { serviceNumber: "PN102042532", customerName: "I Kadek Toni Mardika" },
  { serviceNumber: "PN102042533", customerName: "Ni Ketut Merta" },
  { serviceNumber: "PN1021010008", customerName: "Ni Luh Putu Suriyasih" },
  { serviceNumber: "PN260801705", customerName: "Ni Made Darmini" },
];

describe("nameCorroborates", () => {
  test("nama yang jarang menguatkan pasangan", () => {
    assert.equal(nameCorroborates("sryb_042532_mardika", "I Kadek Toni Mardika"), true);
    assert.equal(nameCorroborates("sry_1010008_suriyasih", "Ni Luh Putu Suriyasih"), true);
  });

  test("nama Bali yang umum TIDAK menguatkan apa pun", () => {
    // "wayan", "kadek", "komang" muncul pada ratusan pelanggan. Membiarkannya
    // menguatkan sama saja dengan tidak memeriksa nama sama sekali.
    assert.equal(nameCorroborates("sryb_042532_kadek", "I Kadek Toni Mardika"), false);
    assert.equal(nameCorroborates("bgy_01_wayan", "I Wayan Pasek"), false);
  });

  test("nama yang tidak ada di username tidak menguatkan", () => {
    assert.equal(nameCorroborates("sryb_042532_mardika", "Ni Ketut Merta"), false);
  });
});

describe("numbersIn", () => {
  test("hanya angka empat digit ke atas — itu nomor pelanggan, bukan indeks", () => {
    assert.deepEqual(numbersIn("sryb_042532_mardika"), ["042532"]);
    assert.deepEqual(numbersIn("bgy07sugiana04"), []);
    assert.deepEqual(numbersIn("sry_1010008_x"), ["1010008"]);
  });
});

describe("matchUsernames", () => {
  test("username yang SAMA dengan nomor layanan dipasangkan tanpa menebak", () => {
    const h = matchUsernames(["PN260801705"], K);
    assert.equal(h.matched.length, 1);
    assert.equal(h.matched[0].how, "EXACT");
  });

  test("nomor lama sebagai akhiran CID, dikuatkan nama", () => {
    const h = matchUsernames(["sryb_042532_mardika"], K);
    assert.equal(h.matched.length, 1);
    assert.equal(h.matched[0].serviceNumber, "PN102042532");
    assert.equal(h.matched[0].how, "SUFFIX");
    assert.equal(h.matched[0].nameCorroborated, true);
  });

  test("nomor cocok tapi nama TIDAK — dibiarkan yatim, bukan dipasangkan", () => {
    // Pola paling berbahaya: dua pelanggan yang nomornya berdekatan. Sesi
    // yatim terlihat sebagai pekerjaan belum selesai; sesi yang salah
    // terlihat sebagai pekerjaan yang sudah beres.
    const h = matchUsernames(["sryb_042532_entahsiapa"], K);
    assert.equal(h.matched.length, 0);
    assert.deepEqual(h.ambiguous, ["sryb_042532_entahsiapa"]);
  });

  test("tanpa syarat nama, pasangan berbasis angka diterima", () => {
    const h = matchUsernames(["sryb_042532_entahsiapa"], K, false);
    assert.equal(h.matched.length, 1);
    assert.equal(h.matched[0].nameCorroborated, false);
  });

  test("username tanpa angka panjang tidak punya kandidat", () => {
    const h = matchUsernames(["bgy07sugiana04"], K);
    assert.deepEqual(h.unmatched, ["bgy07sugiana04"]);
  });

  test("dua CID berakhiran sama disaring oleh nama; bila tetap dua, tidak dipilih", () => {
    const dua = [
      { serviceNumber: "PN1000042532", customerName: "Orang Pertama" },
      { serviceNumber: "PN1020042532", customerName: "Orang Kedua" },
    ];
    assert.deepEqual(matchUsernames(["x_0042532_y"], dua).ambiguous, ["x_0042532_y"]);
    const h = matchUsernames(["x_0042532_pertama"], dua);
    assert.equal(h.matched.length, 1);
    assert.equal(h.matched[0].serviceNumber, "PN1000042532");
  });
});
