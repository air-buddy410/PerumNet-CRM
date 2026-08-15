/**
 * Uji kering — menyusun rencana impor pelanggan dari ekspor asli, tanpa
 * menulis satu baris pun ke basis data.
 *   npx tsx scripts/_cek-rencana-pelanggan.ts <billing.json>
 */
import { readFileSync } from "node:fs";
import { buildPlan, KAPASITAS_ODP_DUGAAN } from "@/lib/customer-import-service";
import { db } from "@/lib/db";

async function main() {
const d = JSON.parse(readFileSync(process.argv[2], "utf8")) as { h: string[]; rows: string[][] };
const hasil = await buildPlan([d.h, ...d.rows]);
if (!hasil.ok) {
  console.error("gagal:", hasil.error);
  process.exit(1);
}
const p = hasil.data.plan;
console.log("boleh diterapkan :", p.ok);
console.log("pelanggan baru   :", p.willCreateCustomers);
console.log("dilengkapi       :", p.willCompleteCustomers);
console.log("dilewati         :", p.willSkipCustomers);
console.log("langganan baru   :", p.willCreateSubscriptions);
console.log("ODP dibuat       :", p.willCreateOdps, `(kapasitas dugaan ${KAPASITAS_ODP_DUGAAN})`);
console.log("masalah          :", p.issues.length);
console.log("paket tak dikenal:", p.unknownPackages.length ? p.unknownPackages.join(", ") : "tidak ada");
console.log("sales tak dikenal:", p.unknownSales.length ? p.unknownSales.join(", ") : "tidak ada");
console.log("\n── masalah ──");
for (const i of p.issues.slice(0, 8)) console.log(`  baris ${i.rowNumber} [${i.column}] ${i.message}`);
console.log("\n── ODP terpadat ──");
for (const o of [...p.odps].sort((a, b) => b.customers - a.customers).slice(0, 5)) {
  console.log(`  ${o.code.padEnd(14)} ${o.customers} pelanggan  → ${o.action}`);
}
await db.$disconnect();
}
main();
