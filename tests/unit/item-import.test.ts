import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseCatalogWorkbook,
  normalizeItemCode,
  parseRupiah,
  conditionFromLabel,
  ITEM_CODE_RE,
} from "@/lib/item-import";

const KATEGORI = [
  ["ID", "Category", "Icon"],
  ["w6hwsyj", "CABLE", ""],
  ["5b39f169", "Modem", ""],
];

const VENDOR = [
  ["ID", "Name", "Logo", "URL", "Phone", "Email", "Address"],
  ["arwegliujl", "SSP", "", "toolmfg.com", "6282131384765", "info@toolmfg.com", "Madiun"],
  ["caabcab7", "Hilda", "", "", "", "", ""],
];

const JUDUL_ITEM = [
  "Item ID",
  "Name",
  "Description",
  "Warehouse",
  "Image",
  "Category",
  "Vendor",
  "Purchase Cost",
  "Sale Price",
];

function item(...sel: string[]): string[] {
  return sel;
}

/** Workbook minimum yang sah — dipakai sebagai dasar tiap kasus. */
function workbook(itemRows: string[][], extra: string[][][] = []): string[][][] {
  return [KATEGORI, VENDOR, [JUDUL_ITEM, ...itemRows], ...extra];
}

const BARIS_SAH = item(
  "CAB-0001",
  "Cable Drop 1 Core",
  "Available",
  "Kecicang",
  "",
  "w6hwsyj",
  "arwegliujl",
  "Rp 670,000",
  "Rp 750,000"
);

describe("normalizeItemCode", () => {
  test("menyeragamkan huruf kecil dan spasi", () => {
    assert.equal(normalizeItemCode("Cab-0010"), "CAB-0010");
    assert.equal(normalizeItemCode("MOD 0014"), "MOD-0014");
    assert.equal(normalizeItemCode("  net_0011 "), "NET-0011");
    assert.equal(normalizeItemCode("SPL--0001"), "SPL-0001");
  });

  test("TIDAK menebak digit yang kurang maupun prefiks yang salah ketik", () => {
    // Keduanya menyerupai kode sah lain. Menambal nol atau membetulkan MOOD
    // menjadi MOD akan menggabungkan dua barang berbeda jadi satu baris stok.
    assert.equal(normalizeItemCode("ACC-005"), "ACC-005");
    assert.ok(!ITEM_CODE_RE.test(normalizeItemCode("ACC-005")));
    assert.equal(normalizeItemCode("MOOD-0011"), "MOOD-0011");
    assert.ok(!ITEM_CODE_RE.test(normalizeItemCode("SPL-000001")));
  });
});

describe("parseRupiah", () => {
  test("koma adalah pemisah ribuan, bukan desimal", () => {
    assert.equal(parseRupiah("Rp 250,000"), 250000);
    assert.equal(parseRupiah("Rp 1,300,000"), 1300000);
    assert.equal(parseRupiah("Rp 3,600"), 3600);
  });

  test("kosong menghasilkan null, bukan nol", () => {
    // Nol berarti "gratis"; null berarti "tidak tercatat". Menyamakan keduanya
    // membuat nilai persediaan tampak benar padahal datanya belum ada.
    assert.equal(parseRupiah(""), null);
    assert.equal(parseRupiah("   "), null);
  });

  test("teks yang bukan angka ditolak", () => {
    assert.equal(parseRupiah("nego"), null);
    assert.equal(parseRupiah("Rp -500"), null);
    assert.equal(parseRupiah("12ab"), null);
  });
});

describe("conditionFromLabel", () => {
  test("kosakata sumber dipetakan ke kosakata gudang", () => {
    assert.equal(conditionFromLabel("Available"), "GOOD");
    assert.equal(conditionFromLabel("Second"), "SECOND");
    assert.equal(conditionFromLabel("bekas"), "SECOND");
  });

  test("isian di luar daftar ditolak, tidak dianggap nilai baku", () => {
    assert.equal(conditionFromLabel("Kabel"), null);
    assert.equal(conditionFromLabel("Stiker"), null);
    assert.equal(conditionFromLabel(""), null);
  });
});

