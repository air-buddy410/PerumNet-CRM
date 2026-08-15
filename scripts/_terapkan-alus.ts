/**
 * Menerapkan salinan ALUS: ODP dulu, pelanggan menyusul.
 *
 *   npx tsx scripts/_terapkan-alus.ts <folder> [--terapkan]
 *
 * Tanpa `--terapkan` hanya menampilkan rencana. Urutannya tidak boleh
 * dibalik: pelanggan menempati port, dan port baru ada setelah ODP-nya ada.
 */
import { readFileSync } from "node:fs";
import { applyOdpFromBlocks, buildOdpPlan } from "@/lib/odp-import-service";
import { applyCustomerFromRows, buildPlan as buildCustPlan } from "@/lib/customer-import-service";
import { db } from "@/lib/db";

const dir = process.argv[2];
const terapkan = process.argv.includes("--terapkan");

async function main() {
  if (!dir) { console.error("Pakai: npx tsx scripts/_terapkan-alus.ts <folder> [--terapkan]"); process.exit(1); }
  const odpRows = JSON.parse(readFileSync(`${dir}/odp.json`, "utf8")) as string[][];
  const custRows = JSON.parse(readFileSync(`${dir}/pelanggan.json`, "utf8")) as string[][];

  const user = {
    id: (await db.user.findFirstOrThrow({ where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } })).id,
    permissions: new Set(["ftth.manage", "customers.create", "subscriptions.create"]),
  } as never;

  console.log(terapkan ? "MENERAPKAN\n" : "RENCANA SAJA (tambahkan --terapkan)\n");

  const o = await buildOdpPlan([odpRows]);
  if (!o.ok) throw new Error(o.error);
  console.log(`ODP       : ${o.data.plan.willCreate} dibuat · ${o.data.plan.willCreatePorts} port · ${o.data.plan.willLinkParents} induk · ${o.data.plan.issues.length} masalah`);

  if (terapkan) {
    const r = await applyOdpFromBlocks(user, [odpRows], { allowPartial: true });
    if (!r.ok) throw new Error("ODP: " + r.error);
    console.log(`  → ${r.data.created.length} dibuat · ${r.data.createdPorts} port · ${r.data.linkedParents} induk · ${r.data.linkedOccupants} pelanggan di port`);
  }

  const c = await buildCustPlan(custRows);
  if (!c.ok) throw new Error(c.error);
  console.log(`Pelanggan : ${c.data.plan.willCreateCustomers} dibuat · ${c.data.plan.willCreateSubscriptions} langganan · ${c.data.plan.newPackages.length} paket · ${c.data.plan.issues.length} masalah`);

  if (terapkan) {
    const r = await applyCustomerFromRows(user, custRows, { allowPartial: true });
    if (!r.ok) throw new Error("Pelanggan: " + r.error);
    console.log(`  → ${r.data.createdCustomers.length} pelanggan · ${r.data.createdSubscriptions} langganan · ${r.data.createdPackages.length} paket · ${r.data.createdOdps.length} ODP · ${r.data.linkedOdpPorts} port tertaut`);
  }
  await db.$disconnect();
}
main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); });
