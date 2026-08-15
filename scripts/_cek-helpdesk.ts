import { readSheetRows } from "@/lib/xlsx-read";
import { readFileSync } from "node:fs";
import { buildPlan } from "@/lib/customer-import-service";
import { db } from "@/lib/db";

async function main() {
  const all: string[][] = [];
  let header: string[] = [];
  for (const n of ["(1)", "(2)", "(3)", "(4)"]) {
    const r = readSheetRows(readFileSync(`/Users/air_buddy/Downloads/_PERUMNET Helpdesk System  Customer List ${n}.xlsx`));
    const hi = r.findIndex((x) => x.some((c) => (c || "").trim() === "Customer Id"));
    if (!header.length) header = r[hi].map((c) => (c || "").trim());
    for (const row of r.slice(hi + 1)) if (row.some((c) => (c || "").trim())) all.push(row);
  }
  const h = await buildPlan([header, ...all]);
  if (!h.ok) { console.error("gagal:", h.error); process.exit(1); }
  const p = h.data.plan;
  console.log("boleh diterapkan :", p.ok);
  console.log("pelanggan baru   :", p.willCreateCustomers);
  console.log("dilengkapi       :", p.willCompleteCustomers, "| dilewati:", p.willSkipCustomers);
  console.log("langganan baru   :", p.willCreateSubscriptions);
  console.log("PAKET baru       :", p.newPackages.length);
  console.log("ODP baru         :", p.willCreateOdps);
  console.log("masalah          :", p.issues.length);
  console.log("paket tak terurus:", p.unknownPackages.join(", ") || "tidak ada");
  console.log("\n── paket yang akan dibuat (10 terbesar) ──");
  for (const np of [...p.newPackages].sort((a, b) => b.customers - a.customers).slice(0, 10)) {
    console.log(`  ${String(np.customers).padStart(4)}  ${np.code.padEnd(24)} Rp${np.price.toLocaleString("id-ID")}`);
  }
  console.log("\n── contoh masalah ──");
  for (const i of p.issues.slice(0, 5)) console.log(`  baris ${i.rowNumber} [${i.column}] ${i.message}`);
  await db.$disconnect();
}
main();
