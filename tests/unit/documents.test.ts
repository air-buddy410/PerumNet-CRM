import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { periodKeyFor, highestSuffix } from "@/lib/documents";

describe("periodKeyFor", () => {
  const at = new Date(2026, 7, 9); // 9 Agustus 2026

  test("bulanan → YYYYMM", () => {
    assert.equal(periodKeyFor("MONTHLY", at), "202608");
  });

  test("harian → YYYYMMDD dengan nol di depan", () => {
    assert.equal(periodKeyFor("DAILY", at), "20260809");
  });

  test("bulan Januari tetap dua digit", () => {
    assert.equal(periodKeyFor("MONTHLY", new Date(2026, 0, 5)), "202601");
  });
});

describe("highestSuffix", () => {
  test("mengambil urutan tertinggi, bukan yang terakhir", () => {
    assert.equal(
      highestSuffix(["INV-202608-0003", "INV-202608-0042", "INV-202608-0007"]),
      42
    );
  });

  test("daftar kosong menghasilkan nol", () => {
    assert.equal(highestSuffix([]), 0);
  });

  test("mengabaikan nomor yang ekornya bukan angka", () => {
    assert.equal(highestSuffix(["INV-202608-ABCD", "INV-202608-0005"]), 5);
  });

  test("membaca nomor bergaya {WO}-ISS-{NN}", () => {
    assert.equal(highestSuffix(["WO-1-ISS-03", "WO-1-ISS-11"]), 11);
  });
});
