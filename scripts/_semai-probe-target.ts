/**
 * Menyemai target probe dari perangkat yang sudah terdaftar.
 *
 *   npx tsx scripts/_semai-probe-target.ts
 *   npx tsx scripts/_semai-probe-target.ts --terapkan
 *
 * `/noc/probe` kosong bukan karena fiturnya belum ada — `runProbe`,
 * `runDueProbes`, dan `pruneProbeResults` sudah lengkap di `src/lib/probe.ts`.
 * Yang kosong hanya daftar targetnya.
 *
 * ══ KENAPA PORT TELNET, BUKAN 443 ══
 *
 * Bawaan model adalah TCP/443, tetapi tidak satu pun perangkat kita melayani
 * HTTPS. Yang PASTI terbuka adalah port telnet — kita memakainya setiap kali
 * membaca daya optik, dan keenamnya terbukti menjawab hari ini.
 *
 * Probe TCP hanya membuka koneksi lalu menutupnya. Tidak ada nama pengguna,
 * tidak ada sandi, tidak ada perintah — jadi ia tidak muncul sebagai percobaan
 * login gagal di perangkat.
 *
 * ══ YANG SENGAJA TIDAK DISEMAI ══
 *
 * Alamat `172.30.10.6` TIDAK dipakai meski tercatat sebagai `managementIp`
 * lima OLT. Itu port forwarding milik ALUS, dan memeriksanya tiap menit berarti
 * menaruh beban tetap pada infrastruktur pihak lain. Perangkatnya sendiri
 * terjangkau langsung di `192.168.100.x` — itu yang dipakai pembaca optik, dan
 * itu yang dipakai di sini.
 */
import { db } from "@/lib/db";

const terapkan = process.argv.includes("--terapkan");

/** Port MikroTik API bila `managementUrl` tidak menyebutkannya. */
const PORT_MIKROTIK_BAWAAN = 8728;

/**
 * Alamat yang dipakai probe.
 *
 * `hostname` OLT kebetulan berupa IP langsung (`192.168.100.x`) dan itu yang
 * kita inginkan. Tetapi router bernama `PRM_NAGABASUKIH_D` — sebuah NAMA, yang
 * tidak akan pernah ter-resolve dari container. Dry-run pertama menangkap ini;
 * tanpa pemeriksaan di bawah, target router akan dibuat dan gagal selamanya,
 * lalu menaikkan alarm palsu tiap menit.
 *
 * `managementIp` TIDAK dipakai untuk OLT dengan sengaja: kelimanya bernilai
 * 172.30.10.6, jalur milik ALUS.
 */
function alamatProbe(hostname: string, managementIp: string | null): string | null {
  const mirip = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname.trim());
  if (mirip) return hostname.trim();
  return managementIp?.trim() || null;
}

function portDariUrl(url: string | null | undefined): number | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.port) return Number(u.port);
    return u.protocol === "https:" ? 443 : 80;
  } catch {
    return null;
  }
}

async function main() {
  console.log(terapkan ? "═══ DITERAPKAN ═══\n" : "═══ RENCANA SAJA (tambahkan --terapkan) ═══\n");

  const perangkat = await db.networkDevice.findMany({
    select: {
      id: true,
      hostname: true,
      deviceType: true,
      siteId: true,
      managementIp: true,
      oltDevice: { select: { telnetPort: true } },
      mikrotikRouter: { select: { managementUrl: true } },
    },
    orderBy: { hostname: "asc" },
  });

  let dibuat = 0;
  let dilewati = 0;

  for (const d of perangkat) {
    const port =
      d.oltDevice?.telnetPort ??
      portDariUrl(d.mikrotikRouter?.managementUrl) ??
      (d.mikrotikRouter ? PORT_MIKROTIK_BAWAAN : null);

    const alamat = alamatProbe(d.hostname, d.managementIp);
    if (!port || !alamat) {
      const sebab = !alamat ? "tidak punya alamat IP yang bisa dihubungi" : "tidak diketahui port mana yang pasti terbuka";
      console.log(`  –  ${d.hostname.padEnd(20)} dilewati: ${sebab}`);
      dilewati++;
      continue;
    }

    const sudah = await db.probeTarget.findFirst({
      where: { networkDeviceId: d.id },
      select: { id: true },
    });
    if (sudah) {
      console.log(`  –  ${d.hostname.padEnd(20)} sudah punya target, TIDAK ditimpa`);
      dilewati++;
      continue;
    }

    console.log(
      `  ${terapkan ? "✓" : "→"}  ${d.hostname.padEnd(20)} ${d.deviceType.padEnd(8)} TCP ${alamat}:${port}`
    );

    if (terapkan) {
      await db.probeTarget.create({
        data: {
          name: d.hostname,
          address: alamat,
          method: "TCP",
          port,
          kind: "DEVICE",
          networkDeviceId: d.id,
          siteId: d.siteId,
          // OLT memutus ratusan pelanggan sekaligus; router memutus semuanya.
          severity: d.deviceType === "ROUTER" ? "CRITICAL" : "MAJOR",
          intervalSec: 60,
          timeoutMs: 3000,
          // Tiga kali gagal beruntun sebelum alarm — satu paket hilang di
          // jaringan ISP itu biasa, dan membangunkan orang karenanya membuat
          // alarm berhenti dipercaya.
          failThreshold: 3,
        },
      });
    }
    dibuat++;
  }

  console.log(`\n${dibuat} target ${terapkan ? "dibuat" : "akan dibuat"}, ${dilewati} dilewati.`);
  if (!terapkan && dibuat > 0) {
    console.log("Belum ada yang ditulis. Ulangi dengan --terapkan kalau daftar di atas benar.");
  }
  if (terapkan && dibuat > 0) {
    console.log("\nJalankan `runDueProbes` lewat penjadwal supaya target ini benar-benar diperiksa.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