describe("parseCatalogWorkbook", () => {
  test("membaca katalog lengkap dan menerjemahkan hash kategori/vendor", () => {
    const h = parseCatalogWorkbook(workbook([BARIS_SAH]));
    assert.equal(h.issues.length, 0);
    assert.equal(h.items.length, 1);
    const it = h.items[0];
    assert.equal(it.code, "CAB-0001");
    assert.equal(it.categoryName, "CABLE");
    assert.equal(it.supplierName, "SSP");
    assert.equal(it.purchaseCost, 670000);
    assert.equal(it.condition, "GOOD");
    assert.equal(h.categories.length, 2);
    assert.equal(h.suppliers.length, 2);
  });

  test("urutan tab tidak menentukan apa pun", () => {
    const terbalik = parseCatalogWorkbook([[JUDUL_ITEM, BARIS_SAH], VENDOR, KATEGORI]);
    assert.equal(terbalik.issues.length, 0);
    assert.equal(terbalik.items[0].categoryName, "CABLE");
    assert.equal(terbalik.items[0].supplierName, "SSP");
  });

  test("hash kategori tanpa padanan MENGGAGALKAN baris, bukan jadi catatan", () => {
    const rows = [item("CAB-0002", "Kabel", "Available", "", "", "tidakada", "arwegliujl", "", "")];
    const h = parseCatalogWorkbook(workbook(rows));
    assert.equal(h.items.length, 0);
    assert.equal(h.issues.length, 1);
    assert.equal(h.issues[0].column, "Category");
    assert.match(h.issues[0].message, /tidakada/);
  });

  test("hash vendor tanpa padanan menggagalkan baris", () => {
    const rows = [item("CAB-0002", "Kabel", "Available", "", "", "w6hwsyj", "hantu", "", "")];
    const h = parseCatalogWorkbook(workbook(rows));
    assert.equal(h.items.length, 0);
    assert.equal(h.issues[0].column, "Vendor");
  });

  test("vendor kosong boleh — dicatat, tidak ditolak", () => {
    const rows = [item("CAB-0002", "Kabel", "Available", "", "", "w6hwsyj", "", "", "")];
    const h = parseCatalogWorkbook(workbook(rows));
    assert.equal(h.issues.length, 0);
    assert.equal(h.items[0].supplierCode, null);
    assert.deepEqual(h.items[0].notes, ["Tanpa vendor."]);
  });

  test("kode ganda ditolak pada kemunculan kedua, bukan menimpa yang pertama", () => {
    const rows = [
      item("CAB-0001", "Pertama", "Available", "", "", "w6hwsyj", "", "", ""),
      item("cab-0001", "Kedua", "Available", "", "", "w6hwsyj", "", "", ""),
    ];
    const h = parseCatalogWorkbook(workbook(rows));
    assert.equal(h.items.length, 1);
    assert.equal(h.items[0].name, "Pertama");
    assert.equal(h.issues.length, 1);
    assert.match(h.issues[0].message, /sudah dipakai di baris 2/);
  });

  test("harga curiga rendah hanya jadi catatan — barang murah itu nyata", () => {
    const rows = [item("SPL-0001", "Splitter", "Available", "", "", "w6hwsyj", "", "Rp 102", "Rp 133")];
    const h = parseCatalogWorkbook(workbook(rows));
    assert.equal(h.issues.length, 0);
    assert.equal(h.items.length, 1);
    assert.match(h.items[0].notes.join(" "), /kurang angka nol/);
  });

  test("harga jual di bawah harga beli dicatat", () => {
    const rows = [item("CAB-0003", "Kabel", "Available", "", "", "w6hwsyj", "", "Rp 900,000", "Rp 500,000")];
    const h = parseCatalogWorkbook(workbook(rows));
    assert.equal(h.issues.length, 0);
    assert.match(h.items[0].notes.join(" "), /di bawah harga beli/);
  });

  test("harga yang tidak terbaca MENGGAGALKAN baris", () => {
    const rows = [item("CAB-0004", "Kabel", "Available", "", "", "w6hwsyj", "", "nego", "")];
    const h = parseCatalogWorkbook(workbook(rows));
    assert.equal(h.items.length, 0);
    assert.equal(h.issues[0].column, "Purchase Cost");
  });

  test("baris kosong dilewati diam-diam", () => {
    const h = parseCatalogWorkbook(workbook([BARIS_SAH, ["", "", "", "", "", "", "", "", ""], []]));
    assert.equal(h.issues.length, 0);
    assert.equal(h.items.length, 1);
  });

  test("lembar pergerakan stok dikenali lalu SENGAJA dilewati", () => {
    // Lognya tidak lengkap dan tidak rekonsiliasi dengan saldo. Yang penting
    // di sini: ia tidak boleh terbaca sebagai saldo hanya karena sama-sama
    // punya kolom Item ID dan Amount.
    const gerak = [
      ["Inventory ID", "Item ID", "DateTime", "Amount", "Description"],
      ["a1", "CAB-0001", "4/3/2025 21:49", "19", "Stok Awal"],
      ["a2", "CAB-0001", "5/3/2025 08:00", "-3", "Stok Keluar"],
    ];
    const h = parseCatalogWorkbook(workbook([BARIS_SAH], [gerak]));
    assert.equal(h.skippedMovements, 2);
    assert.equal(h.stock.length, 0);
    assert.equal(h.issues.length, 0);
  });

  test("saldo dibaca dari blok Kode Material/Stok, bukan Item ID/Amount", () => {
    const saldo = [
      ["Item ID", "Amount", "", "Kode Material", "", "Stok"],
      ["CAB-0001", "19", "", "CAB-0001", "Kabel 1 Core", "396"],
      ["CAB-0001", "-13", "", "", "", ""],
    ];
    const h = parseCatalogWorkbook(workbook([BARIS_SAH], [saldo]));
    assert.equal(h.stock.length, 1);
    assert.equal(h.stock[0].itemCode, "CAB-0001");
    assert.equal(h.stock[0].quantity, 396);
  });

  test("saldo untuk barang yang tidak ada di katalog dilaporkan", () => {
    const saldo = [
      ["Kode Material", "Nama", "Stok"],
      ["ZZZ-9999", "Entah", "5"],
    ];
    const h = parseCatalogWorkbook(workbook([BARIS_SAH], [saldo]));
    assert.equal(h.stock.length, 0);
    assert.equal(h.issues.length, 1);
    assert.match(h.issues[0].message, /tidak ada di lembar Items/);
  });

  test("lembar tanpa judul yang dikenali dilewati dan dihitung", () => {
    const acak = [["Catatan rapat"], ["besok jam 9"]];
    const h = parseCatalogWorkbook(workbook([BARIS_SAH], [acak]));
    assert.equal(h.ignoredSheets, 1);
    assert.equal(h.items.length, 1);
  });

  test("workbook tanpa lembar katalog sama sekali menghasilkan masalah, bukan hasil kosong yang senyap", () => {
    const h = parseCatalogWorkbook([[["a", "b"], ["1", "2"]]]);
    assert.equal(h.items.length, 0);
    assert.equal(h.issues.length, 1);
    assert.match(h.issues[0].message, /Tidak ada lembar katalog/);
  });

  test("baris judul boleh didahului baris kosong", () => {
    const h = parseCatalogWorkbook([KATEGORI, VENDOR, [[], ["", ""], JUDUL_ITEM, BARIS_SAH]]);
    assert.equal(h.issues.length, 0);
    assert.equal(h.items.length, 1);
  });
});

