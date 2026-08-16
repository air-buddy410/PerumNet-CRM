import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseMovementRows,
  excelDate,
  bacaJumlah,
  urutTerap,
  saldoAkhir,
  saldoNegatif,
} from "@/lib/stock-movement-import";

// Judul kolom disalin PERSIS dari lembar Inventory milik PerumNet.
const J = [
  "Inventory ID", "Item ID", "DateTime", "Amount", "Description",
  "Alokasi", "PIC", "SN", "Warehouse", "Signature Admin", "Admin Name", "Signature PIC",
];
const b = (id: string, kode: string, serial: string, qty: string, ket = "", pic = "", gd = "Kecicang") =>
  [id, kode, serial, qty, ket, "", pic, "", gd, "", "", ""];

describe("excelDate", () => {
  test("bilangan seri menjadi tanggal — titik nol 30 Desember 1899", () => {
    // Excel mewarisi anggapan 1900 tahun kabisat; seluruh dunia menyesuaikan
    // diri dengan galat itu, jadi titik nolnya bukan 1 Januari 1900.
    assert.equal(excelDate(45750.90967592593)!.toISOString().slice(0, 10), "2025-04-03");
  });

  test("nilai mustahil menghasilkan null, bukan tanggal karangan", () => {
    assert.equal(excelDate(0), null);
    assert.equal(excelDate(-5), null);
    assert.equal(excelDate(NaN), null);
    assert.equal(excelDate(5), null); // 1900 — kolomnya pasti salah baca
  });
});

describe("bacaJumlah", () => {
  test("tanda dipertahankan — di situlah arahnya", () => {
    assert.equal(bacaJumlah("19"), 19);
    assert.equal(bacaJumlah("-3"), -3);
    assert.equal(bacaJumlah("19.0"), 19);
  });

  test("pecahan ditolak — stok dihitung per unit utuh", () => {
    assert.equal(bacaJumlah("1.5"), null);
    assert.equal(bacaJumlah("abc"), null);
    assert.equal(bacaJumlah(""), null);
  });
});

describe("parseMovementRows", () => {
  test("baris terbaca lengkap dengan gudang dan PIC", () => {
    const h = parseMovementRows([J, b("3228b327", "MOD-0007", "45750.90967592593", "19", "Awal Stok", "Rizal")]);
    assert.equal(h.masalah.length, 0);
    assert.equal(h.gerak.length, 1);
    assert.equal(h.gerak[0].itemCode, "MOD-0007");
    assert.equal(h.gerak[0].qty, 19);
    assert.equal(h.gerak[0].pic, "Rizal");
    assert.equal(h.gerak[0].warehouseName, "Kecicang");
  });

  test("ARAH dibaca dari tanda, bukan dari ejaan keterangan", () => {
    // Kolom keterangan memuat dua belas ejaan untuk tiga konsep, dan dua baris
    // malah berisi nama pekerjaan. Membacanya berarti menebak ejaan orang.
    const h = parseMovementRows([
      J,
      b("a", "CAB-0001", "45750.5", "-3", "Stok Kaluar"),
      b("b", "CAB-0001", "45751.5", "5", "Instalasi Tiying Tali"),
      b("c", "CAB-0001", "45752.5", "-2", "New Stock"),
    ]);
    assert.deepEqual(h.gerak.map((g) => g.qty), [-3, 5, -2]);
  });

  test("nol bukan pergerakan", () => {
    const h = parseMovementRows([J, b("a", "CAB-0001", "45750.5", "0")]);
    assert.equal(h.gerak.length, 0);
    assert.match(h.masalah[0].pesan, /nol unit/);
  });

  test("baris kosong dihitung terpisah, bukan dilaporkan sebagai masalah", () => {
    const h = parseMovementRows([J, ["", "", "", ""], b("a", "X-0001", "45750.5", "1")]);
    assert.equal(h.kosong, 1);
    assert.equal(h.masalah.length, 0);
    assert.equal(h.gerak.length, 1);
  });

  test("kolom yang dipindahkan tetap dikenali", () => {
    const judul = ["Amount", "DateTime", "Item ID", "Inventory ID", "Warehouse", "PIC", "Description"];
    const h = parseMovementRows([judul, ["7", "45750.5", "ACC-0003", "z1", "Abang", "Ojik", "Stok Masuk"]]);
    assert.equal(h.gerak[0].itemCode, "ACC-0003");
    assert.equal(h.gerak[0].qty, 7);
    assert.equal(h.gerak[0].warehouseName, "Abang");
  });

  test("kolom wajib yang hilang dilaporkan, bukan dibaca lewat posisi", () => {
    const h = parseMovementRows([["Tanggal", "Catatan"], ["45750.5", "apa"]]);
    assert.equal(h.gerak.length, 0);
    assert.match(h.masalah[0].pesan, /tidak ditemukan/);
  });
});

describe("urutTerap dan saldo", () => {
  test("pemasukan didahulukan dalam hari yang sama", () => {
    // Pengeluaran sering tertulis semenit sebelum penerimaan yang menutupinya.
    // Urutan dalam satu hari memang tidak pernah dicatat sungguh-sungguh.
    // Pengeluaran bercap waktu LEBIH AWAL daripada penerimaannya, hari yang
    // sama. Diurut menurut jam saja, saldonya sempat −5; itulah yang membuat
    // aturan ini ada, dan itu pula yang membuat tes ini gagal tanpa aturannya.
    const h = parseMovementRows([
      J,
      b("keluar", "X-0001", "45750.1", "-5"),
      b("masuk", "X-0001", "45750.9", "5"),
    ]);
    const urut = urutTerap(h.gerak);
    assert.deepEqual(urut.map((g) => g.refId), ["masuk", "keluar"]);
    assert.equal(saldoNegatif(urut).length, 0);
    // Tanpa aturannya, urutan menurut jam saja memang menegatifkan saldonya.
    assert.equal(saldoNegatif([...h.gerak].sort((a, c) => a.at.getTime() - c.at.getTime())).length, 1);
  });

  test("saldo yang tetap negatif DILAPORKAN, tidak dinaikkan diam-diam ke nol", () => {
    const h = parseMovementRows([
      J,
      b("keluar", "X-0001", "45750.5", "-5"),
      b("masuk", "X-0001", "45760.5", "5"),
    ]);
    const neg = saldoNegatif(urutTerap(h.gerak));
    assert.equal(neg.length, 1);
    assert.equal(neg[0].saldo, -5);
    // Saldo akhirnya tetap benar; yang cacat urutannya, bukan jumlahnya.
    assert.equal(saldoAkhir(h.gerak).get("X-0001"), 0);
  });

  test("saldo akhir menjumlahkan seluruh pergerakan per barang", () => {
    const h = parseMovementRows([
      J,
      b("a", "X-0001", "45750.5", "10"),
      b("b", "X-0001", "45751.5", "-3"),
      b("c", "Y-0002", "45752.5", "7"),
    ]);
    const s = saldoAkhir(h.gerak);
    assert.equal(s.get("X-0001"), 7);
    assert.equal(s.get("Y-0002"), 7);
  });
});
