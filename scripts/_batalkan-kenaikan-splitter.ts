/**
 * Mengembalikan kapasitas ODP yang sempat dinaikkan atas premis yang salah.
 *
 *   npx tsx scripts/_batalkan-kenaikan-splitter.ts [--terapkan]
 *
 * Tiga ODP dinaikkan dari 1:8 ke 1:16 dengan alasan "pelanggan tidak kebagian
 * port". Alasan itu keliru: splitter di lapangan hanya 1:8 dan 1:16, dan
 * mengubah angkanya di sini tidak menambah port di tiangnya. Pelanggan yang
 * tidak kebagian port berarti ODP-nya salah catat atau layanannya memang sudah
 * tidak aktif — dua hal yang diselesaikan dengan memperbaiki data, bukan
 * dengan membesarkan kapasitas.
 *
 * Port di atas kapasitas asli hanya dihapus bila BELUM ditempati.
 */
import { db } from "@/lib/db";

const terapkan = process.argv.includes("--terapkan");
const KEMBALIKAN: { code: string; ke: number }[] = [
  { code: "PSG 240102", ke: 8 },
  { code: "SRY 020207", ke: 8 },
  { code: "SRY020201", ke: 8 },
];

async function main() {
  console.log(terapkan ? "MENERAPKAN\n" : "RENCANA SAJA (tambahkan --terapkan)\n");
  for (const k of KEMBALIKAN) {
    const o = await db.odp.findUnique({
      where: { code: k.code },
      select: { id: true, code: true, portCapacity: true, portUsed: true },
    });
    if (!o) { console.log(`  ?  ${k.code} tidak ditemukan`); continue; }
    if (o.portCapacity <= k.ke) { console.log(`  =  ${o.code.padEnd(16)} sudah ${o.portCapacity}`); continue; }

    const lebih = await db.odpPort.findMany({
      where: { odpId: o.id, portNumber: { gt: k.ke } },
      select: { id: true, portNumber: true, subscriptionId: true },
    });
    const terisi = lebih.filter((p) => p.subscriptionId);
    if (terisi.length) {
      // Port di atas kapasitas asli sudah dihuni. Menghapusnya akan memutus
      // pelanggan dari tiangnya; kapasitasnya dibiarkan sampai ada yang
      // memutuskan pelanggan itu sebenarnya di ODP mana.
      console.log(`  !  ${o.code.padEnd(16)} ${terisi.length} port di atas ${k.ke} sudah dihuni — dibiarkan`);
      continue;
    }

    console.log(`  →  ${o.code.padEnd(16)} ${o.portCapacity} → ${k.ke}  (hapus ${lebih.length} port kosong)`);
    if (!terapkan) continue;
    await db.odpPort.deleteMany({ where: { id: { in: lebih.map((p) => p.id) } } });
    await db.odp.update({ where: { id: o.id }, data: { portCapacity: k.ke } });
  }

  const sebaran = await db.odp.groupBy({ by: ["portCapacity"], _count: true, orderBy: { portCapacity: "asc" } });
  console.log("\nsebaran kapasitas:", sebaran.map((s) => `${s.portCapacity}=${s._count}`).join(" · "));
  await db.$disconnect();
}
main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); });
