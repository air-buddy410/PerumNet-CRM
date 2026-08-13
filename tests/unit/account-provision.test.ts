import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  nameFromLocalPart,
  usernameFromLocalPart,
  sharedMailboxReason,
  suggestFromEmail,
  uniqueUsername,
  normalizePersonName,
} from "@/lib/account-provision";

describe("nama tampilan dari alamat", () => {
  test("garis bawah menjadi spasi, tiap kata berhuruf besar", () => {
    assert.equal(nameFromLocalPart("wayan_budiarta"), "Wayan Budiarta");
    assert.equal(nameFromLocalPart("dwi_sarmilyawan"), "Dwi Sarmilyawan");
  });

  test("titik, garis datar, dan plus diperlakukan sama", () => {
    assert.equal(nameFromLocalPart("budi.dharma"), "Budi Dharma");
    assert.equal(nameFromLocalPart("ayu-sentosa"), "Ayu Sentosa");
    assert.equal(nameFromLocalPart("noly+kurnyanti"), "Noly Kurnyanti");
  });

  test("nama satu kata tetap utuh", () => {
    assert.equal(nameFromLocalPart("supratman"), "Supratman");
    assert.equal(nameFromLocalPart("julfahmi"), "Julfahmi");
  });

  test("huruf besar berlebihan dirapikan", () => {
    assert.equal(nameFromLocalPart("BUDI_PRABHAWA"), "Budi Prabhawa");
  });
});

describe("username dari alamat", () => {
  test("selalu huruf kecil", () => {
    assert.equal(usernameFromLocalPart("Wayan_Budiarta"), "wayan_budiarta");
  });

  test("karakter di luar huruf/angka/titik/garis DIBUANG", () => {
    // Dibuang, bukan diganti — supaya hasilnya bisa ditebak orang yang melihat
    // alamat aslinya.
    assert.equal(usernameFromLocalPart("bu di!*budi"), "budibudi");
  });
});

describe("dugaan alamat fungsi", () => {
  test("alamat fungsi yang jelas dikenali", () => {
    for (const s of ["helpdesk", "no-reply", "sales", "marketing", "hrd", "it", "info", "postmaster"]) {
      assert.notEqual(sharedMailboxReason(s), null, `"${s}" seharusnya dikenali sebagai alamat fungsi`);
    }
  });

  test("NAMA ORANG tidak pernah dianggap alamat fungsi", () => {
    for (const s of ["wayan_budiarta", "supratman", "julfahmi", "dwi_pranata", "ratna_suari"]) {
      assert.equal(sharedMailboxReason(s), null, `"${s}" seharusnya dianggap orang`);
    }
  });

  test("nama Indonesia SATU KATA tetap dianggap orang", () => {
    // Godaan besar: "satu kata tanpa pemisah = alamat fungsi". Aturan itu akan
    // membuang Supratman dan Julfahmi dari daftar tanpa ada yang menyadarinya.
    assert.equal(sharedMailboxReason("supratman"), null);
  });

  test("alasannya selalu ikut, bukan sekadar ya/tidak", () => {
    // IT harus bisa MENILAI dugaannya, bukan disuruh percaya.
    const s = suggestFromEmail("helpdesk@perumnet.id");
    assert.equal(s.likelyShared, true);
    assert.notEqual(s.sharedReason, null);
    assert.match(s.sharedReason!, /alamat fungsi/);
  });
});

describe("suggestFromEmail", () => {
  test("alamat orang menghasilkan usulan lengkap", () => {
    const s = suggestFromEmail("Wayan_Budiarta@PerumNet.id");
    assert.equal(s.email, "wayan_budiarta@perumnet.id", "alamat dinormalkan huruf kecil");
    assert.equal(s.suggestedName, "Wayan Budiarta");
    assert.equal(s.suggestedUsername, "wayan_budiarta");
    assert.equal(s.likelyShared, false);
  });
});

describe("username unik", () => {
  test("yang belum dipakai dibiarkan apa adanya", () => {
    assert.equal(uniqueUsername("supratman", new Set()), "supratman");
  });

  test("yang bentrok diberi angka, bukan ditolak", () => {
    // Dua orang bernama sama itu wajar. Menolak berarti IT harus memikirkan
    // username baru sendiri di tengah pembuatan tiga puluh akun.
    const taken = new Set(["supratman", "supratman2"]);
    assert.equal(uniqueUsername("supratman", taken), "supratman3");
  });
});

describe("pencocokan nama pegawai", () => {
  test("beda huruf besar-kecil dan spasi tetap dianggap sama", () => {
    assert.equal(normalizePersonName("  Wayan   Budiarta "), normalizePersonName("wayan budiarta"));
  });

  test("TIDAK ada pencocokan sebagian", () => {
    // "Budi Prabhawa" bukan "Budi Dharma Prabhawa". Menebak di sini berarti
    // memberikan akun kepada orang yang salah.
    assert.notEqual(normalizePersonName("Budi Prabhawa"), normalizePersonName("Budi Dharma Prabhawa"));
  });
});
