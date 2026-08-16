// ── Menulis lapisan OLT dan port PON (Fase 81) ──────────────────
//
// Aturan bacanya ada di `olt-import.ts` dan sudah diuji tanpa basis data.
//
// Tiga hal yang menentukan bentuk berkas ini:
//
//  1. `OltDevice` MENSPESIALISASI `NetworkDevice` — ia tidak berdiri sendiri.
//     Jadi tiap OLT sistem lama harus dijodohkan dengan perangkat yang sudah
//     ditarik LibreNMS, bukan dibuat baru. Enam lawan enam, tetapi namanya
//     berbeda sama sekali: LibreNMS mengenal `192.168.100.12`, sistem lama
//     mengenal `HSGQ-102-SerayaTengah`. Yang menjodohkan manusia, lewat peta
//     yang diberikan sebagai masukan.
//
//  2. Port PON diambil dari `NetworkPort` yang SUDAH tersinkron, bukan dari
//     sistem lama. LibreNMS membacanya langsung dari perangkatnya, dan itu
//     sumber yang lebih dekat ke kenyataan daripada catatan siapa pun.
//
//  3. ODP ditautkan ke OLT lewat PELANGGANNYA, bukan lewat teks. Sistem lama
//     menyebut OLT pada tiap pelanggan; basis data kita tahu port ODP tiap
//     pelanggan. Menjodohkan keduanya memberi ODP → OLT tanpa mengurai satu
//     kalimat pun.

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { bersihkanOlt, susunPon, type OltMasuk } from "@/lib/olt-import";

export interface RencanaOlt {
  olt: { nama: string; perangkat: string | null; status: "SIAP" | "LEWAT" | "TOLAK"; pesan: string }[];
  ponPerOlt: Record<string, number>;
  /** ODP → OLT yang bisa disimpulkan dari pelanggannya. */
  odpTertaut: number;
  odpBentrok: { odp: string; olt: string[] }[];
  masalah: string[];
}

/** Peta nama OLT sistem lama → hostname perangkat di CRM. */
export type PetaPerangkat = Record<string, string>;

export async function periksaOlt(
  daftar: OltMasuk[],
  peta: PetaPerangkat,
  oltPerPelanggan: Record<string, string>
): Promise<RencanaOlt> {
  const out: RencanaOlt = { olt: [], ponPerOlt: {}, odpTertaut: 0, odpBentrok: [], masalah: [] };

  const perangkat = await db.networkDevice.findMany({
    select: { id: true, hostname: true, oltDevice: { select: { id: true } } },
  });
  const perHostname = new Map(perangkat.map((d) => [d.hostname.toLowerCase(), d]));

  for (const m of daftar) {
    const { bersih, masalah } = bersihkanOlt(m);
    for (const p of masalah) out.masalah.push(`${bersih.nama}: ${p}`);

    const hostname = peta[bersih.nama];
    if (!hostname) {
      out.olt.push({ nama: bersih.nama, perangkat: null, status: "TOLAK", pesan: "Belum dijodohkan dengan perangkat mana pun." });
      continue;
    }
    const d = perHostname.get(hostname.toLowerCase());
    if (!d) {
      out.olt.push({ nama: bersih.nama, perangkat: hostname, status: "TOLAK", pesan: `Perangkat "${hostname}" tidak ada di CRM.` });
      continue;
    }
    if (d.oltDevice) {
      out.olt.push({ nama: bersih.nama, perangkat: hostname, status: "LEWAT", pesan: "Sudah punya lapisan OLT." });
    } else {
      out.olt.push({ nama: bersih.nama, perangkat: hostname, status: "SIAP", pesan: `${bersih.vendor} ${bersih.model ?? ""}`.trim() });
    }

    const ports = await db.networkPort.findMany({
      where: { deviceId: d.id },
      select: { ifName: true, librenmsPortId: true, ifType: true, ifSpeedBps: true },
      orderBy: { librenmsPortId: "asc" },
    });
    // Port PON dikenali dengan aturan yang sama seperti tampilan port jaringan:
    // nama gpon, atau `other` berkecepatan laju hilir GPON.
    const pon = ports.filter(
      (p) =>
        /^gpon/i.test(p.ifName) ||
        /^pon\d+$/i.test(p.ifName) ||
        (p.ifType === "other" &&
          p.ifSpeedBps !== null &&
          Number(p.ifSpeedBps) >= 2_400_000_000 &&
          Number(p.ifSpeedBps) <= 2_600_000_000)
    );
    const { pon: rapi, masalah: mp } = susunPon(pon.map((p, i) => ({ ifName: p.ifName, urutan: i + 1 })));
    out.ponPerOlt[bersih.nama] = rapi.length;
    for (const x of mp) out.masalah.push(`${bersih.nama}: ${x}`);
  }

  // ── ODP → OLT lewat pelanggannya ──────────────────────────────
  const subs = await db.subscription.findMany({
    where: { odpPort: { isNot: null } },
    select: { serviceNumber: true, odpPort: { select: { odp: { select: { code: true } } } } },
  });
  const perOdp = new Map<string, Set<string>>();
  for (const s of subs) {
    const olt = oltPerPelanggan[s.serviceNumber];
    const kode = s.odpPort?.odp.code;
    if (!olt || !kode) continue;
    const set = perOdp.get(kode) ?? new Set<string>();
    set.add(olt);
    perOdp.set(kode, set);
  }
  for (const [kode, oltSet] of perOdp) {
    if (oltSet.size === 1) out.odpTertaut++;
    // Satu ODP disuapi dua OLT berbeda menurut pelanggannya. Itu tidak mungkin
    // secara fisik, jadi salah satu catatan pelanggannya keliru — dilaporkan,
    // tidak dipilih salah satu.
    else out.odpBentrok.push({ odp: kode, olt: [...oltSet].sort() });
  }

  return out;
}