describe("pemulihan kode saldo yang rusak", () => {
  const ITEM = (code: string, name: string) =>
    item(code, name, "Available", "", "", "w6hwsyj", "", "Rp 10,000", "Rp 13,000");

  test("dipulihkan bila nomor DAN nama sama-sama menguatkan", () => {
    const saldo = [
      ["Kode Material", "Nama", "Stok"],
      ["ACC-005", "Compact Closure", "31"],
    ];
    const h = parseCatalogWorkbook(workbook([ITEM("ACC-0005", "Compact Closure Outdoor")], [saldo]));
    assert.equal(h.issues.length, 0);
    assert.equal(h.stock.length, 1);
    assert.equal(h.stock[0].itemCode, "ACC-0005");
    assert.equal(h.stock[0].resolvedFrom, "ACC-005");
  });

  test("DITOLAK bila nomornya cocok tetapi namanya barang lain", () => {
    // Kasus nyata: PAT-000009 bernama "Pigtail Tipe ST", sedangkan PAT-0009
    // di katalog adalah "Patch Core LC UPC". Nomor berdekatan, barang beda.
    const saldo = [
      ["Kode Material", "Nama", "Stok"],
      ["PAT-000009", "Pigtail Tipe ST", "12"],
    ];
    const h = parseCatalogWorkbook(workbook([ITEM("PAT-0009", "Patch Core LC UPC")], [saldo]));
    assert.equal(h.stock.length, 0);
    assert.equal(h.issues.length, 1);
    assert.match(h.issues[0].message, /Mirip PAT-0009/);
    assert.match(h.issues[0].message, /tidak cocok/);
  });

  test("DITOLAK bila kode tujuannya sudah punya baris saldo sendiri", () => {
    // Kasus nyata: SER 010 = "Baju Engginer", SER-0010 = "Sepatu Kerja" pada
    // lembar yang sama. Dua sinyal setuju dan hasilnya tetap salah.
    const saldo = [
      ["Kode Material", "Nama", "Stok"],
      ["SER 010", "Baju Engginer", "3"],
      ["SER-0010", "Sepatu Kerja", "3"],
    ];
    const h = parseCatalogWorkbook(workbook([ITEM("SER-0010", "Baju Engginer nagata XL")], [saldo]));
    assert.equal(h.stock.length, 1);
    assert.equal(h.stock[0].resolvedFrom, undefined);
    assert.match(h.issues[0].message, /memperebutkan satu kode/);
  });

  test("kondisi tak dikenal jadi GOOD dengan catatan, bukan penolakan", () => {
    const rows = [item("NET-0019", "Belden LAN", "Kabel", "", "", "w6hwsyj", "", "", "")];
    const h = parseCatalogWorkbook(workbook(rows));
    assert.equal(h.issues.length, 0);
    assert.equal(h.items[0].condition, "GOOD");
    assert.match(h.items[0].notes.join(" "), /tidak dikenal, dianggap GOOD/);
  });
});
