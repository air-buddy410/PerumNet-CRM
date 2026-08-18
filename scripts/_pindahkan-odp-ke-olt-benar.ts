/**
 * Fase 92 — memindahkan ODP yang tertaut ke OLT keliru.
 *
 *   npx tsx scripts/_pindahkan-odp-ke-olt-benar.ts
 *   npx tsx scripts/_pindahkan-odp-ke-olt-benar.ts --terapkan
 *
 * Yang diubah HANYA `Odp.ponPortId`. Tidak menyentuh langganan, tidak menyentuh
 * status pelanggan, tidak menerbitkan apa pun, tidak menyentuh ALUS maupun
 * perangkat. Satu baris per ODP.
 *
 * ══ TIGA SYARAT, SEMUANYA HARUS TERPENUHI ══
 *
 * Sebuah ODP hanya dipindahkan bila:
 *
 *   1. **Seragam.** Semua langganannya berposisi gaya vendor yang SAMA, dan
 *      gaya itu berbeda dari vendor OLT yang menaunginya sekarang.
 *   2. **Bulat.** Semua posisi itu menunjuk PON yang SAMA PERSIS. Satu saja
 *      menunjuk PON lain, ODP itu dilewati — karena berarti ODP-nya sendiri
 *      yang perlu dipecah, bukan dipindahkan.
 *   3. **Tujuannya ada.** PON itu benar-benar ada di OLT bervendor yang cocok,
 *      dan hanya di SATU OLT. Kalau dua OLT punya PON berlabel sama, dilewati.
 *
 * Syarat kedua yang paling penting. `SSN 03DC01` punya 15 langganan yang cocok
 * dengan PON-nya dan 1 pencilan; memindahkannya karena pencilan itu akan
 * merusak 15 tautan yang sehat. Syarat ini yang menahannya.
 */
import { db } from "@/lib/db";

const terapkan = process.argv.includes("--terapkan");

type Gaya = "ZTE" | "HSGQ" | "LAIN";

function gayaPosisi(p: string): Gaya {
  if (/^\d+\/\d+\/\d+:\d+$/.test(p.trim())) return "ZTE";
  if (/^\d+:\d+$/.test(p.trim())) return "HSGQ";
  return "LAIN";
}

function gayaVendor(vendor: string): Gaya {
  const v = vendor.trim().toUpperCase();
  if (v.startsWith("ZTE")) return "ZTE";
  if (v.startsWith("HSGQ")) return "HSGQ";
  return "LAIN";
}

/** Bagian PON dari sebuah posisi. ZTE: `1/16/12`. HSGQ: nomor port saja. */
function ponDariPosisi(p: string): { zte?: string; hsgq?: number } | null {
  const z = /^(\d+)\/(\d+)\/(\d+):/.exec(p.trim());
  if (z) return { zte: `${z[1]}/${z[2]}/${z[3]}` };
  const h = /^(\d+):(\d+)$/.exec(p.trim());
  if (h) return { hsgq: Number(h[1]) };
  return null;
}

async function main() {
  console.log(terapkan ? "═══ DITERAPKAN ═══" : "═══ RENCANA SAJA (tambahkan --terapkan) ═══");
  console.log("Yang diubah hanya Odp.ponPortId. Tidak ada langganan, status, atau tagihan yang tersentuh.\n");

  const odps = await db.odp.findMany({
    where: { ponPortId: { not: null } },
    select: {
      id: true,
      code: true,
      ponPort: {
        select: { id: true, label: true, olt: { select: { vendor: true, networkDevice: { select: { hostname: true } } } } },
      },
      ports: {
        select: { subscription: { select: { serviceNumber: true, onuPosition: true } } },
      },
    },
  });

  const olts = await db.oltDevice.findMany({
    select: {
      vendor: true,
      networkDevice: { select: { hostname: true } },
      ponPorts: { select: { id: true, label: true, port: true } },
    },
  });

  let dipindah = 0;
  let dilewati = 0;

  for (const odp of odps) {
    const posisi = odp.ports
      .map((p) => p.subscription?.onuPosition)
      .filter((p): p is string => !!p && gayaPosisi(p) !== "LAIN");
    if (posisi.length === 0) continue;

    const vendorSekarang = gayaVendor(odp.ponPort!.olt.vendor);
    const gaya = new Set(posisi.map(gayaPosisi));

    // Syarat 1 — seragam, dan berbeda dari vendor sekarang.
    if (gaya.size !== 1) continue;
    const gayaOdp = [...gaya][0];
    if (gayaOdp === vendorSekarang) continue;

    const kepala = `ODP ${odp.code} (${posisi.length} langganan) di ${odp.ponPort!.olt.networkDevice.hostname}`;

    // Syarat 2 — semua posisi menunjuk PON yang sama.
    const kunci = new Set(
      posisi.map((p) => {
        const q = ponDariPosisi(p);
        return q?.zte ?? String(q?.hsgq ?? "?");
      })
    );
    if (kunci.size !== 1) {
      console.log(`  – ${kepala}\n      DILEWATI: posisinya menunjuk ${kunci.size} PON berbeda (${[...kunci].join(", ")}).`);
      console.log(`      ODP yang isinya dari beberapa PON perlu DIPECAH, bukan dipindahkan.`);
      dilewati++;
      continue;
    }
    const target = [...kunci][0];

    // Syarat 3 — PON tujuan ada, dan hanya di satu OLT.
    const cocok: { host: string; ponId: string; label: string }[] = [];
    for (const o of olts) {
      if (gayaVendor(o.vendor) !== gayaOdp) continue;
      const pp =
        gayaOdp === "ZTE"
          ? o.ponPorts.find((x) => x.label.includes(target))
          : o.ponPorts.find((x) => x.port === Number(target));
      if (pp) cocok.push({ host: o.networkDevice.hostname, ponId: pp.id, label: pp.label });
    }
    if (cocok.length !== 1) {
      console.log(`  – ${kepala}\n      DILEWATI: PON "${target}" ditemukan di ${cocok.length} OLT (${cocok.map((c) => c.host).join(", ") || "tidak ada"}).`);
      console.log(`      Tujuan yang tidak tunggal berarti tebakan, dan tebakan tidak dipakai di sini.`);
      dilewati++;
      continue;
    }

    const tujuan = cocok[0];
    console.log(`  ${terapkan ? "✓" : "→"} ${kepala}`);
    console.log(`      ${odp.ponPort!.label}  →  ${tujuan.label} di ${tujuan.host}`);

    if (terapkan) {
      await db.odp.update({ where: { id: odp.id }, data: { ponPortId: tujuan.ponId } });
    }
    dipindah++;
  }

  console.log(`\n${dipindah} ODP ${terapkan ? "dipindahkan" : "akan dipindahkan"}, ${dilewati} dilewati.`);
  if (!terapkan && dipindah > 0) {
    console.log("Belum ada yang ditulis. Ulangi dengan --terapkan kalau daftar di atas benar.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
