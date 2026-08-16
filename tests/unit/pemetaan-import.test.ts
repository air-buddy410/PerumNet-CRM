import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  bacaKeputusan,
  bacaYaTidak,
  bacaPort,
  bacaKapasitas,
  adalahTidakDipakai,
  rapikanNomor,
  rapikanOdp,
  kenaliLembar,
} from "@/lib/pemetaan-import";

// Judul kolom di berkas ini disalin PERSIS dari keluaran
// `scripts/_ekspor-tertunda.ts`, termasuk kalimat petunjuk di dalam kurung.
// Kalau ekspornya berubah dan importirnya tidak, tes ini yang gagal lebih dulu.

const J_AMBIGU = [
  "Username PPPoE", "Status", "Terakhir online", "IP terakhir", "MAC (caller-id)",
  "Kandidat: Nomor Layanan", "Kandidat: Nama Pelanggan", "Kandidat: Alamat",
  "Nama cocok?", "KEPUTUSAN (isi: BENAR / SALAH / kosongkan bila ragu)", "CATATAN",
];
const J_TANPA = [
  "Username PPPoE", "Status", "Terakhir online", "IP terakhir", "MAC (caller-id)",
  "Angka di dalam username", "KEPUTUSAN (isi Nomor Layanan, atau: TIDAK DIPAKAI)", "CATATAN",
];
const J_PORT = [
  "Nomor Layanan", "Nama Pelanggan", "Alamat", "Telepon", "Paket", "Username PPPoE",
  "KEPUTUSAN: Kode ODP", "KEPUTUSAN: Nomor Port", "CATATAN",
];
const J_KAP = [
  "Kode ODP", "Peran", "Port terpakai", "Kapasitas tercatat", "Lintang", "Bujur",
  "KEPUTUSAN: Kapasitas sebenarnya (8 atau 16)", "CATATAN",
];

function barisAmbigu(username: string, kandidat: string, keputusan: string, catatan = "") {
  return [username, "ONLINE", "2026-08-16", "10.0.0.1", "AA:BB", kandidat, "Nama", "Alamat", "tidak", keputusan, catatan];
}

describe("kenaliLembar", () => {
  test("lembar dikenali dari judul kolom, bukan nama tab", () => {
    assert.equal(kenaliLembar(J_AMBIGU), "ambigu");
    assert.equal(kenaliLembar(J_TANPA), "tanpa-kandidat");
    assert.equal(kenaliLembar(J_PORT), "port");
    assert.equal(kenaliLembar(J_KAP), "kapasitas");
  });

  test("lembar petunjuk dan lembar asing menghasilkan null", () => {
    assert.equal(kenaliLembar(["PEMETAAN YANG MENUNGGU KEPUTUSAN ORANG"]), null);
    assert.equal(kenaliLembar(["Tanggal", "Teknisi", "Jam"]), null);
  });

  test("lembar port TIDAK tertukar dengan lembar tanpa-kandidat", () => {
    // Lembar port memuat "Username PPPoE" sebagai keterangan. Pemeriksaan
    // "punya username dan punya keputusan" akan mengakuinya sebagai lembar
    // tanpa-kandidat, lalu membaca kode ODP sebagai nomor layanan.
    assert.equal(kenaliLembar(J_PORT), "port");
  });

  test("lembar kapasitas TIDAK tertukar dengan lembar port", () => {
    // "Port terpakai" ada di lembar kapasitas dan namanya mirip "Nomor Port".
    assert.equal(kenaliLembar(J_KAP), "kapasitas");
  });

  test("kolom yang dipindahkan tim tetap dikenali", () => {
    // Orang menyeret kolom. Pengenalan berbasis posisi akan diam-diam membaca
    // kolom yang salah; berbasis nama tidak.
    assert.equal(kenaliLembar([...J_AMBIGU].reverse()), "ambigu");
  });
});

