/**
 * Menghapus paket yang lahir dari impor berulang.
 *
 *   npx tsx scripts/_bersihkan-paket-duplikat.ts [--terapkan]
 *
 * Impor sempat membuat salinan paket setiap kali dijalankan ulang, karena
 * pencocokan harga hanya memeriksa paket pertama yang harganya sama. Salinan
 * itu TIDAK pernah dipakai langganan mana pun — dan hanya yang begitu yang
 * dihapus di sini.
 */
import { db } from "@/lib/db";

const terapkan = process.argv.includes("--terapkan");

async function main() {
  const semua = await db.package.findMany({
    select: {
      id: true, code: true, name: true, monthlyPrice: true,
      _count: { select: { subscriptions: true, quotations: true, surveys: true, interestedLeads: true } },
    },
    orderBy: { code: "asc" },
  });

  // Salinan dikenali dari akhiran `_2`, `_3`, … yang dibuat uniqueCode().
  const calon = semua.filter((p) => /_\d+$/.test(p.code));
  console.log(terapkan ? "MENERAPKAN\n" : "RENCANA SAJA (tambahkan --terapkan)\n");
  console.log(`paket total: ${semua.length} · berakhiran angka: ${calon.length}\n`);

  let hapus = 0;
  for (const p of calon) {
    const dipakai = Object.entries(p._count).filter(([, n]) => n > 0);
    if (dipakai.length) {
      // Sekali sebuah paket dipakai, ia bukan salinan menganggur lagi —
      // menghapusnya memutus riwayat harga langganan yang menunjuknya.
      console.log(`  !  ${p.code.padEnd(26)} dipakai (${dipakai.map(([k, n]) => `${k}=${n}`).join(", ")}) — dibiarkan`);
      continue;
    }
    console.log(`  →  ${p.code.padEnd(26)} Rp${Number(p.monthlyPrice).toLocaleString("id-ID")} — dihapus`);
    hapus++;
    if (terapkan) await db.package.delete({ where: { id: p.id } });
  }
  console.log(`\n${hapus} dihapus · ${await db.package.count()} paket tersisa`);
  await db.$disconnect();
}
main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); });
