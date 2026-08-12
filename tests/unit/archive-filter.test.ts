import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { endOfDay, archivedAtRange } from "@/lib/archive";

// Filter rentang tanggal arsip. Yang diuji di sini satu hal yang mudah salah
// dan sulit dilihat: batas atas HARUS inklusif sampai akhir hari.

describe("endOfDay", () => {
  test("menggeser ke 23:59:59.999 tanpa mengubah tanggalnya", () => {
    const d = endOfDay(new Date("2026-08-12T08:30:00"));
    assert.equal(d.getDate(), 12);
    assert.equal(d.getHours(), 23);
    assert.equal(d.getMinutes(), 59);
    assert.equal(d.getSeconds(), 59);
    assert.equal(d.getMilliseconds(), 999);
  });

  test("tidak mengubah objek aslinya", () => {
    const asli = new Date("2026-08-12T08:30:00");
    endOfDay(asli);
    assert.equal(asli.getHours(), 8);
  });
});

describe("archivedAtRange", () => {
  test("tanpa batas apa pun → undefined, query tidak menyaring tanggal", () => {
    assert.equal(archivedAtRange(), undefined);
    assert.equal(archivedAtRange(null, null), undefined);
  });

  test("hanya batas bawah", () => {
    const r = archivedAtRange(new Date("2026-08-01"), null);
    assert.ok(r?.gte);
    assert.equal(r?.lte, undefined);
  });

  test("BATAS ATAS INKLUSIF sampai akhir hari", () => {
    // Tanpa ini, memilih "sampai 12 Agustus" akan membuang seluruh baris
    // tanggal 12 itu sendiri — orang mengira arsipnya kosong padahal ada.
    const r = archivedAtRange(null, new Date("2026-08-12T00:00:00"));
    assert.equal(r!.lte!.getDate(), 12);
    assert.equal(r!.lte!.getHours(), 23);
  });

  test("baris pada hari batas atas ikut tersaring masuk", () => {
    const r = archivedAtRange(null, new Date("2026-08-12T00:00:00"));
    const barisSoreItu = new Date("2026-08-12T17:45:00");
    assert.equal(barisSoreItu <= r!.lte!, true);
  });

  test("kedua batas terpasang", () => {
    const r = archivedAtRange(new Date("2026-08-01"), new Date("2026-08-12"));
    assert.ok(r?.gte);
    assert.ok(r?.lte);
    assert.equal(r!.gte! < r!.lte!, true);
  });

  test("tanggal tidak valid diabaikan, bukan membuat query rusak", () => {
    // <input type="date"> yang kosong menghasilkan new Date("") = Invalid.
    assert.equal(archivedAtRange(new Date("bukan-tanggal"), null), undefined);
    const r = archivedAtRange(new Date("2026-08-01"), new Date("bukan-tanggal"));
    assert.ok(r?.gte);
    assert.equal(r?.lte, undefined);
  });
});
