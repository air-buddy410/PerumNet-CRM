/**
 * Merapikan kapasitas ODP ke ukuran splitter yang benar-benar ada.
 *
 *   npx tsx scripts/_rapikan-kapasitas-odp.ts            # rencana
 *   npx tsx scripts/_rapikan-kapasitas-odp.ts --terapkan
 *
 * Splitter yang dipakai PerumNet hanya 1:8 dan 1:16, jadi kapasitas di luar
 * kedua angka itu pasti salah catat. Yang diperbaiki HANYA yang selisihnya
 * tidak bisa berarti apa-apa selain salah ketik.
 */
import { db } from "@/lib/db";

const terapkan = process.argv.includes("--terapkan");

/** Ukuran splitter yang benar-benar dipakai di lapangan. */
const SPLITTER = [8, 16];

async function main() {
  const aneh = await db.odp.findMany({
    where: { portCapacity: { notIn: SPLITTER } },
    select: { id: true, code: true, portCapacity: true, portUsed: true },
    orderBy: { code: "asc" },
  });

  console.log(terapkan ? "MENERAPKAN\n" : "RENCANA SAJA (tambahkan --terapkan)\n");
  let diperbaiki = 0;

  for (const o of aneh) {
    // Kapasitas di luar 8 dan 16 diperlakukan sebagai 1:16.
    //
    // Untuk 15 itu jelas: tidak ada splitter 1:15 dan selisih satu terlalu
    // kecil untuk berarti 1:8. Untuk 10 tidak jelas dari data mana pun —
    // pemilik produk yang memutuskan menganggapnya 1:16, dan keputusan itu
    // dicatat di sini supaya tidak dikira kesimpulan mesin.
    //
    // Menaikkan kapasitas selalu aman: port yang belum ada dibuat, port yang
    // sudah terisi tidak tersentuh. Yang berbahaya menurunkannya.
    const target = 16;
    if (target < o.portUsed) {
      console.log(`  !  ${o.code.padEnd(16)} ${o.portUsed}/${o.portCapacity} — target ${target} lebih kecil dari yang terpakai, dilewati`);
      continue;
    }

    console.log(`  →  ${o.code.padEnd(16)} ${o.portCapacity} → ${target} port`);
    diperbaiki++;
    if (!terapkan) continue;

    await db.odp.update({ where: { id: o.id }, data: { portCapacity: target } });
    // Port yang belum ada dibuat menyusul kapasitasnya. Menaikkan angka tanpa
    // membuat portnya menghasilkan ODP yang mengaku punya ruang tetapi tidak
    // punya baris untuk ditempati.
    const ada = new Set(
      (await db.odpPort.findMany({ where: { odpId: o.id }, select: { portNumber: true } })).map((p) => p.portNumber)
    );
    const kurang = Array.from({ length: target }, (_, i) => i + 1).filter((n) => !ada.has(n));
    if (kurang.length) {
      await db.odpPort.createMany({ data: kurang.map((portNumber) => ({ odpId: o.id, portNumber })) });
      console.log(`       + ${kurang.length} port dibuat`);
    }
  }

  console.log(`\n${diperbaiki} diperbaiki · ${aneh.length - diperbaiki} dibiarkan`);
  const sisa = await db.odp.groupBy({ by: ["portCapacity"], _count: true, orderBy: { portCapacity: "asc" } });
  console.log("sebaran kapasitas:", sisa.map((s) => `${s.portCapacity}=${s._count}`).join(" · "));
  await db.$disconnect();
}
main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); });