describe("bacaKeputusan — sesi ambigu", () => {
  test("BENAR menghasilkan tautan, SALAH tidak menghasilkan apa-apa", () => {
    const h = bacaKeputusan([{
      nama: "1. Sesi ambigu",
      baris: [
        J_AMBIGU,
        barisAmbigu("abg_032626_putu", "PN104032626", "BENAR"),
        barisAmbigu("abg_022614_sariani", "PN104022614", "SALAH"),
      ],
    }]);
    assert.deepEqual(h.taut, [{ username: "abg_032626_putu", serviceNumber: "PN104032626", catatan: null }]);
    assert.equal(h.masalah.length, 0);
  });

  test("DUA BENAR pada satu username ditolak seluruhnya", () => {
    // Ini kontradiksi, bukan dua keputusan. Memilih salah satu berarti menebak
    // justru pada baris yang orangnya sendiri belum yakin.
    const h = bacaKeputusan([{
      nama: "1. Sesi ambigu",
      baris: [
        J_AMBIGU,
        barisAmbigu("sry_1010024_sunarta", "PN1021010024", "BENAR"),
        barisAmbigu("sry_1010024_sunarta", "PN1021010025", "BENAR"),
      ],
    }]);
    assert.equal(h.taut.length, 0);
    assert.equal(h.masalah.length, 1);
    assert.match(h.masalah[0].pesan, /2 kandidat/);
  });

  test("kosong berarti ragu, dan ragu bukan masalah", () => {
    const h = bacaKeputusan([{
      nama: "1. Sesi ambigu",
      baris: [J_AMBIGU, barisAmbigu("a_1", "PN1", ""), barisAmbigu("a_2", "PN2", "   ")],
    }]);
    assert.equal(h.taut.length, 0);
    assert.equal(h.masalah.length, 0);
    assert.equal(h.dilewati, 2);
  });

  test("jawaban yang tidak dikenali DILAPORKAN, bukan ditebak", () => {
    const h = bacaKeputusan([{
      nama: "1. Sesi ambigu",
      baris: [J_AMBIGU, barisAmbigu("a_1", "PN1", "kayaknya iya")],
    }]);
    assert.equal(h.taut.length, 0);
    assert.equal(h.masalah.length, 1);
    assert.match(h.masalah[0].pesan, /tidak dikenali/);
    assert.equal(h.masalah[0].baris, 2);
  });

  test("huruf besar-kecil dan ejaan sehari-hari diterima", () => {
    const h = bacaKeputusan([{
      nama: "x",
      baris: [J_AMBIGU, barisAmbigu("a_1", "PN1", "benar"), barisAmbigu("a_2", "PN2", " Ya ")],
    }]);
    assert.equal(h.taut.length, 2);
  });

  test("BENAR tanpa nomor kandidat dilaporkan", () => {
    const h = bacaKeputusan([{ nama: "x", baris: [J_AMBIGU, barisAmbigu("a_1", "", "BENAR")] }]);
    assert.equal(h.taut.length, 0);
    assert.match(h.masalah[0].pesan, /tidak memuat nomor layanan/);
  });
});

describe("bacaKeputusan — tanpa kandidat", () => {
  const b = (u: string, kep: string) => [u, "OFFLINE", "", "", "", "022613", kep, ""];

  test("nomor layanan menghasilkan tautan, TIDAK DIPAKAI menghasilkan abaikan", () => {
    const h = bacaKeputusan([{
      nama: "2. Tanpa kandidat",
      baris: [J_TANPA, b("abg_022613_yasa", "PN104022613"), b("Free_Gor_serayabarat", "TIDAK DIPAKAI")],
    }]);
    assert.deepEqual(h.taut, [{ username: "abg_022613_yasa", serviceNumber: "PN104022613", catatan: null }]);
    assert.deepEqual(h.abaikan, [{ username: "Free_Gor_serayabarat", catatan: null }]);
  });

  test("kalimat bebas ditolak, tidak dianggap nomor layanan", () => {
    const h = bacaKeputusan([{ nama: "x", baris: [J_TANPA, b("a_1", "nanti dicek dulu")] }]);
    assert.equal(h.taut.length, 0);
    assert.match(h.masalah[0].pesan, /bukan nomor layanan/);
  });

  test("nomor layanan dirapikan tetapi angkanya tidak disentuh", () => {
    const h = bacaKeputusan([{ nama: "x", baris: [J_TANPA, b("a_1", " pn104022613 ")] }]);
    assert.equal(h.taut[0].serviceNumber, "PN104022613");
  });
});

