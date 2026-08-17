/**
 * Memasukkan pelanggan baru dari sistem lama — TANPA menyentuh ODP.
 *
 *   npx tsx scripts/_impor-pelanggan.ts pelanggan-baru.tsv
 *   npx tsx scripts/_impor-pelanggan.ts pelanggan-baru.tsv --terapkan
 *
 * Bedanya dengan `_terapkan-alus.ts`: berkas itu memuat ODP dan pelanggan
 * sekaligus, untuk pindahan besar. Yang ini untuk PENAMBAHAN kecil yang terus
 * terjadi selama sistem lama masih berjalan — ODP-nya sudah ada, yang baru
 * cuma orangnya. Fase 83 memerlukannya berulang, bukan sekali.
 *
 * Baris pertama TSV adalah judul kolom; yang dikenali ada di `ALIAS` pada
 * `src/lib/customer-import.ts`. Kolom dikenali dari NAMANYA, bukan urutannya.
 *
 * ══ LANGKAH KEDUA YANG WAJIB ══
 *
 * Skrip ini TIDAK membuat `BillingProfile`. Langganan yang dihasilkannya
 * lengkap dalam segala hal kecuali satu: ia tidak akan pernah ditagih, dan
 * ketiadaan itu TIDAK menghasilkan galat apa pun — hanya pelanggan yang
 * diam-diam gratis. Empat pelanggan yang diimpor 17 Agustus 2026 nyaris
 * tertinggal begitu; ketahuan lewat gladi penagihan, bukan lewat kegagalan.
 *
 * Jadi sesudah menjalankan ini, jalankan juga:
 *
 *   npx tsx scripts/_siapkan-profil-tagihan.ts tagih.tsv --terapkan
 *
 * dan pastikan nomor layanan yang baru ADA di `tagih.tsv`.
 */
import { readFileSync } from "node:fs";
import { applyCustomerFromRows, buildPlan } from "@/lib/customer-import-service";
import { db } from "@/lib/db";

const berkas = process.argv[2];
const terapkan = process.argv.includes("--terapkan");

async function main() {
  if (!berkas) throw new Error("Pakai: _impor-pelanggan.ts <berkas.tsv> [--terapkan]");
  const rows = readFileSync(berkas, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => l.split("\t"));

  console.log(terapkan ? "═══ DITERAPKAN ═══\n" : "═══ RENCANA SAJA (tambahkan --terapkan) ═══\n");
  console.log(`Baris data: ${rows.length - 1}\n`);

  const rencana = await buildPlan(rows);
  if (!rencana.ok) {
    console.error("Rencana ditolak:", rencana.error);
    process.exitCode = 1;
    return;
  }
  for (const r of rencana.data.plan.customers) {
    console.log(`  ${r.cid.padEnd(14)} ${r.action.padEnd(8)} ${r.name}`);
    if (r.reason) console.log(`      alasan: ${r.reason}`);
    for (const c of r.changes) console.log(`      + ${c}`);
    for (const n of r.notes) console.log(`      · ${n}`);
  }
  for (const i of rencana.data.plan.issues) {
    console.log(`  ⚠ baris ${i.rowNumber} [${i.column}] ${i.message}`);
  }
  if (rencana.data.plan.unknownPackages.length) {
    console.log("\n  Paket belum ada di master:", rencana.data.plan.unknownPackages.join(", "));
  }
  if (rencana.data.plan.newPackages.length) {
    console.log("  Paket AKAN DIBUAT:", rencana.data.plan.newPackages.map((p) => `${p.plan} → ${p.price}`).join(", "));
  }
  if (rencana.data.plan.unknownSales.length) {
    console.log("  Sales tak dikenal:", rencana.data.plan.unknownSales.join(", "));
  }

  if (!terapkan) return;

  const user = {
    id: (
      await db.user.findFirstOrThrow({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      })
    ).id,
    permissions: new Set(["ftth.manage", "customers.create", "subscriptions.create"]),
  } as never;

  const h = await applyCustomerFromRows(user, rows);
  if (!h.ok) {
    console.error("\nDitolak:", h.error);
    process.exitCode = 1;
    return;
  }
  console.log("\nHasil:", JSON.stringify(h.data, null, 1));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
