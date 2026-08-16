import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildWorkbook, safeSheetName } from "@/lib/xlsx-write";
import { readAllSheetRows, readSheetRows } from "@/lib/xlsx-read";

// Ujinya BOLAK-BALIK: apa yang ditulis harus terbaca kembali utuh oleh
// pembaca yang sudah dipakai impor. Memeriksa XML-nya sepotong-sepotong akan
// lolos untuk berkas yang tetap ditolak Excel.

describe("buildWorkbook", () => {
  test("satu lembar kembali persis seperti yang ditulis", () => {
    const baris = [
      ["Username", "Nomor Layanan", "Nama"],
      ["sry_1010028_parta", "PN1021010028", "I Nyoman Parti"],
    ];
    assert.deepEqual(readSheetRows(buildWorkbook([{ nama: "Uji", baris }])), baris);
  });

  test("lembar banyak tidak saling mencampuri", () => {
    // Sel bersama (`sharedStrings`) dipakai seluruh lembar dalam satu berkas.
    // Kalau penomorannya salah, isi lembar kedua muncul di lembar pertama —
    // dan itu kesalahan yang tetap menghasilkan berkas yang sah.
    const buf = buildWorkbook([
      { nama: "Pertama", baris: [["a1", "b1"], ["a2", "b2"]] },
      { nama: "Kedua", baris: [["x1"], ["x2"], ["x3"]] },
      { nama: "Ketiga", baris: [["z1"]] },
    ]);
    const semua = readAllSheetRows(buf);
    assert.equal(semua.length, 3);
    assert.deepEqual(semua[0], [["a1", "b1"], ["a2", "b2"]]);
    assert.deepEqual(semua[1], [["x1"], ["x2"], ["x3"]]);
    assert.deepEqual(semua[2], [["z1"]]);
  });

  test("paket OOXML lengkap — tanpa ini Excel menolak berkasnya", () => {
    // Penulis di tests/integration sengaja tidak memuat bagian-bagian ini,
    // dan itulah yang membuat keluarannya hanya bisa dibaca oleh kita sendiri.
    const teks = buildWorkbook([{ nama: "Uji", baris: [["a"]] }]).toString("latin1");
    for (const bagian of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/worksheets/sheet1.xml",
      "xl/sharedStrings.xml",
    ]) {
      assert.ok(teks.includes(bagian), `bagian ${bagian} tidak ada di dalam paket`);
    }
  });

  test("nomor layanan tetap TEKS, tidak berubah jadi angka", () => {
    // Nomor telepon berawalan nol dan NIK enam belas digit adalah alasan
    // seluruh berkas ini ditulis sebagai teks. Excel yang menganggapnya angka
    // membuang nol di depan dan mengubah digit panjang jadi notasi ilmiah —
    // lalu data yang dikirim balik untuk diimpor sudah rusak sejak dibuka.
    const baris = [["081246864899", "5107055107920002", "PN102042532"]];
    assert.deepEqual(readSheetRows(buildWorkbook([{ nama: "Uji", baris }])), baris);
  });

  test("teks yang memuat karakter XML tidak merusak berkas", () => {
    const baris = [["Selalang&kalanganyar", "<odp>", 'kutip "ganda"']];
    assert.deepEqual(readSheetRows(buildWorkbook([{ nama: "Uji", baris }])), baris);
  });

  test("spasi di ujung ditulis apa adanya ke berkasnya", () => {
    // `xml:space="preserve"` yang menjaganya, dan itu untuk mata orang yang
    // membuka di Excel — kode ODP kita punya pasangan yang hanya berbeda
    // spasi (`SRY 020105S1` dan `SRY020105S1`), jadi spasi yang diam-diam
    // hilang saat ditulis akan menyamarkan dua ODP berbeda jadi satu.
    //
    // Pembaca IMPOR kita memangkasnya kembali, dan itu memang benar untuk
    // impor. Karena itu yang diperiksa di sini berkasnya, bukan bolak-baliknya.
    const teks = buildWorkbook([{ nama: "Uji", baris: [["SRY 020105S1 "]] }]).toString("utf8");
    assert.ok(teks.includes('xml:space="preserve"'));
    assert.ok(teks.includes("SRY 020105S1 <"));
  });

  test("bolak-balik lewat pembaca impor memangkas spasi ujung — memang begitu", () => {
    const hasil = readSheetRows(buildWorkbook([{ nama: "Uji", baris: [["SRY 020105S1 "]] }]));
    assert.deepEqual(hasil, [["SRY 020105S1"]]);
  });
});

describe("safeSheetName", () => {
  test("karakter terlarang Excel dibuang", () => {
    // Satu nama tab yang salah membuat Excel menolak SELURUH berkas, bukan
    // hanya lembar itu.
    assert.equal(safeSheetName("Sesi PPPoE [ambigu]", 0), "Sesi PPPoE  ambigu");
    assert.equal(safeSheetName("a/b\\c?d*e", 0), "a b c d e");
  });

  test("dipotong pada 31 karakter", () => {
    assert.equal(safeSheetName("x".repeat(50), 0).length, 31);
  });

  test("nama kosong tetap menghasilkan nama", () => {
    assert.equal(safeSheetName("   ", 2), "Lembar3");
    assert.equal(safeSheetName("///", 0), "Lembar1");
  });
});
