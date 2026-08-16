/**
 * Menjalankan impor katalog dari berkas xlsx lewat jalur yang SAMA dengan
 * halaman Impor Katalog — bukan jalur pintas.
 *
 *   npx tsx scripts/_impor-katalog-berkas.ts items.xlsx
 *   npx tsx scripts/_impor-katalog-berkas.ts items.xlsx --terapkan
 *
 * Tanpa `--terapkan` tidak satu pun baris ditulis.
 */
import { readFileSync } from "node:fs";
import { previewCatalogImport, applyCatalogImport } from "@/lib/item-import-service";
import { db } from "@/lib/db";

const berkas = process.argv[2];
const terapkan = process.argv.includes("--terapkan");

async function main() {
  if (!berkas) throw new Error("Pakai: _impor-katalog-berkas.ts <items.xlsx> [--terapkan]");
  // Izin diambil dari peran sungguhan, bukan dikosongkan — importir memang
  // memeriksanya, dan melewatinya berarti menguji jalur yang berbeda.
  const user = await db.user.findFirstOrThrow({
    where: { roles: { some: { role: { permissions: { some: { permission: { code: "items.manage" } } } } } } },
    select: {
      id: true, username: true, email: true, name: true, level: true, divisionId: true,
      roles: { select: { role: { select: { permissions: { select: { permission: { select: { code: true } } } } } } } },
    },
  });
  const izin = new Set(user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code)));
  const gudang = await db.warehouse.findFirstOrThrow({ select: { id: true, code: true, name: true } });
  console.log(`Gudang tujuan: ${gudang.code} — ${gudang.name}\n`);

  const buf = readFileSync(berkas);
  const file = new File([new Uint8Array(buf)], "items.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const u = { ...user, divisionName: null, mustChangePassword: false, permissions: izin } as never;
  const r = terapkan
    ? await applyCatalogImport(u, file, gudang.id, { allowPartial: true })
    : await previewCatalogImport(u, file, gudang.id);

  if (!r.ok) { console.log("GAGAL:", r.error); return; }
  const d = r.data as unknown as Record<string, unknown>;
  console.log(terapkan ? "═══ DITERAPKAN ═══" : "═══ PRATINJAU (tidak menulis apa pun) ═══");
  for (const k of [
    "ok", "willCreateCategories", "willCreateSuppliers", "willCreateItems",
    "willCompleteItems", "willSkipItems", "openingUnits", "skippedMovements", "ignoredSheets",
    "createdCategories", "createdSuppliers", "createdItems", "completedItems", "openingLines",
  ]) {
    if (d[k] !== undefined) console.log(`  ${k.padEnd(22)} ${String(d[k])}`);
  }
  const issues = (d.issues ?? []) as { row?: number; sheet?: string; message?: string }[];
  console.log(`  masalah                ${issues.length}`);
  for (const i of issues.slice(0, 25)) {
    console.log(`     ${i.sheet ?? "-"} baris ${i.row ?? "-"}: ${i.message ?? JSON.stringify(i)}`);
  }
  if (issues.length > 25) console.log(`     … ${issues.length - 25} lagi`);
}
main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); }).finally(() => db.$disconnect());
