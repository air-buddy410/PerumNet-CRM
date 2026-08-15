/**
 * Menempatkan perangkat jaringan ke site yang benar, dicocokkan lewat ALAMAT IP.
 *
 *   npx tsx scripts/tandai-site-perangkat.ts            # lihat rencana saja
 *   npx tsx scripts/tandai-site-perangkat.ts --terapkan # simpan
 *
 * IP dipakai sebagai jangkar, bukan hostname, karena hostname lima dari enam
 * perangkat kita masih berupa alamat IP bawaan — dan yang satu itu pun bisa
 * berubah kalau operator mengganti sysName di perangkatnya. Alamat manajemen
 * tidak berubah tanpa seseorang memutuskan untuk mengubahnya.
 *
 * Site yang belum ada DIBUAT. Perangkat yang IP-nya tidak ada di peta di bawah
 * TIDAK disentuh — dibiarkan di tempatnya, bukan dipindahkan ke tempat asal.
 */
import { db } from "@/lib/db";

/**
 * Peta IP → site. ISI BAGIAN INI.
 *
 * `code` menjadi `NetworkSite.siteCode`; pakai singkatan yang dipakai
 * lapangan supaya cocok dengan penamaan ODP (`BSS`, `ABG1`, `GKS`, `TMG2`).
 * `type` mengikuti kosakata NetworkSite: POP | MINI_POP | ODC | TOWER | …
 */
const PETA: { ip: string; code: string; name: string; type: string }[] = [
  { ip: "192.168.100.1", code: "NGB", name: "Nagabasukih", type: "POP" },
  { ip: "192.168.100.30", code: "PSG", name: "Pesagi", type: "MINI_POP" },
  { ip: "192.168.100.60", code: "KCC", name: "Kecicang", type: "POP" },
  { ip: "192.168.100.61", code: "ABG", name: "Abang", type: "MINI_POP" },
  // PERIKSA URUTAN KEDUANYA sebelum --terapkan.
  //
  // Daftar dari lapangan menyebut 192.168.10.11 dan 192.168.10.12, tetapi
  // alamat itu tidak ada di LibreNMS; yang dipantau `192.168.100.11` dan
  // `.12` — kurang satu nol, dan jumlahnya persis cocok dengan dua OLT HSGQ
  // Seraya. Yang TIDAK bisa disimpulkan dari mana pun adalah mana yang Barat
  // dan mana yang Tengah, jadi urutan di bawah ini menuruti urutan daftarnya
  // dan harus dibenarkan orang yang tahu.
  { ip: "192.168.100.11", code: "SRYB", name: "Seraya Barat", type: "MINI_POP" },
  { ip: "192.168.100.12", code: "SRYT", name: "Seraya Tengah", type: "MINI_POP" },
  // OLT HSGQ Kecicang (192.168.100.10) sengaja TIDAK ada di sini: SNMP-nya
  // tidak bisa diaktifkan karena batasan firmware, jadi LibreNMS tidak
  // memantaunya dan ia tidak akan pernah muncul lewat sinkron. Ia perlu
  // didaftarkan manual bila ingin tercatat di CRM.
];

const terapkan = process.argv.includes("--terapkan");

async function main() {
  const perangkat = await db.networkDevice.findMany({
    select: { id: true, hostname: true, managementIp: true, site: { select: { siteCode: true, name: true } } },
    orderBy: { managementIp: "asc" },
  });

  console.log(terapkan ? "MENERAPKAN\n" : "RENCANA (tambahkan --terapkan untuk menyimpan)\n");
  let pindah = 0;
  let lewat = 0;

  for (const d of perangkat) {
    const target = PETA.find((p) => p.ip === d.managementIp);
    if (!target) {
      console.log(`  -  ${(d.managementIp ?? d.hostname).padEnd(16)} tidak ada di peta — dibiarkan di ${d.site.siteCode}`);
      lewat++;
      continue;
    }
    if (d.site.siteCode === target.code) {
      console.log(`  =  ${(d.managementIp ?? "").padEnd(16)} sudah di ${target.code}`);
      continue;
    }

    console.log(`  →  ${(d.managementIp ?? "").padEnd(16)} ${d.site.siteCode} → ${target.code} (${target.name})`);
    pindah++;
    if (!terapkan) continue;

    const site =
      (await db.networkSite.findUnique({ where: { siteCode: target.code }, select: { id: true } })) ??
      (await db.networkSite.create({
        data: { siteCode: target.code, name: target.name, type: target.type },
        select: { id: true },
      }));

    await db.networkDevice.update({
      where: { id: d.id },
      data: {
        siteId: site.id,
        // Catatan "pindahkan ke site yang benar" dari sinkron dicabut begitu
        // site-nya memang sudah benar — kalau dibiarkan, ia akan terus
        // meminta pekerjaan yang sudah selesai.
        notes: null,
      },
    });
  }

  console.log(`\n${pindah} dipindahkan · ${lewat} dilewati · ${perangkat.length} perangkat`);
  if (!terapkan && pindah > 0) console.log("Belum ada yang disimpan. Jalankan ulang dengan --terapkan.");
  await db.$disconnect();
}

main();
