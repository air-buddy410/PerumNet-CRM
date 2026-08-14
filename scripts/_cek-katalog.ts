/**
 * Sekali pakai — menjalankan parseCatalogWorkbook terhadap data asli dari
 * sheet gudang, supaya aturannya diuji terhadap kekacauan yang sebenarnya
 * dan bukan hanya terhadap contoh yang dibuat rapi di tes unit.
 *
 *   npx tsx scripts/_cek-katalog.ts <sheets.json>
 */
import { readFileSync } from "node:fs";
import { parseCatalogWorkbook } from "@/lib/item-import";

const path = process.argv[2];
if (!path) {
  console.error("Pakai: npx tsx scripts/_cek-katalog.ts <sheets.json>");
  process.exit(1);
}

const sheets = JSON.parse(readFileSync(path, "utf8")) as string[][][];
const hasil = parseCatalogWorkbook(sheets);

console.log("lembar diabaikan :", hasil.ignoredSheets);
console.log("baris pergerakan dilewati:", hasil.skippedMovements);
console.log("kategori         :", hasil.categories.length);
console.log("vendor           :", hasil.suppliers.length);
console.log("material         :", hasil.items.length);
console.log("saldo stok       :", hasil.stock.length);
console.log("masalah          :", hasil.issues.length);

console.log("\n── MASALAH ──");
for (const i of hasil.issues) console.log(`  baris ${i.rowNumber} [${i.column}] ${i.message}`);

const berCatatan = hasil.items.filter((i) => i.notes.length);
console.log(`\n── CATATAN (${berCatatan.length} material, tidak menghalangi) ──`);
for (const i of berCatatan) console.log(`  ${i.code} ${i.name}: ${i.notes.join(" | ")}`);

console.log("\n── CONTOH HASIL ──");
for (const i of hasil.items.slice(0, 5)) {
  console.log(
    `  ${i.code} | ${i.name} | ${i.categoryName} | ${i.supplierName ?? "-"} | ` +
      `beli=${i.purchaseCost ?? "-"} jual=${i.salePrice ?? "-"} | ${i.condition}`
  );
}

const total = hasil.items.reduce((s, i) => s + (i.purchaseCost ?? 0), 0);
console.log(`\nkondisi GOOD=${hasil.items.filter((i) => i.condition === "GOOD").length} ` +
  `SECOND=${hasil.items.filter((i) => i.condition === "SECOND").length}`);
console.log("jumlah harga beli seluruh katalog: Rp" + total.toLocaleString("id-ID"));
console.log("total unit stok awal:", hasil.stock.reduce((s, r) => s + r.quantity, 0));
