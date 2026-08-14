/**
 * Sekali pakai — menjalankan parseCustomerSheet terhadap ekspor asli.
 *   npx tsx scripts/_cek-pelanggan.ts <billing.json>
 */
import { readFileSync } from "node:fs";
import { parseCustomerSheet } from "@/lib/customer-import";

const d = JSON.parse(readFileSync(process.argv[2], "utf8")) as { h: string[]; rows: string[][] };
const hasil = parseCustomerSheet([d.h, ...d.rows], 2026);

console.log("baris masuk :", d.rows.length);
console.log("lolos       :", hasil.rows.length);
console.log("dilewati    :", hasil.skipped);
console.log("masalah     :", hasil.issues.length);

const per = new Map<string, number>();
for (const i of hasil.issues) per.set(i.column, (per.get(i.column) ?? 0) + 1);
console.log("\n── masalah per kolom ──");
for (const [k, v] of [...per].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(24)} ${v}`);

console.log("\n── contoh masalah ──");
for (const i of hasil.issues.slice(0, 4)) console.log(`  baris ${i.rowNumber} [${i.column}] ${i.message}`);

const notes = new Map<string, number>();
for (const r of hasil.rows) for (const n of r.notes) notes.set(n, (notes.get(n) ?? 0) + 1);
console.log("\n── catatan (tidak menghalangi) ──");
for (const [k, v] of [...notes].sort((a, b) => b[1] - a[1])) console.log(`  ${v}× ${k}`);

const bocor = hasil.rows.some((r) => JSON.stringify(r).toLowerCase().includes("password"));
console.log("\nkolom password bocor ke keluaran:", bocor ? "YA — BAHAYA" : "tidak");
console.log("punya koordinat :", hasil.rows.filter((r) => r.latitude !== null).length);
console.log("punya NIK       :", hasil.rows.filter((r) => r.identityNumber).length);
console.log("punya ODP       :", hasil.rows.filter((r) => r.odpRef).length);
console.log("ODP unik        :", new Set(hasil.rows.map((r) => r.odpRef).filter(Boolean)).size);
console.log("paket unik      :", [...new Set(hasil.rows.map((r) => r.packageRef))].join(", "));
