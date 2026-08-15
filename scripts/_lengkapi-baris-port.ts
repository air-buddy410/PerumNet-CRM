/**
 * Membuat baris port yang kurang dari kapasitas ODP-nya.
 *
 *   npx tsx scripts/_lengkapi-baris-port.ts [--terapkan]
 *
 * `portCapacity` dan jumlah baris `OdpPort` bisa berbeda bila kapasitas
 * pernah dinaikkan tanpa portnya ikut dibuat. ODP yang begitu MENGAKU punya
 * ruang tetapi tidak punya port untuk ditempati — dan pelanggan yang menunggu
 * tetap menganggur sementara angkanya menutupi sebabnya.
 *
 * Hanya MENAMBAH. Port berlebih tidak pernah dihapus di sini: menghapusnya
 * bisa memutus pelanggan dari tiangnya, dan itu keputusan tersendiri.
 */
import { db } from "@/lib/db";

const terapkan = process.argv.includes("--terapkan");

async function main() {
  const odp = await db.odp.findMany({
    select: { id: true, code: true, portCapacity: true, _count: { select: { ports: true } } },
    orderBy: { code: "asc" },
  });
  const kurang = odp.filter((o) => o._count.ports < o.portCapacity);

  console.log(terapkan ? "MENERAPKAN\n" : "RENCANA SAJA (tambahkan --terapkan)\n");
  console.log(`ODP diperiksa: ${odp.length} · kekurangan baris port: ${kurang.length}\n`);

  let dibuat = 0;
  for (const o of kurang) {
    const ada = new Set(
      (await db.odpPort.findMany({ where: { odpId: o.id }, select: { portNumber: true } })).map((p) => p.portNumber)
    );
    const perlu = Array.from({ length: o.portCapacity }, (_, i) => i + 1).filter((n) => !ada.has(n));
    console.log(`  → ${o.code.padEnd(20)} ${o._count.ports}/${o.portCapacity} — buat ${perlu.length} port`);
    dibuat += perlu.length;
    if (!terapkan) continue;
    await db.odpPort.createMany({ data: perlu.map((portNumber) => ({ odpId: o.id, portNumber })) });
  }

  console.log(`\n${dibuat} baris port dibuat`);
  const kosong = await db.odpPort.count({ where: { subscriptionId: null } });
  console.log(`port kosong sekarang: ${kosong}`);
  await db.$disconnect();
}
main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); });
