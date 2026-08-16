/**
 * Menyimpan posisi ONU pelanggan dan memeriksa silang tautan PON Fase 82.
 *
 *   npx tsx scripts/_impor-onu.ts onu.json
 *   npx tsx scripts/_impor-onu.ts onu.json --terapkan
 *
 * `onu.json`: { pelanggan: [{ cid, onu }] } — bentuk ekspor sistem lama
 * dipakai apa adanya supaya tidak ada langkah penyalinan yang bisa keliru.
 */
import { readFileSync } from "node:fs";
import { periksaOnu, terapkanOnu } from "@/lib/onu-import-service";
import { db } from "@/lib/db";

const berkas = process.argv[2];
const terapkan = process.argv.includes("--terapkan");

async function main() {
  if (!berkas) throw new Error("Pakai: _impor-onu.ts <onu.json> [--terapkan]");
  const isi = JSON.parse(readFileSync(berkas, "utf8"));
  const rows = (isi.pelanggan ?? isi).map((x: { cid: string; onu: string | null }) => ({
    serviceNumber: x.cid,
    onu: x.onu ?? null,
  }));

  console.log(terapkan ? "═══ DITERAPKAN ═══\n" : "═══ PERIKSA (tidak menulis apa pun) ═══\n");

  const r = terapkan
    ? await terapkanOnu(rows, (await db.user.findFirstOrThrow({ select: { id: true } })).id)
    : await periksaOnu(rows);

  console.log(`Baris dibaca      : ${rows.length}`);
  console.log(`Posisi terbaca    : ${r.ringkas.siap}`);
  console.log(`Ditolak           : ${r.ringkas.tolak}`);
  console.log(`Nomor tak dikenal : ${r.ringkas.takDikenal}`);
  if ("disimpan" in r) console.log(`DISIMPAN          : ${(r as { disimpan: number }).disimpan}`);

  if (Object.keys(r.alasan).length) {
    console.log("\nAlasan penolakan:");
    for (const [a, n] of Object.entries(r.alasan).sort((x, y) => y[1] - x[1])) {
      console.log(`  ${String(n).padStart(4)}  ${a}`);
    }
  }

  console.log("\n── Pemeriksaan silang terhadap tautan PON Fase 82 ──");
  console.log(`  sepakat        : ${r.sepakat}`);
  console.log(`  berselisih     : ${r.selisih.reduce((s, x) => s + x.pelanggan.length, 0)} pelanggan pada ${r.selisih.length} ODP`);
  console.log(`  tak terperiksa : ${r.takTerperiksa}  (ODP-nya belum bertaut PON)`);

  if (r.selisih.length) {
    console.log("\n  ODP yang berselisih — catatan berkas vs pembacaan perangkat:");
    for (const s of r.selisih) {
      const suara = s.ponOnu.map((x) => `${x.slotPort} (${x.jumlah})`).join(", ");
      console.log(`    ${s.odp.padEnd(15)} ${s.olt.padEnd(23)} berkas ${s.ponOdp.padEnd(6)} ≠ ONU ${suara}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
