import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  bersihkanIdentitas,
  bersihkanSemua,
  rapikanTelepon,
  rapikanKoordinat,
  rapikanTanggal,
  rapikanEmail,
} from "@/lib/customer-identity-import";

// Nilai-nilai di berkas ini disalin dari sistem lama PerumNet, bukan dikarang.

describe("rapikanTelepon", () => {
  test("nomor yang sudah benar tidak diubah", () => {
    assert.equal(rapikanTelepon("085738146195"), "085738146195");
    assert.equal(rapikanTelepon("081237067583"), "081237067583");
  });

  test("nol di depan dikembalikan bila hilang", () => {
    // Spreadsheet membuang nol pertama karena mengira kolomnya angka.
    assert.equal(rapikanTelepon("85738146195"), "085738146195");
  });

  test("bentuk +62 dan 62 diseragamkan", () => {
    assert.equal(rapikanTelepon("+6285738146195"), "085738146195");
    assert.equal(rapikanTelepon("6285738146195"), "085738146195");
  });

  test('"-" berarti tidak ada, bukan nomor', () => {
    // Inilah yang mengisi SELURUH 1.711 baris di produksi: bukan null,
    // melainkan tanda hubung — sehingga kolomnya tampak terisi.
    assert.equal(rapikanTelepon("-"), null);
    assert.equal(rapikanTelepon(""), null);
    assert.equal(rapikanTelepon("0"), null);
  });

  test("yang jelas bukan nomor ditolak", () => {
    assert.equal(rapikanTelepon("tidak ada"), null);
    assert.equal(rapikanTelepon("0812"), null);
  });
});

describe("rapikanKoordinat", () => {
  test("koordinat Karangasem diterima", () => {
    assert.deepEqual(rapikanKoordinat("-8.431201", "115.668472"), { lat: -8.431201, lng: 115.668472 });
  });

  test("(0,0) ditolak — itu belum diisi, bukan Teluk Guinea", () => {
    assert.equal(rapikanKoordinat("0", "0"), null);
  });

  test("titik di luar Bali ditolak", () => {
    // Menyimpannya melemparkan penanda peta ke tengah samudra, dan tidak ada
    // yang menyadarinya sampai seseorang membuka petanya.
    assert.equal(rapikanKoordinat("-6.2", "106.8"), null); // Jakarta
    assert.equal(rapikanKoordinat("115.668472", "-8.431201"), null); // tertukar
  });
});

describe("rapikanTanggal & rapikanEmail", () => {
  test("hanya YYYY-MM-DD yang diterima", () => {
    assert.equal(rapikanTanggal("1986-06-08")?.toISOString().slice(0, 10), "1986-06-08");
    assert.equal(rapikanTanggal("08/06/1986"), null);
    assert.equal(rapikanTanggal("-"), null);
  });

  test("tahun mustahil ditolak", () => {
    assert.equal(rapikanTanggal("0008-11-14"), null);
    assert.equal(rapikanTanggal("2034-11-15"), null);
  });

  test("email diseragamkan huruf kecil", () => {
    assert.equal(rapikanEmail("SanaWayan920@Gmail.com"), "sanawayan920@gmail.com");
    assert.equal(rapikanEmail("bukan-email"), null);
  });
});

describe("bersihkanIdentitas — NIK memeriksa tanggal lahirnya sendiri", () => {
  test("NIK dan tanggal yang cocok diterima keduanya", () => {
    // 5107 04 080686 0007 → 8 Juni 1986, laki-laki. Nilai asli dari sistem lama.
    const h = bersihkanIdentitas({
      serviceNumber: "PN260815362", nik: "5107040806860007", dob: "1986-06-08",
      phone: "085738146195", lat: "-8.431201", lng: "115.668472",
    });
    assert.equal(h.masalah.length, 0);
    assert.equal(h.bersih.identityNumber, "5107040806860007");
    assert.equal(h.bersih.birthDate?.toISOString().slice(0, 10), "1986-06-08");
  });

  test("NIK dan tanggal yang BERSELISIH membuang KEDUANYA", () => {
    // Yang salah bisa NIK-nya, bisa tanggalnya, dan dari sini tidak ada cara
    // membedakan. Memilih salah satu berarti menebak pada bidang yang justru
    // dipakai membuktikan identitas orang.
    const h = bersihkanIdentitas({
      serviceNumber: "PN1", nik: "5107040806860007", dob: "1990-01-01",
    });
    assert.equal(h.bersih.identityNumber, null);
    assert.equal(h.bersih.birthDate, null);
    assert.match(h.masalah[0], /keduanya tidak dipakai/);
  });

  test("NIK diturunkan tanggalnya walau kolom tanggal kosong", () => {
    const h = bersihkanIdentitas({ serviceNumber: "PN1", nik: "5107040806860007" });
    assert.equal(h.bersih.birthDate?.toISOString().slice(0, 10), "1986-06-08");
  });

  test("NIK yang bukan 16 digit dilaporkan, tanggalnya tetap dipakai", () => {
    const h = bersihkanIdentitas({ serviceNumber: "PN1", nik: "51070408", dob: "1986-06-08" });
    assert.equal(h.bersih.identityNumber, null);
    assert.equal(h.bersih.birthDate?.toISOString().slice(0, 10), "1986-06-08");
    assert.match(h.masalah[0], /bukan 16 digit/);
  });

  test("hari +40 pada NIK perempuan tetap terbaca", () => {
    const h = bersihkanIdentitas({ serviceNumber: "PN1", nik: "5107054806860002" });
    assert.equal(h.bersih.birthDate?.toISOString().slice(0, 10), "1986-06-08");
  });
});

