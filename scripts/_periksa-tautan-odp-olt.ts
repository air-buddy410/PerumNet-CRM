/**
 * Fase 92 — memeriksa ODP yang tertaut ke OLT keliru.
 *
 *   npx tsx scripts/_periksa-tautan-odp-olt.ts
 *
 * HANYA MEMBACA. Tidak menulis apa pun, dan tidak ada bendera untuk membuatnya
 * menulis — perbaikannya menyentuh `Odp.ponPortId`, dan satu ODP memindahkan
 * belasan pelanggan sekaligus. Alat pemeriksa dan alat pengubah sengaja
 * dipisah supaya tidak ada yang tidak sengaja menjalankan yang kedua.
 *
 * ══ CARA MENGENALI KEKELIRUANNYA ══
 *
 * `Subscription.onuPosition` disimpan APA ADANYA dari sistem lama, dan
 * bentuknya menunjukkan vendor:
 *
 *   ZTE  → `slot/pon/onu:idx`   mis. `1/16/12:8`
 *   HSGQ → `pon:idx`            mis. `6:75`
 *
 * Kalau bentuk posisi tidak cocok dengan vendor OLT yang menaunginya, salah
 * satunya keliru. Diperiksa silang ke ALUS pada 18 Agustus 2026: yang keliru
 * adalah TAUTANNYA, bukan posisinya — ALUS mencatat pelanggan itu di OLT lain,
 * dan posisinya sah untuk OLT tersebut.
 *
 * Dua OLT Kecicang (HSGQ dan ZTE C600) berbagi site yang sama. Itu penjelasan
 * yang paling mungkin untuk tertukarnya.
 */
import { db } from "@/lib/db";

type Gaya = "ZTE" | "HSGQ" | "LAIN";

function gayaPosisi(p: string | null): Gaya {
  if (!p) return "LAIN";
  if (/^\d+\/\d+\/\d+:\d+$/.test(p.trim())) return "ZTE";
  if (/^\d+:\d+$/.test(p.trim())) return "HSGQ";
  return "LAIN";
}

/** Vendor OLT dinormalkan ke gaya posisi yang seharusnya ia pakai. */
function gayaVendor(vendor: string): Gaya {
  const v = vendor.trim().toUpperCase();
  if (v.startsWith("ZTE")) return "ZTE";
  if (v.startsWith("HSGQ")) return "HSGQ";
  return "LAIN";
}

async function main() {
  console.log("═══ PEMERIKSAAN TAUTAN ODP → OLT ═══");
  console.log("Hanya membaca. Tidak ada yang diubah.\n");

  const subs = await db.subscription.findMany({
    where: { onuPosition: { not: null } },
    select: {
      serviceNumber: true,
      onuPosition: true,
      odpPort: {
        select: {
          odp: {
            select: {
              id: true,
              code: true,
              ponPort: {
                select: {
                  id: true,
                  label: true,
                  slot: true,
                  port: true,
                  olt: {
                    select: {
                      id: true,
                      vendor: true,
                      networkDevice: { select: { hostname: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Kumpulkan per ODP: ODP-lah yang berpindah, bukan langganan satu per satu.
  interface Kelompok {
    odpId: string;
    odpCode: string;
    oltSekarang: string;
    vendorSekarang: string;
    gayaSeharusnya: Gaya;
    contohPosisi: string[];
    jumlah: number;
  }
  const perOdp = new Map<string, Kelompok>();
  let tanpaPon = 0;

  for (const s of subs) {
    const odp = s.odpPort?.odp;
    if (!odp) continue;
    if (!odp.ponPort) {
      tanpaPon++;
      continue;
    }
    const vendor = odp.ponPort.olt.vendor;
    const seharusnya = gayaPosisi(s.onuPosition);
    if (seharusnya === "LAIN") continue;
    if (seharusnya === gayaVendor(vendor)) continue;

    const k = perOdp.get(odp.id) ?? {
      odpId: odp.id,
      odpCode: odp.code,
      oltSekarang: odp.ponPort.olt.networkDevice.hostname,
      vendorSekarang: vendor,
      gayaSeharusnya: seharusnya,
      contohPosisi: [],
      jumlah: 0,
    };
    k.jumlah++;
    if (k.contohPosisi.length < 3) k.contohPosisi.push(s.onuPosition!);
    perOdp.set(odp.id, k);
  }

  const kelompok = [...perOdp.values()].sort((a, b) => b.jumlah - a.jumlah);
  const totalLangganan = kelompok.reduce((n, k) => n + k.jumlah, 0);

  console.log(`Langganan berposisi     : ${subs.length}`);
  console.log(`ODP tanpa PON port      : ${tanpaPon}`);
  console.log(`ODP bertautan keliru    : ${kelompok.length}`);
  console.log(`Langganan yang terdampak: ${totalLangganan}\n`);

  // OLT calon tujuan, per vendor — untuk menawarkan ke mana ODP itu semestinya.
  const olts = await db.oltDevice.findMany({
    select: {
      id: true,
      vendor: true,
      networkDevice: { select: { hostname: true, siteId: true } },
      ponPorts: { select: { id: true, label: true, slot: true, port: true } },
    },
  });

  for (const k of kelompok) {
    console.log(`── ODP ${k.odpCode} — ${k.jumlah} langganan ──`);
    console.log(`   sekarang tertaut : ${k.oltSekarang} (${k.vendorSekarang})`);
    console.log(`   posisi bergaya   : ${k.gayaSeharusnya}  contoh: ${k.contohPosisi.join(", ")}`);

    const calon = olts.filter((o) => gayaVendor(o.vendor) === k.gayaSeharusnya);
    if (calon.length === 0) {
      console.log(`   ✗ tidak ada OLT bervendor ${k.gayaSeharusnya} sama sekali.`);
    } else {
      for (const o of calon) {
        // Untuk ZTE, posisi `slot/pon/onu:idx` → PON yang dicari adalah
        // slot/pon-nya. Dicocokkan ke label PonPort apa adanya.
        const cocok = k.contohPosisi.map((p) => {
          const m = /^(\d+)\/(\d+)\/(\d+):/.exec(p);
          if (!m) return null;
          const cari = `${m[1]}/${m[2]}/${m[3]}`;
          return o.ponPorts.find((pp) => pp.label.includes(cari)) ?? null;
        });
        const ada = cocok.filter(Boolean).length;
        console.log(
          `   calon: ${o.networkDevice.hostname.padEnd(16)} ${o.vendor.padEnd(6)} ` +
            `PON cocok untuk contoh: ${ada}/${k.contohPosisi.length}`
        );
      }
    }
    console.log();
  }

  if (kelompok.length === 0) {
    console.log("Tidak ada tautan yang keliru. Tidak ada yang perlu dikerjakan.");
  } else {
    console.log(
      "Skrip ini TIDAK memperbaiki apa pun. Perbaikannya menyentuh Odp.ponPortId\n" +
        "dan memindahkan banyak pelanggan sekaligus — perlu diputuskan orang dulu."
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
