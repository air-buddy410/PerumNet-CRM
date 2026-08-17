/**
 * Mendaftarkan OLT HSGQ Kecicang ke CRM — perangkat keenam.
 *
 *   npx tsx scripts/_daftarkan-hsgq-kecicang.ts
 *   npx tsx scripts/_daftarkan-hsgq-kecicang.ts --terapkan
 *
 * HANYA MENULIS KE BASIS DATA CRM. Perangkatnya sendiri tidak disentuh.
 *
 * Selama ini OLT ini tercatat "hidup tapi tidak bisa dipantau" — 97 pelanggan
 * dan 28 ODP menggantung tanpa OLT. Pada 17 Agustus 2026 alamatnya ditemukan
 * (192.168.100.10:1023, mengikuti pola 1023/1024/1025 → .10/.11/.12 dan
 * dibuktikan dengan pindai), kredensial root yang sama berlaku, dan
 * `show ont-info 8 all` mengembalikan empat ONU yang posisinya PERSIS cocok
 * dengan data sistem lama. Yang tidak bisa memang hanya SNMP-nya; CLI-nya
 * terbuka penuh.
 *
 * Idempoten: dijalankan dua kali tidak menggandakan apa pun.
 */
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const terapkan = process.argv.includes("--terapkan");

const HOSTNAME = "192.168.100.10";
const NAMA = "HSGQ-100-Kecicang";
const ENV_KRED = "OLT_KCC_HSGQ_CRED";

async function main() {
  console.log(terapkan ? "═══ DITERAPKAN ═══\n" : "═══ PERIKSA (tidak menulis apa pun) ═══\n");

  const site = await db.networkSite.findFirst({ where: { name: "Kecicang" }, select: { id: true, name: true } });
  if (!site) throw new Error("Site Kecicang tidak ditemukan.");

  const adaDevice = await db.networkDevice.findUnique({ where: { hostname: HOSTNAME }, select: { id: true } });
  console.log(`  site           : ${site.name}`);
  console.log(`  NetworkDevice  : ${adaDevice ? "sudah ada" : "AKAN DIBUAT"} (${HOSTNAME})`);
  console.log(`  OltDevice      : ${NAMA} · telnet 1023 · kredensial → ${ENV_KRED}`);
  console.log(`  PonPort        : 8 port (slot 1, port 1–8) — G008 berport delapan`);
  console.log(`  SNMP           : TIDAK — model ini memang tidak mendukungnya; kolomnya dibiarkan null`);

  if (!terapkan) return;

  const device = await db.networkDevice.upsert({
    where: { hostname: HOSTNAME },
    update: {},
    create: {
      hostname: HOSTNAME,
      deviceType: "OLT",
      vendor: "HSGQ",
      model: "HSGQ-G008",
      managementIp: HOSTNAME,
      siteId: site.id,
      status: "ACTIVE",
      notes:
        "Didaftarkan manual 17 Agustus 2026 — TIDAK lewat LibreNMS, sebab model ini tidak mendukung SNMP. " +
        "Ditemukan di 192.168.100.10:1023 (pola port 1023/1024/1025 → .10/.11/.12, dibuktikan dengan pindai). " +
        "Dibaca lewat CLI telnet, baca-saja.",
    },
    select: { id: true },
  });

  const olt = await db.oltDevice.upsert({
    where: { networkDeviceId: device.id },
    update: { name: NAMA, telnetPort: 1023, credentialRef: ENV_KRED },
    create: {
      networkDeviceId: device.id,
      name: NAMA,
      vendor: "HSGQ",
      model: "HSGQ-G008",
      managementIp: HOSTNAME,
      telnetPort: 1023,
      snmpPort: null,
      credentialRef: ENV_KRED,
      notes: "Nama di sistem lama: HSGQ-100-Kecicang. Tanpa SNMP — telemetri lewat CLI.",
    },
    select: { id: true },
  });

  let ponBaru = 0;
  for (let port = 1; port <= 8; port++) {
    const ada = await db.ponPort.findUnique({
      where: { oltId_slot_port: { oltId: olt.id, slot: 1, port } },
      select: { id: true },
    });
    if (!ada) {
      await db.ponPort.create({ data: { oltId: olt.id, slot: 1, port, label: `PON${port}` } });
      ponBaru++;
    }
  }

  const user = await db.user.findFirstOrThrow({ where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
  await logAudit({
    userId: user.id,
    action: "OLT_REGISTER_MANUAL",
    module: "noc",
    entityType: "OltDevice",
    entityId: olt.id,
    description:
      `Mendaftarkan ${NAMA} (${HOSTNAME}) manual — model tanpa SNMP, dibaca lewat CLI. ` +
      `${ponBaru} port PON dibuat. Menulis ke basis data CRM saja; perangkatnya tidak disentuh.`,
  });
  console.log(`\nSelesai — perangkat terdaftar, ${ponBaru} port PON dibuat.`);
  console.log("Lanjutkan dengan: npx tsx scripts/_taut-pon.ts --terapkan  (menautkan 28 ODP-nya)");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
