/**
 * Mengisi riwayat pergerakan stok dari lembar Inventory.
 *
 *   npx tsx scripts/_impor-gerak-stok.ts items.xlsx            # periksa saja
 *   npx tsx scripts/_impor-gerak-stok.ts items.xlsx --terapkan
 *
 * Lembar dipilih dari JUDUL KOLOMNYA, bukan urutannya.
 */
import { readFileSync } from "node:fs";
import { readAllSheetRows } from "@/lib/xlsx-read";
import { periksaGerak, terapkanGerak } from "@/lib/stock-movement-service";
import { db } from "@/lib/db";

const berkas = process.argv[2];
const terapkan = process.argv.includes("--terapkan");

async function main() {
  if (!berkas) throw new Error("Pakai: _impor-gerak-stok.ts <items.xlsx> [--terapkan]");
  const user = await db.user.findFirstOrThrow({ select: { id: true } });

  const lembar = readAllSheetRows(readFileSync(berkas));
  const gerak = lembar.find((l) => {
    const j = (l[0] ?? []).map((c) => c.toLowerCase().trim());
    return j.includes("item id") && j.includes("amount") && j.includes("datetime");
  });
  if (!gerak) throw new Error("Tidak ada lembar berkolom Item ID + Amount + DateTime.");

  const r = terapkan ? await terapkanGerak(gerak, user.id) : await periksaGerak(gerak);
  console.log(terapkan ? "═══ DITERAPKAN ═══" : "═══ PERIKSA (tidak menulis apa pun) ═══");
  console.log(`  baris di lembar     : ${r.totalBaris}`);
  console.log(`  pergerakan terbaca  : ${r.terbaca}  (${r.masuk} masuk · ${r.keluar} keluar)`);
  console.log(`  unit bersih         : ${r.unitBersih}`);
  console.log(`  barang berssaldo    : ${r.saldo.length}`);
  console.log(`  kode tidak dikenal  : ${r.itemTidakDikenal.length}`);
  if (r.itemTidakDikenal.length) console.log(`     ${r.itemTidakDikenal.slice(0, 12).join(", ")}${r.itemTidakDikenal.length > 12 ? " …" : ""}`);
  console.log(`  gudang ${terapkan ? "dibuat" : "akan dibuat"}      : ${r.gudangBaru.length}  ${r.gudangBaru.join(", ")}`);
  console.log(`  masalah baris       : ${r.masalah.length}`);
  for (const m of r.masalah.slice(0, 8)) console.log(`     baris ${m.baris}: ${m.pesan}`);
  console.log(`  saldo sempat negatif: ${r.negatif.length}`);
  for (const n of r.negatif.slice(0, 6)) {
    console.log(`     ${n.itemCode} pada ${n.at.toISOString().slice(0, 10)} → ${n.saldo}`);
  }
  if ("dokumenDibuat" in r) {
    const t = r as import("@/lib/stock-movement-service").HasilTerap;
    console.log(`\n  dokumen dibuat      : ${t.dokumenDibuat}`);
    console.log(`  baris dibuat        : ${t.barisDibuat}`);
    console.log(`  dilewati (sudah ada): ${t.dilewatiSudahAda}`);
  }
}
main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); }).finally(() => db.$disconnect());
