/**
 * Membangun lapisan OLT, port PON, dan menyambung ODP ke site-nya.
 *
 *   npx tsx scripts/_impor-olt.ts olt.json
 *   npx tsx scripts/_impor-olt.ts olt.json --terapkan
 *
 * `olt.json`: { daftar: OltMasuk[], peta: {namaOlt: hostname}, oltPerPelanggan: {nomorLayanan: namaOlt} }
 *
 * `peta` DIISI MANUSIA. LibreNMS mengenal perangkat lewat alamat IP
 * (`192.168.100.12`), sistem lama lewat nama (`HSGQ-102-SerayaTengah`), dan
 * tidak ada satu pun bidang yang menghubungkan keduanya. Menjodohkannya lewat
 * tebakan nama akan menautkan OLT yang salah ke seluruh wilayah.
 */
import { readFileSync } from "node:fs";
import { periksaOlt, terapkanOlt } from "@/lib/olt-import-service";
import { db } from "@/lib/db";

const berkas = process.argv[2];
const terapkan = process.argv.includes("--terapkan");

async function main() {
  if (!berkas) throw new Error("Pakai: _impor-olt.ts <olt.json> [--terapkan]");
  const user = await db.user.findFirstOrThrow({ select: { id: true } });
  const { daftar, peta, oltPerPelanggan } = JSON.parse(readFileSync(berkas, "utf8"));

  const r = terapkan
    ? await terapkanOlt(daftar, peta, oltPerPelanggan ?? {}, user.id)
    : await periksaOlt(daftar, peta, oltPerPelanggan ?? {});

  console.log(terapkan ? "═══ DITERAPKAN ═══" : "═══ PERIKSA (tidak menulis apa pun) ═══");
  for (const o of r.olt) {
    console.log(`  ${o.status.padEnd(6)} ${o.nama.padEnd(24)} ${(o.perangkat ?? "-").padEnd(16)} ${o.pesan}`);
  }
  console.log(`\n  port PON per OLT : ${JSON.stringify(r.ponPerOlt)}`);
  console.log(`  ODP → satu OLT   : ${r.odpTertaut}`);
  console.log(`  ODP bentrok OLT  : ${r.odpBentrok.length}`);
  for (const b of r.odpBentrok.slice(0, 8)) console.log(`     ${b.odp}: ${b.olt.join(" vs ")}`);
  if (r.odpBentrok.length > 8) console.log(`     … ${r.odpBentrok.length - 8} lagi`);
  console.log(`  masalah          : ${r.masalah.length}`);
  for (const m of r.masalah.slice(0, 8)) console.log(`     ${m}`);
  if ("oltDibuat" in r) {
    const t = r as import("@/lib/olt-import-service").HasilOlt;
    console.log(`\n  OLT dibuat       : ${t.oltDibuat}`);
    console.log(`  port PON dibuat  : ${t.ponDibuat}`);
    console.log(`  ODP disambung    : ${t.odpDisambung}`);
  }
}
main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); }).finally(() => db.$disconnect());