export interface HasilOlt extends RencanaOlt {
  oltDibuat: number;
  ponDibuat: number;
  odpDisambung: number;
}

export async function terapkanOlt(
  daftar: OltMasuk[],
  peta: PetaPerangkat,
  oltPerPelanggan: Record<string, string>,
  userId: string
): Promise<HasilOlt> {
  const rencana = await periksaOlt(daftar, peta, oltPerPelanggan);

  const perangkat = await db.networkDevice.findMany({
    select: { id: true, hostname: true, oltDevice: { select: { id: true } } },
  });
  const perHostname = new Map(perangkat.map((d) => [d.hostname.toLowerCase(), d]));

  let oltDibuat = 0;
  let ponDibuat = 0;
  /** nama OLT sistem lama → id OltDevice, untuk menyambung ODP sesudahnya. */
  const idOlt = new Map<string, string>();

  for (const m of daftar) {
    const { bersih } = bersihkanOlt(m);
    const hostname = peta[bersih.nama];
    const d = hostname ? perHostname.get(hostname.toLowerCase()) : undefined;
    if (!d) continue;

    const olt = await db.oltDevice.upsert({
      where: { networkDeviceId: d.id },
      update: {
        vendor: bersih.vendor,
        model: bersih.model,
        managementIp: bersih.managementIp,
        telnetPort: bersih.telnetPort,
        snmpPort: bersih.snmpPort,
        // Community SNMP TIDAK disimpan. Kolom ini memang untuk nama env var.
        credentialRef: "LIBRENMS_API_TOKEN",
        notes: `Nama di sistem lama: ${bersih.nama}`,
      },
      create: {
        networkDeviceId: d.id,
        vendor: bersih.vendor,
        model: bersih.model,
        managementIp: bersih.managementIp,
        telnetPort: bersih.telnetPort,
        snmpPort: bersih.snmpPort,
        credentialRef: "LIBRENMS_API_TOKEN",
        notes: `Nama di sistem lama: ${bersih.nama}`,
      },
      select: { id: true },
    });
    if (!d.oltDevice) oltDibuat++;
    idOlt.set(bersih.nama, olt.id);

    const ports = await db.networkPort.findMany({
      where: { deviceId: d.id },
      select: { ifName: true, ifType: true, ifSpeedBps: true },
      orderBy: { librenmsPortId: "asc" },
    });
    const pon = ports.filter(
      (p) =>
        /^gpon/i.test(p.ifName) ||
        /^pon\d+$/i.test(p.ifName) ||
        (p.ifType === "other" &&
          p.ifSpeedBps !== null &&
          Number(p.ifSpeedBps) >= 2_400_000_000 &&
          Number(p.ifSpeedBps) <= 2_600_000_000)
    );
    const { pon: rapi } = susunPon(pon.map((p, i) => ({ ifName: p.ifName, urutan: i + 1 })));
    for (const r of rapi) {
      await db.ponPort.upsert({
        where: { oltId_slot_port: { oltId: olt.id, slot: r.slot, port: r.port } },
        update: { label: r.label },
        create: { oltId: olt.id, slot: r.slot, port: r.port, label: r.label },
      });
      ponDibuat++;
    }
  }

  // ── Menyambung ODP ke site OLT-nya ────────────────────────────
  //
  // ODP ditautkan ke SITE, bukan ke port PON: sistem lama menyebut OLT-nya,
  // bukan port keberapa. Menebak portnya berarti mengarang jalur serat.
  const subs = await db.subscription.findMany({
    where: { odpPort: { isNot: null } },
    select: { serviceNumber: true, odpPort: { select: { odp: { select: { id: true, code: true, siteId: true } } } } },
  });
  const perOdp = new Map<string, { id: string; siteId: string | null; olt: Set<string> }>();
  for (const s of subs) {
    const olt = oltPerPelanggan[s.serviceNumber];
    const o = s.odpPort?.odp;
    if (!olt || !o) continue;
    const e = perOdp.get(o.code) ?? { id: o.id, siteId: o.siteId, olt: new Set<string>() };
    e.olt.add(olt);
    perOdp.set(o.code, e);
  }

  const siteDevice = await db.networkDevice.findMany({ select: { hostname: true, siteId: true } });
  const sitePerHostname = new Map(siteDevice.map((d) => [d.hostname.toLowerCase(), d.siteId]));

  let odpDisambung = 0;
  for (const [, e] of perOdp) {
    if (e.olt.size !== 1 || e.siteId) continue;
    const namaOlt = [...e.olt][0];
    const hostname = peta[namaOlt];
    const siteId = hostname ? sitePerHostname.get(hostname.toLowerCase()) : null;
    if (!siteId) continue;
    await db.odp.update({ where: { id: e.id }, data: { siteId } });
    odpDisambung++;
  }

  await logAudit({
    userId,
    action: "OLT_LAYER_IMPORT",
    module: "noc",
    entityType: "OltDevice",
    description:
      `Membangun lapisan OLT: ${oltDibuat} OLT, ${ponDibuat} port PON, ` +
      `${odpDisambung} ODP disambung ke site; ${rencana.odpBentrok.length} ODP bentrok OLT.`,
  });

  return { ...rencana, oltDibuat, ponDibuat, odpDisambung };
}