describe("bersihkanSemua — NIK unik", () => {
  test("NIK yang dipakai dua pelanggan tidak disimpan untuk keduanya", () => {
    // `identityNumber` unik pada skema. Menyimpan yang pertama dan menolak yang
    // kedua berarti memilih berdasarkan urutan baris, yang tidak berarti apa-apa.
    const h = bersihkanSemua([
      { serviceNumber: "PN1", nik: "5107040806860007" },
      { serviceNumber: "PN2", nik: "5107040806860007" },
      { serviceNumber: "PN3", nik: "5107054806860002" },
    ]);
    assert.equal(h.bersih.find((b) => b.serviceNumber === "PN1")!.identityNumber, null);
    assert.equal(h.bersih.find((b) => b.serviceNumber === "PN2")!.identityNumber, null);
    assert.equal(h.bersih.find((b) => b.serviceNumber === "PN3")!.identityNumber, "5107054806860002");
    assert.equal(h.masalah.filter((m) => /dipakai 2 pelanggan/.test(m.pesan)).length, 2);
  });

  test("tanggal lahir TETAP dipakai walau NIK-nya dilepas", () => {
    // Yang meragukan nomornya, bukan tanggalnya — dan tanggal lahir memang
    // tidak harus unik.
    const h = bersihkanSemua([
      { serviceNumber: "PN1", nik: "5107040806860007" },
      { serviceNumber: "PN2", nik: "5107040806860007" },
    ]);
    assert.equal(h.bersih[0].birthDate?.toISOString().slice(0, 10), "1986-06-08");
  });
});

describe("bersihkanSemua — titik bawaan peta", () => {
  test("koordinat yang dipakai puluhan pelanggan TIDAK disimpan", () => {
    // Nilai asli dari salinan 16 Agustus 2026: satu titik muncul 59 kali
    // dengan lima belas angka di belakang koma — pusat peta yang tersimpan
    // ketika operator membuka formulir tanpa menggeser penanda.
    const rows = Array.from({ length: 8 }, (_, i) => ({
      serviceNumber: `PN${i}`, lat: "-8.449970331760369", lng: "115.59114508454392",
    }));
    const h = bersihkanSemua(rows);
    assert.equal(h.bersih.filter((b) => b.latitude !== null).length, 0);
    assert.equal(h.masalah.filter((m) => /titik bawaan peta/.test(m.pesan)).length, 8);
  });

  test("beberapa pelanggan berbagi satu titik tetap diterima", () => {
    // Satu pekarangan, satu kos, satu ruko bertingkat — itu wajar.
    const rows = Array.from({ length: 3 }, (_, i) => ({
      serviceNumber: `PN${i}`, lat: "-8.438337", lng: "115.674357",
    }));
    const h = bersihkanSemua(rows);
    assert.equal(h.bersih.filter((b) => b.latitude !== null).length, 3);
    assert.equal(h.masalah.length, 0);
  });
});

describe("nikMenang — keputusan pemilik jaringan", () => {
  const bentrok = { serviceNumber: "PN1", nik: "5107040806860007", dob: "1990-01-01" };

  test("bawaannya tetap membuang keduanya", () => {
    const h = bersihkanIdentitas(bentrok);
    assert.equal(h.bersih.identityNumber, null);
    assert.equal(h.bersih.birthDate, null);
  });

  test("dengan nikMenang, NIK dan tanggal dari NIK yang dipakai", () => {
    // NIK disalin dari kartu di tangan; tanggal lahir diketik dari ingatan.
    const h = bersihkanIdentitas(bentrok, true);
    assert.equal(h.bersih.identityNumber, "5107040806860007");
    assert.equal(h.bersih.birthDate?.toISOString().slice(0, 10), "1986-06-08");
  });

  test("selisihnya TETAP dilaporkan walau pemenangnya sudah dipilih", () => {
    // Memilih pemenang tidak membuat yang kalah menjadi benar — sesuatu di
    // sumbernya tetap salah dan pantas diketahui.
    const h = bersihkanIdentitas(bentrok, true);
    assert.equal(h.masalah.length, 1);
    assert.match(h.masalah[0], /dipakai yang dari NIK/);
  });

  test("nikMenang TIDAK menyelamatkan NIK yang tanggalnya tidak masuk akal", () => {
    // Hari 99 bukan tanggal. Yang menang tetap harus bisa dibaca.
    const h = bersihkanIdentitas({ serviceNumber: "PN1", nik: "5107049906860007", dob: "1990-01-01" }, true);
    assert.equal(h.bersih.identityNumber, null);
    assert.equal(h.bersih.birthDate?.toISOString().slice(0, 10), "1990-01-01");
  });

  test("nikMenang TIDAK melonggarkan larangan NIK ganda", () => {
    const h = bersihkanSemua([
      { serviceNumber: "PN1", nik: "5107040806860007", dob: "1990-01-01" },
      { serviceNumber: "PN2", nik: "5107040806860007" },
    ], true);
    assert.equal(h.bersih.every((b) => b.identityNumber === null), true);
  });
});
