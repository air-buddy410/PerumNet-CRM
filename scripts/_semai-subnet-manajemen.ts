/**
 * Menyemai satu subnet yang benar-benar kita amati: jaringan manajemen.
 *
 *   npx tsx scripts/_semai-subnet-manajemen.ts
 *   npx tsx scripts/_semai-subnet-manajemen.ts --terapkan
 *
 * ══ KENAPA HANYA SATU SUBNET ══
 *
 * `192.168.100.0/24` adalah satu-satunya subnet yang kita KETAHUI dari
 * pengamatan, bukan dari asumsi: ketujuh perangkat terdaftar berada di
 * dalamnya, dan probe menyentuh alamatnya tiap menit dan berhasil.
 *
 * Subnet pelanggan TIDAK diikutkan karena kita tidak mengamatinya sama sekali
 * — `PppoeSession` dan `NetworkPort` tidak punya kolom IP. Menebaknya berarti
 * menaruh angka yang akan dipercaya orang di layar yang justru dipakai untuk
 * memastikan alamat tidak bentrok.
 *
 * `172.30.10.6` juga TIDAK diikutkan: itu jalur milik ALUS, bukan jaringan
 * kita, dan mendaftarkannya di IPAM kita berarti mengaku memilikinya.
 */
import { db } from "@/lib/db";
import { USER_LEVELS } from "@/lib/constants";

const terapkan = process.argv.includes("--terapkan");

const CIDR = "192.168.100.0/24";
const GATEWAY = "192.168.100.1";

/** Alamat berada di dalam 192.168.100.0/24. */
function diDalamSubnet(ip: string): boolean {
  return /^192\.168\.100\.\d{1,3}$/.test(ip.trim());
}

async function main() {
  console.log(terapkan ? "═══ DITERAPKAN ═══\n" : "═══ RENCANA SAJA (tambahkan --terapkan) ═══\n");

  const pencatat =
    (await db.user.findFirst({ where: { level: USER_LEVELS.OWNER }, select: { id: true, username: true }, orderBy: { createdAt: "asc" } })) ??
    (await db.user.findFirst({ select: { id: true, username: true }, orderBy: { createdAt: "asc" } }));
  if (!pencatat) {
    console.error("Tidak ada akun pengguna untuk dicatat sebagai pembuat. Berhenti.");
    process.exit(1);
  }

  // Alamat diambil dari perangkat yang SUDAH terdaftar — bukan dipindai.
  const perangkat = await db.networkDevice.findMany({
    select: { id: true, hostname: true, deviceType: true, managementIp: true, siteId: true },
    orderBy: { hostname: "asc" },
  });

  const anggota = perangkat
    .map((d) => {
      const ip = [d.hostname, d.managementIp].find((x) => x && diDalamSubnet(x));
      return ip ? { ...d, ip: ip.trim() } : null;
    })
    .filter((x): x is (typeof perangkat)[number] & { ip: string } => x !== null);

  console.log(`Perangkat terdaftar        : ${perangkat.length}`);
  console.log(`Beralamat di ${CIDR} : ${anggota.length}\n`);

  const sudahAda = await db.subnet.findUnique({ where: { cidr: CIDR }, select: { id: true } });
  if (sudahAda) {
    console.log(`Subnet ${CIDR} sudah terdaftar — TIDAK ditimpa.`);
  } else {
    console.log(`  ${terapkan ? "✓" : "→"} Subnet ${CIDR}  gateway ${GATEWAY}`);
  }

  for (const a of anggota) {
    const punya = await db.iPAddress.findUnique({ where: { address: a.ip }, select: { id: true } });
    if (punya) {
      console.log(`  –  ${a.ip.padEnd(16)} sudah terdaftar, dilewati`);
      continue;
    }
    console.log(`  ${terapkan ? "✓" : "→"} ${a.ip.padEnd(16)} ${a.deviceType.padEnd(7)} ${a.hostname}`);
  }

  if (!terapkan) {
    console.log("\nBelum ada yang ditulis. Ulangi dengan --terapkan kalau daftar di atas benar.");
    return;
  }

  const siteRouter = anggota.find((a) => a.deviceType === "ROUTER")?.siteId ?? anggota[0]?.siteId ?? null;
  const subnet =
    sudahAda ??
    (await db.subnet.create({
      data: {
        cidr: CIDR,
        name: "Jaringan manajemen perangkat",
        gateway: GATEWAY,
        purpose: "Manajemen router dan OLT — dipakai probe, telnet CLI, dan SNMP",
        siteId: siteRouter,
        notes:
          "Disemai dari perangkat yang sudah terdaftar, 18 Agustus 2026. " +
          "Subnet pelanggan belum ada di sini karena sistem kita tidak menyimpan IP pelanggan.",
      },
      select: { id: true },
    }));

  let dibuat = 0;
  for (const a of anggota) {
    const punya = await db.iPAddress.findUnique({ where: { address: a.ip }, select: { id: true } });
    if (punya) continue;
    await db.iPAddress.create({
      data: {
        subnetId: subnet.id,
        address: a.ip,
        status: "ALLOCATED",
        assignedType: "DEVICE",
        deviceId: a.id,
        description: `${a.deviceType} ${a.hostname}`,
        createdById: pencatat.id,
      },
    });
    dibuat++;
  }

  console.log(`\nSubnet siap · ${dibuat} alamat dicatat (pembuat: ${pencatat.username}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
