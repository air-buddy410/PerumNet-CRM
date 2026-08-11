import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  inferPointType,
  isImportable,
  notImportableReason,
  IMPORTABLE_TYPES,
} from "@/lib/ftth-point-type";

// Tebakan jenis menentukan sebuah titik akan tersimpan sebagai apa. Salah
// tebak berarti POP tersimpan sebagai ODP dan ikut terhitung kapasitas port.
// Karena itu aturannya: kalau ragu, UNKNOWN — biar manusia yang memutuskan.

describe("inferPointType", () => {
  test("folder ODP dikenali", () => {
    for (const f of ["ODP", "odp", "ODP Kecicang", "DISPOINT", "Distribution Point"]) {
      assert.equal(inferPointType(f), "ODP", f);
    }
  });

  test("folder MS/ODC dikenali sebagai satu jenis yang sama", () => {
    for (const f of ["MS", "ODC", "Master Switch", "Rumah Kabel", "RK Abang"]) {
      assert.equal(inferPointType(f), "MS", f);
    }
  });

  test("folder POP dan turunannya dikenali", () => {
    for (const f of ["POP", "SPOP Abang", "BPOP Kecicang", "Site", "OLT"]) {
      assert.equal(inferPointType(f), "POP", f);
    }
  });

  test("folder pelanggan DIKENALI, supaya bisa dilewati dengan alasan jelas", () => {
    // Yang berbahaya bukan titik pelanggan yang dilewati, melainkan titik
    // pelanggan yang diam-diam tersimpan sebagai ODP.
    for (const f of ["HOME PASS", "Homepass", "Pelanggan", "Customer"]) {
      assert.equal(inferPointType(f), "CUSTOMER", f);
    }
  });

  test("tanpa folder → UNKNOWN, bukan ditebak", () => {
    assert.equal(inferPointType(null), "UNKNOWN");
    assert.equal(inferPointType(undefined), "UNKNOWN");
    assert.equal(inferPointType(""), "UNKNOWN");
    assert.equal(inferPointType("   "), "UNKNOWN");
  });

  test("folder tak dikenal → UNKNOWN", () => {
    for (const f of ["Layer 1", "Untitled", "Coba-coba", "Backup lama"]) {
      assert.equal(inferPointType(f), "UNKNOWN", f);
    }
  });

  test("dicocokkan per KATA, bukan substring", () => {
    // "GRUP" memuat huruf R-K tapi bukan "RK"; "TOPOGRAFI" memuat "POP".
    assert.equal(inferPointType("GRUP"), "UNKNOWN");
    assert.equal(inferPointType("TOPOGRAFI"), "UNKNOWN");
    assert.equal(inferPointType("SHOP"), "UNKNOWN");
  });

  test("pemisah dan spasi berlebih tidak mengubah hasil", () => {
    assert.equal(inferPointType("  odp_kecicang  "), "ODP");
    assert.equal(inferPointType("ODP-ABANG"), "ODP");
    assert.equal(inferPointType("ODP.Seraya"), "ODP");
  });

  test("pelanggan diperiksa lebih dulu daripada jenis lain", () => {
    // "HOME PASS ODP 3" adalah folder pelanggan, bukan folder ODP.
    assert.equal(inferPointType("HOME PASS ODP 3"), "CUSTOMER");
  });
});

describe("isImportable & notImportableReason", () => {
  test("hanya POP, MS, dan ODP yang bisa diimpor", () => {
    assert.deepEqual(IMPORTABLE_TYPES, ["POP", "MS", "ODP"]);
    for (const t of IMPORTABLE_TYPES) assert.equal(isImportable(t), true);
    assert.equal(isImportable("CUSTOMER"), false);
    assert.equal(isImportable("UNKNOWN"), false);
  });

  test("yang tidak bisa diimpor punya alasan yang bisa dibaca petugas", () => {
    assert.match(String(notImportableReason("CUSTOMER")), /manual/i);
    assert.match(String(notImportableReason("UNKNOWN")), /pilih jenisnya/i);
    assert.equal(notImportableReason("ODP"), null);
  });
});
