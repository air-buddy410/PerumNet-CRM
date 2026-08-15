/**
 * Menaikkan ODP yang portnya HABIS dari 1:8 ke 1:16.
 *
 *   npx tsx scripts/_naikkan-splitter-penuh.ts            # rencana
 *   npx tsx scripts/_naikkan-splitter-penuh.ts --terapkan
 *
 * Hanya menyentuh yang benar-benar penuh. ODP 1:8 yang masih punya ruang
 * dibiarkan: splitter di lapangan tidak berubah hanya karena angkanya diubah
 * di sini, dan menaikkan yang belum perlu membuat kapasitas di aplikasi
 * berbeda dari kenyataan tanpa alasan.
 */
import { db } from "@/lib/db";

const terapkan = process.argv.includes("--terapkan");
const TARGET = 16;

async function main() {
  const semua = await db.odp.findMany({
    where: { portCapacity: { lt: TARGET } },
    select: { id: true, code: true, role: true, portCapacity: true, portUsed: true },
    orderBy: { code: "asc" },
  });
  const penuh = semua.filter((o) => o.portUsed >= o.portCapacity);

  console.log(terapkan ? "MENERAPKAN\n" : "RENCANA SAJA (tambahkan --terapkan)\n");
  console.log(`ODP di bawah 1:${TARGET} : ${semua.length}`);
  console.log(`di antaranya PENUH     : ${penuh.length}\n`);

  for (const o of penuh) {
    const tambah = TARGET - o.portCapacity;
    console.log(`  → ${o.code.padEnd(18)} [${o.role}] ${o.portUsed}/${o.portCapacity} → 1:${TARGET}  (+${tambah} port)`);
    if (!terapkan) continue;

    await db.odp.update({ where: { id: o.id }, data: { portCapacity: TARGET } });
    const ada = new Set(
      (await db.odpPort.findMany({ where: { odpId: o.id }, select: { portNumber: true } })).map((p) => p.portNumber)
    );
    const kurang = Array.from({ length: TARGET }, (_, i) => i + 1).filter((n) => !ada.has(n));
    if (kurang.length) {
      await db.odpPort.createMany({ data: kurang.map((portNumber) => ({ odpId: o.id, portNumber })) });
    }
  }

  const sisaPenuh = (await db.odp.findMany({ select: { portUsed: true, portCapacity: true } }))
    .filter((o) => o.portUsed >= o.portCapacity).length;
  const kosong = await db.odpPort.count({ where: { subscriptionId: null } });
  console.log(`\nODP masih penuh : ${sisaPenuh}`);
  console.log(`port kosong     : ${kosong}`);
  await db.$disconnect();
}
main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); });
