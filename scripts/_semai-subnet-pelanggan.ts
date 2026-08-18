/**
 * Menyemai subnet pelanggan ke IPAM, DITURUNKAN dari sesi PPPoE yang teramati.
 *
 *   npx tsx scripts/_semai-subnet-pelanggan.ts
 *   npx tsx scripts/_semai-subnet-pelanggan.ts --terapkan
 *
 * ══ INI BUKAN TEBAKAN ══
 *
 * Tiap subnet di sini punya bukti: alamat IP yang BENAR-BENAR diberikan router
 * kepada pelanggan, terbaca worker MikroTik dan tersimpan di
 * `PppoeSession.address`. Yang dilakukan skrip ini hanya mengelompokkannya
 * per /24 dan mencatat berapa pelanggan ada di dalamnya.
 *
 * Subnet yang tidak punya satu pun sesi teramati TIDAK akan muncul — kalau
 * jaringan punya blok yang belum terpakai, ia memang tidak akan terdaftar, dan
 * itu jujur: IPAM ini menggambarkan apa yang terjadi, bukan apa yang
 * direncanakan.
 *
 * ══ YANG TIDAK DILAKUKANNYA ══
 *
 * Tidak mencatat alamat pelanggan satu per satu ke `IPAddress`. Alamat PPPoE
 * berpindah tiap sambungan ulang; mencatatnya sebagai alokasi tetap akan
 * membuat IPAM berisi ribuan baris yang basi dalam hitungan jam.
 */
import { db } from "@/lib/db";

const terapkan = process.argv.includes("--terapkan");

async function main() {
  console.log(terapkan ? "═══ DITERAPKAN ═══\n" : "═══ RENCANA SAJA (tambahkan --terapkan) ═══\n");

  const sesi = await db.pppoeSession.findMany({
    where: { address: { not: null } },
    select: { address: true },
  });

  const per24 = new Map<string, number>();
  for (const s of sesi) {
    const m = /^(\d+)\.(\d+)\.(\d+)\.\d+$/.exec((s.address ?? "").trim());
    if (!m) continue;
    const cidr = `${m[1]}.${m[2]}.${m[3]}.0/24`;
    per24.set(cidr, (per24.get(cidr) ?? 0) + 1);
  }

  console.log(`Sesi ber-IP teramati : ${sesi.length}`);
  console.log(`Subnet /24 tersimpul : ${per24.size}\n`);

  const urut = [...per24.entries()].sort((a, b) => b[1] - a[1]);
  let dibuat = 0;
  let dilewati = 0;

  for (const [cidr, jumlah] of urut) {
    const ada = await db.subnet.findUnique({ where: { cidr }, select: { id: true } });
    if (ada) {
      console.log(`  –  ${cidr.padEnd(20)} sudah terdaftar, TIDAK ditimpa`);
      dilewati++;
      continue;
    }
    console.log(`  ${terapkan ? "✓" : "→"}  ${cidr.padEnd(20)} ${jumlah} pelanggan teramati`);
    if (terapkan) {
      await db.subnet.create({
        data: {
          cidr,
          name: `Pool PPPoE ${cidr.replace("/24", "")}`,
          // Gateway TIDAK ditebak. Konvensi ".1" sering benar dan kadang tidak;
          // menuliskannya sebagai fakta padahal tidak diamati akan membuat
          // orang mempercayai angka yang tidak pernah diverifikasi.
          gateway: null,
          purpose: `Pool alamat PPPoE pelanggan — ${jumlah} sesi teramati saat disemai`,
          notes:
            "Diturunkan dari PppoeSession.address pada 18 Agustus 2026, bukan dari " +
            "dokumen perencanaan. Jumlah pelanggan adalah cacah saat itu dan akan berubah.",
        },
      });
    }
    dibuat++;
  }

  console.log(`\n${dibuat} subnet ${terapkan ? "dibuat" : "akan dibuat"}, ${dilewati} dilewati.`);
  if (!terapkan && dibuat > 0) console.log("Belum ada yang ditulis. Ulangi dengan --terapkan.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