describe("bacaKeputusan — port dan kapasitas", () => {
  test("ODP dan nomor port terbaca", () => {
    const h = bacaKeputusan([{
      nama: "3",
      baris: [J_PORT, ["PN100032527", "N", "A", "-", "P", "u", "GMG 001", "5", "dipasang 16 Agu"]],
    }]);
    assert.deepEqual(h.port, [
      { serviceNumber: "PN100032527", odpCode: "GMG 001", portNumber: 5, catatan: "dipasang 16 Agu" },
    ]);
  });

  test("ODP terisi tetapi port kosong dilaporkan — separuh keputusan bukan keputusan", () => {
    const h = bacaKeputusan([{ nama: "3", baris: [J_PORT, ["PN1", "N", "A", "-", "P", "u", "GMG 001", "", ""]] }]);
    assert.equal(h.port.length, 0);
    assert.match(h.masalah[0].pesan, /nomor portnya kosong/);
  });

  test("rentang port ditolak — satu langganan satu port", () => {
    const h = bacaKeputusan([{ nama: "3", baris: [J_PORT, ["PN1", "N", "A", "-", "P", "u", "GMG 001", "5-6", ""]] }]);
    assert.equal(h.port.length, 0);
    assert.match(h.masalah[0].pesan, /tidak bisa dibaca sebagai satu angka/);
  });

  test("kapasitas selain 8 dan 16 ditolak", () => {
    // Ditegaskan pemilik jaringan: splitter yang dipakai hanya 1:8 dan 1:16.
    // Angka lain berarti orangnya salah baca.
    const h = bacaKeputusan([{
      nama: "4",
      baris: [J_KAP, ["BB 01", "ODP", "16", "16", "", "", "24", ""], ["GMG 001", "ODP", "16", "16", "", "", "16", ""]],
    }]);
    assert.deepEqual(h.kapasitas, [{ odpCode: "GMG 001", kapasitas: 16, catatan: null }]);
    assert.match(h.masalah[0].pesan, /hanya 1:8 dan 1:16/);
  });

  test("kolom KETERANGAN yang namanya mirip tidak dibaca sebagai jawaban", () => {
    // Ini kegagalan yang paling sunyi di seluruh importir. "Kapasitas
    // tercatat" duduk di sebelah "KEPUTUSAN: Kapasitas sebenarnya"; alias yang
    // longgar akan mengambil yang tercatat, menyimpan kembali angka yang sudah
    // ada, dan melaporkan sukses — sementara seluruh hasil survei lapangan
    // hilang tanpa satu pun galat.
    const h = bacaKeputusan([{
      nama: "4",
      // Kapasitas tercatat 8, tim menemukan sebenarnya 16.
      baris: [J_KAP, ["BB 01", "ODP", "8", "8", "", "", "16", ""]],
    }]);
    assert.deepEqual(h.kapasitas, [{ odpCode: "BB 01", kapasitas: 16, catatan: null }]);
  });

  test("kolom 'Port terpakai' tidak dibaca sebagai nomor port keputusan", () => {
    const h = bacaKeputusan([{ nama: "4", baris: [J_KAP, ["BB 01", "ODP", "16", "8", "", "", "16", ""]] }]);
    assert.equal(h.port.length, 0);
    assert.equal(h.kapasitas.length, 1);
  });

  test("kode ODP mempertahankan spasi dalamnya", () => {
    // `SRY 020105S1` dan `SRY020105S1` adalah dua ODP berbeda yang koordinatnya
    // terpisah 1,4 km. Menyeragamkan spasi akan menyatukan keduanya.
    assert.equal(rapikanOdp(" sry 020105s1 "), "SRY 020105S1");
    assert.notEqual(rapikanOdp("SRY 020105S1"), rapikanOdp("SRY020105S1"));
  });
});

describe("bacaKeputusan — pemeriksaan lintas lembar", () => {
  test("username dengan keputusan berbeda di dua lembar ditolak dua-duanya", () => {
    const h = bacaKeputusan([
      { nama: "1", baris: [J_AMBIGU, barisAmbigu("a_1", "PN1", "BENAR")] },
      { nama: "2", baris: [J_TANPA, ["a_1", "OFFLINE", "", "", "", "", "TIDAK DIPAKAI", ""]] },
    ]);
    assert.equal(h.taut.length, 0);
    assert.equal(h.abaikan.length, 0);
    assert.equal(h.masalah.length, 1);
    assert.match(h.masalah[0].pesan, /2 keputusan yang berbeda/);
  });

  test("lembar petunjuk tidak mengganggu", () => {
    const h = bacaKeputusan([
      { nama: "Petunjuk", baris: [["PEMETAAN YANG MENUNGGU KEPUTUSAN ORANG"], ["Isi hanya kolom KEPUTUSAN."]] },
      { nama: "1", baris: [J_AMBIGU, barisAmbigu("a_1", "PN1", "BENAR")] },
    ]);
    assert.equal(h.taut.length, 1);
    assert.equal(h.masalah.length, 0);
  });
});

describe("pembacaan nilai", () => {
  test("bacaYaTidak membedakan 'tidak' dari 'tidak terbaca'", () => {
    assert.equal(bacaYaTidak("BENAR"), true);
    assert.equal(bacaYaTidak("SALAH"), false);
    assert.equal(bacaYaTidak(""), null);
    assert.equal(bacaYaTidak("mungkin"), null);
  });

  test("bacaPort menerima 'port 5' tetapi menolak yang mendua", () => {
    assert.equal(bacaPort("5"), 5);
    assert.equal(bacaPort("port 5"), 5);
    assert.equal(bacaPort("0"), null);
    assert.equal(bacaPort("5 atau 6"), null);
    assert.equal(bacaPort(""), null);
  });

  test("bacaKapasitas hanya menerima 8 dan 16", () => {
    assert.equal(bacaKapasitas("8"), 8);
    assert.equal(bacaKapasitas("16 port"), 16);
    assert.equal(bacaKapasitas("24"), null);
    assert.equal(bacaKapasitas("dua belas"), null);
  });

  test("adalahTidakDipakai mengenali ejaan yang lazim", () => {
    assert.equal(adalahTidakDipakai("TIDAK DIPAKAI"), true);
    assert.equal(adalahTidakDipakai("tidak dipakai"), true);
    assert.equal(adalahTidakDipakai("mati"), true);
    assert.equal(adalahTidakDipakai("PN104022613"), false);
  });

  test("rapikanNomor tidak menyentuh angkanya", () => {
    assert.equal(rapikanNomor(" pn 102042532 "), "PN102042532");
    assert.equal(rapikanNomor("PN102042532"), "PN102042532");
  });
});
