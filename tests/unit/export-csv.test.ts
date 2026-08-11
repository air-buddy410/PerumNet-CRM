import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { csvCell, toCsv } from "@/lib/export-csv";

describe("csvCell — perlindungan formula injection", () => {
  test("menetralkan nilai yang diawali = + - @", () => {
    // Tanpa ini, Excel mengeksekusinya sebagai rumus saat berkas dibuka.
    for (const dangerous of ["=1+1", "+1", "-1", "@SUM(A1)"]) {
      assert.ok(
        csvCell(dangerous).startsWith("'") || csvCell(dangerous).startsWith(`"'`),
        `${dangerous} harus dinetralkan`
      );
    }
  });

  test("serangan klasik =cmd tidak lolos apa adanya", () => {
    const out = csvCell('=cmd|\' /C calc\'!A0');
    assert.ok(!out.startsWith("="), "sel tidak boleh diawali = mentah");
  });

  test("teks biasa tidak diubah", () => {
    assert.equal(csvCell("Budi Santoso"), "Budi Santoso");
    assert.equal(csvCell("ODP-01"), "ODP-01");
  });
});

describe("csvCell — quoting", () => {
  test("nilai bertanda koma dibungkus kutip", () => {
    assert.equal(csvCell("Jl. Merdeka, No. 5"), '"Jl. Merdeka, No. 5"');
  });

  test("kutip ganda di dalam nilai digandakan", () => {
    assert.equal(csvCell('Dia bilang "ya"'), '"Dia bilang ""ya"""');
  });

  test("baris baru dibungkus, tidak memecah baris CSV", () => {
    assert.ok(csvCell("baris1\nbaris2").startsWith('"'));
  });

  test("kosong dan null menjadi sel kosong", () => {
    assert.equal(csvCell(null), "");
    assert.equal(csvCell(undefined), "");
  });
});

describe("csvCell — tipe data", () => {
  test("BigInt tidak kehilangan presisi", () => {
    assert.equal(csvCell(9_007_199_254_740_993n), "9007199254740993");
  });

  test("Date ditulis sebagai waktu yang bisa dibaca", () => {
    assert.equal(csvCell(new Date("2026-08-11T03:04:05Z")), "2026-08-11 03:04:05");
  });

  test("angka nol tetap tertulis, bukan kosong", () => {
    assert.equal(csvCell(0), "0");
  });
});

describe("toCsv", () => {
  const rows = [
    { name: "Budi", qty: 3, note: null },
    { name: "Ani, S.T.", qty: 0, note: "=1+1" },
  ];
  const csv = toCsv(rows, [
    { header: "Nama", value: (r) => r.name },
    { header: "Jumlah", value: (r) => r.qty },
    { header: "Catatan", value: (r) => r.note },
  ]);

  test("baris pertama adalah header", () => {
    assert.equal(csv.split("\r\n")[0], "Nama,Jumlah,Catatan");
  });

  test("jumlah baris sesuai data", () => {
    assert.equal(csv.trim().split("\r\n").length, 3);
  });

  test("nilai berbahaya di dalam tabel ikut dinetralkan", () => {
    assert.ok(!csv.includes(",=1+1"), "rumus tidak boleh lolos ke sel");
  });

  test("daftar kosong tetap menghasilkan header", () => {
    const empty = toCsv([], [{ header: "Kode", value: () => "" }]);
    assert.equal(empty.trim(), "Kode");
  });
});
