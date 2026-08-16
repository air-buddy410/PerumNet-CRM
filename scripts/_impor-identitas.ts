/**
 * Melengkapi identitas pelanggan (telepon, NIK, tanggal lahir, email,
 * koordinat) dari salinan sistem lama.
 *
 *   npx tsx scripts/_impor-identitas.ts identitas.tsv
 *   npx tsx scripts/_impor-identitas.ts identitas.tsv --terapkan
 *
 * Kolom TSV: nomorLayanan, telepon, nik, tanggalLahir, email, lat, lng
 *
 * MELENGKAPI, bukan menimpa. Nilai yang sudah terisi di CRM tidak diganti —
 * kecuali telepon "-", yang bukan nilai melainkan ketiadaan yang menyamar.
 */
import { readFileSync } from "node:fs";
import { periksaIdentitas, terapkanIdentitas } from "@/lib/customer-identity-service";
import { db } from "@/lib/db";

const berkas = process.argv[2];
const terapkan = process.argv.includes("--terapkan");
// Keputusan pemilik jaringan, bukan bawaan: lihat `nikMenang`.
const nikMenang = process.argv.includes("--nik-menang");

async function main() {
  if (!berkas) throw new Error("Pakai: _impor-identitas.ts <identitas.tsv> [--terapkan]");
  const user = await db.user.findFirstOrThrow({ select: { id: true } });

  const rows = readFileSync(berkas, "utf8").split("\n").filter(Boolean).map((l) => {
    const [serviceNumber, phone, nik, dob, email, lat, lng] = l.split("\t");
    return { serviceNumber, phone, nik, dob, email, lat, lng };
  });

  const r = terapkan
    ? await terapkanIdentitas(rows, user.id, nikMenang)
    : await periksaIdentitas(rows, nikMenang);
  if (nikMenang) console.log("  NIK MENANG saat berselisih dengan tanggal ketikan.");
  console.log(terapkan ? "═══ DITERAPKAN ═══" : "═══ PERIKSA (tidak menulis apa pun) ═══");
  console.log(`  baris dibaca : ${rows.length}`);
  console.log(`  ringkas      : ${JSON.stringify(r.ringkas)}`);
  console.log(`  per bidang   : ${JSON.stringify(r.perBidang)}`);
  console.log(`  masalah      : ${r.masalah.length}`);
  for (const m of r.masalah.slice(0, 12)) console.log(`     ${m.serviceNumber}: ${m.pesan}`);
  if (r.masalah.length > 12) console.log(`     … ${r.masalah.length - 12} lagi`);
  const tolak = r.baris.filter((b) => b.status === "TOLAK");
  if (tolak.length) {
    console.log(`  ditolak (${tolak.length}):`);
    for (const b of tolak.slice(0, 6)) console.log(`     ${b.pesan}`);
  }
}
main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); }).finally(() => db.$disconnect());
