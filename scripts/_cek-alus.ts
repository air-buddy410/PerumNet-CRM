/** Uji kering rencana impor dari salinan ALUS — tanpa menulis apa pun. */
import { readFileSync } from "node:fs";
import { buildOdpPlan } from "@/lib/odp-import-service";
import { buildPlan as buildCustPlan } from "@/lib/customer-import-service";
import { db } from "@/lib/db";

async function main() {
  const dir = process.argv[2];
  const odp = JSON.parse(readFileSync(`${dir}/odp.json`, "utf8")) as string[][];
  const cust = JSON.parse(readFileSync(`${dir}/pelanggan.json`, "utf8")) as string[][];

  const o = await buildOdpPlan([odp]);
  if (!o.ok) { console.error("ODP gagal:", o.error); process.exit(1); }
  const op = o.data.plan;
  console.log("═══ ODP ═══");
  console.log("  dibuat     :", op.willCreate, `(${op.willCreateMs} Master Splitter)`);
  console.log("  dilengkapi :", op.willComplete, "| dilewati:", op.willSkip);
  console.log("  port dibuat:", op.willCreatePorts);
  console.log("  kaitan induk:", op.willLinkParents);
  console.log("  masalah    :", op.issues.length);
  for (const i of op.issues.slice(0, 3)) console.log(`     baris ${i.rowNumber} [${i.column}] ${i.message}`);

  const c = await buildCustPlan(cust);
  if (!c.ok) { console.error("Pelanggan gagal:", c.error); process.exit(1); }
  const cp = c.data.plan;
  console.log("\n═══ PELANGGAN ═══");
  console.log("  dibuat     :", cp.willCreateCustomers);
  console.log("  dilengkapi :", cp.willCompleteCustomers, "| dilewati:", cp.willSkipCustomers);
  console.log("  langganan  :", cp.willCreateSubscriptions);
  console.log("  paket baru :", cp.newPackages.length);
  console.log("  ODP baru   :", cp.willCreateOdps);
  console.log("  masalah    :", cp.issues.length);
  for (const i of cp.issues.slice(0, 3)) console.log(`     baris ${i.rowNumber} [${i.column}] ${i.message}`);
  console.log("  paket tak terurus:", cp.unknownPackages.join(", ") || "tidak ada");
  await db.$disconnect();
}
main();
