/**
 * Menyusun lembar keputusan dari peta ALUS lalu MEMERIKSANYA saja.
 *
 *   npx tsx scripts/_pratinjau-peta-alus.ts peta-alus.tsv [--terapkan]
 *
 * Tanpa `--terapkan` tidak satu pun baris basis data disentuh.
 */
import { readFileSync } from "node:fs";
import { periksaPemetaan, terapkanPemetaan } from "@/lib/pemetaan-import-service";
import { db } from "@/lib/db";

const berkas = process.argv[2];
const terapkan = process.argv.includes("--terapkan");

async function main() {
  const baris = readFileSync(berkas, "utf8").split("\n").filter(Boolean).map((l) => l.split("\t"));
  const lembar = [{
    nama: "2. Tanpa kandidat (jawaban ALUS)",
    baris: [
      ["Username PPPoE", "Status", "Terakhir online", "IP terakhir", "MAC (caller-id)",
       "Angka di dalam username", "KEPUTUSAN (isi Nomor Layanan, atau: TIDAK DIPAKAI)", "CATATAN"],
      ...baris.map(([u, cid, nama]) => [u, "", "", "", "", "", cid, `ALUS: ${nama}`]),
    ],
  }];

  const hasil = terapkan
    ? await terapkanPemetaan(lembar, (await db.user.findFirstOrThrow({ select: { id: true } })).id)
    : await periksaPemetaan(lembar);

  console.log(terapkan ? "═══ DITERAPKAN ═══" : "═══ PRATINJAU (tidak mengubah apa pun) ═══");
  console.log("  ringkas:", JSON.stringify(hasil.ringkas), "· masalah:", hasil.masalah.length, "· dikosongkan:", hasil.dilewati);
  const tolak = hasil.baris.filter((b) => b.status === "TOLAK");
  if (tolak.length) {
    console.log(`\n  ⛔ DITOLAK (${tolak.length}) — perlu diputuskan orang:`);
    for (const b of tolak) console.log(`     ${b.kunci}\n        ${b.pesan}`);
  }
  for (const m of hasil.masalah.slice(0, 10)) console.log(`  ⚠ ${m.lembar} baris ${m.baris}: ${m.pesan}`);
  const siap = hasil.baris.filter((b) => b.status === "SIAP");
  console.log(`\n  ✅ ${terapkan ? "diterapkan" : "siap"}: ${siap.length}`);
  for (const b of siap.slice(0, 5)) console.log(`     ${b.kunci} — ${b.pesan}`);
  if (siap.length > 5) console.log(`     … ${siap.length - 5} lagi`);
}
main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); }).finally(() => db.$disconnect());
