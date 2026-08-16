// ── Menautkan ODP ke port PON-nya (Fase 82) ─────────────────────
//
// Aturan bacanya ada di `odp-pon.ts` dan sudah diuji tanpa basis data.
//
// Dua pekerjaan, dan urutannya tidak boleh dibalik:
//
//  1. `rapikanPonPort` — membetulkan slot dan port yang tersimpan. Fase 81
//     tidak mengenali penamaan `gpon_olt-1/16/1` pada ZTE C600, sehingga dua
//     slot fisik (16 dan 17) tersimpan sebagai satu slot bernomor 1–32.
//     Labelnya benar, kolomnya tidak.
//
//  2. `terapkanTautanPon` — menjodohkan tiap ODP ke port PON yang disebut
//     catatannya. Ini mustahil dikerjakan sebelum langkah 1: berkas ODP
//     menyebut `PIU: 1/16/9`, dan slot 16 belum ada selama masih tertumpuk.

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { susunPon } from "@/lib/olt-import";
import { susunTautan, type PetaOltOdp, type TautanOdp } from "@/lib/odp-pon";

// ── 1. Merapikan port PON ───────────────────────────────────────

export interface HasilRapi {
  diperiksa: number;
  dibuat: number;
  diperbaiki: { olt: string; dari: string; ke: string; label: string }[];
  /** Baris usang yang TIDAK bisa dihapus karena masih ditunjuk ODP. */
  tertahan: { olt: string; slotPort: string; odp: number }[];
  dihapus: number;
}

const PON_LAJU_MIN = 2_400_000_000;
const PON_LAJU_MAKS = 2_600_000_000;

/**
 * Menyusun ulang seluruh port PON dari `NetworkPort` yang tersinkron.
 *
 * Baris usang dihapus HANYA kalau tidak ada ODP yang menunjuknya. Yang masih
 * ditunjuk dilaporkan, bukan dihapus paksa — memutus tautan ODP diam-diam
 * berarti ODP hilang dari peta tanpa ada yang tahu sebabnya.
 */
export async function rapikanPonPort(userId?: string): Promise<HasilRapi> {
  const out: HasilRapi = { diperiksa: 0, dibuat: 0, diperbaiki: [], tertahan: [], dihapus: 0 };

  const olts = await db.oltDevice.findMany({
    select: {
      id: true,
      name: true,
      networkDevice: { select: { id: true, hostname: true } },
      ponPorts: { select: { id: true, slot: true, port: true, label: true, _count: { select: { odps: true } } } },
    },
  });

  for (const olt of olts) {
    const nama = olt.name ?? olt.networkDevice.hostname;
    const ports = await db.networkPort.findMany({
      where: { deviceId: olt.networkDevice.id },
      select: { ifName: true, ifType: true, ifSpeedBps: true },
      orderBy: { librenmsPortId: "asc" },
    });
    const pon = ports.filter(
      (p) =>
        /^gpon/i.test(p.ifName) ||
        /^pon\d+$/i.test(p.ifName) ||
        (p.ifType === "other" &&
          p.ifSpeedBps !== null &&
          Number(p.ifSpeedBps) >= PON_LAJU_MIN &&
          Number(p.ifSpeedBps) <= PON_LAJU_MAKS)
    );
    const { pon: rapi } = susunPon(pon.map((p, i) => ({ ifName: p.ifName, urutan: i + 1 })));
    out.diperiksa += rapi.length;

    // Yang lama dikenali lewat LABEL, sebab label itulah yang tidak pernah
    // salah — ia disalin apa adanya dari perangkatnya.
    const perLabel = new Map(olt.ponPorts.map((p) => [p.label, p]));
    const benar = new Set(rapi.map((r) => `${r.slot}/${r.port}`));

    for (const r of rapi) {
      const lama = perLabel.get(r.label);
      if (lama && (lama.slot !== r.slot || lama.port !== r.port)) {
        out.diperbaiki.push({
          olt: nama,
          dari: `${lama.slot}/${lama.port}`,
          ke: `${r.slot}/${r.port}`,
          label: r.label,
        });
      }
      const sebelum = await db.ponPort.findUnique({
        where: { oltId_slot_port: { oltId: olt.id, slot: r.slot, port: r.port } },
        select: { id: true },
      });
      await db.ponPort.upsert({
        where: { oltId_slot_port: { oltId: olt.id, slot: r.slot, port: r.port } },
        update: { label: r.label },
        create: { oltId: olt.id, slot: r.slot, port: r.port, label: r.label },
      });
      if (!sebelum) out.dibuat++;
    }

    for (const p of olt.ponPorts) {
      if (benar.has(`${p.slot}/${p.port}`)) continue;
      if (p._count.odps > 0) {
        out.tertahan.push({ olt: nama, slotPort: `${p.slot}/${p.port}`, odp: p._count.odps });
        continue;
      }
      await db.ponPort.delete({ where: { id: p.id } });
      out.dihapus++;
    }
  }

  if (userId) {
    await logAudit({
      userId,
      action: "PON_PORT_REBUILD",
      module: "noc",
      entityType: "PonPort",
      description:
        `Merapikan port PON: ${out.diperiksa} diperiksa, ${out.dibuat} dibuat, ` +
        `${out.diperbaiki.length} slot/port dibetulkan, ${out.dihapus} usang dihapus, ` +
        `${out.tertahan.length} tertahan karena masih ditunjuk ODP.`,
    });
  }
  return out;
}

// ── 2. Menautkan ODP ────────────────────────────────────────────

export interface RencanaTautan {
  tautan: TautanOdp[];
  ringkas: { siap: number; tolak: number };
  /** Alasan penolakan, dikelompokkan supaya lubangnya terbaca sekali lihat. */
  alasan: Record<string, number>;
  /** ODP yang port PON-nya belum ada di CRM meski OLT-nya dikenal. */
  portHilang: { odp: string; olt: string; slotPort: string }[];
  /**
   * ODP yang catatannya menyebut OLT berbeda dari yang disebut MAYORITAS
   * penghuninya. Dilaporkan saja — catatan ODP tetap yang dipakai.
   */
  bedaDenganPelanggan: { odp: string; catatan: string; pelanggan: string; setuju: number; beda: number }[];
}

export async function periksaTautanPon(
  peta: PetaOltOdp,
  oltPerPelanggan: Record<string, string> = {},
  /** Nama OLT sistem lama → nama pada catatan ODP, untuk pemeriksaan silang. */
  samaDengan: Record<string, string> = {}
): Promise<RencanaTautan> {
  const odps = await db.odp.findMany({
    select: {
      code: true,
      notes: true,
      ports: { select: { subscription: { select: { serviceNumber: true } } } },
    },
    orderBy: { code: "asc" },
  });

  const tautan = susunTautan(odps.map((o) => ({ code: o.code, notes: o.notes })), peta);

  const ponAda = await db.ponPort.findMany({
    select: { slot: true, port: true, olt: { select: { networkDevice: { select: { hostname: true } } } } },
  });
  const kunciPon = new Set(ponAda.map((p) => `${p.olt.networkDevice.hostname}|${p.slot}/${p.port}`));

  const alasan: Record<string, number> = {};
  const portHilang: RencanaTautan["portHilang"] = [];

  for (const t of tautan) {
    if (t.status === "TOLAK") {
      alasan[t.pesan] = (alasan[t.pesan] ?? 0) + 1;
      continue;
    }
    const k = `${t.hostname}|${t.slotPort!.slot}/${t.slotPort!.port}`;
    if (!kunciPon.has(k)) {
      portHilang.push({ odp: t.code, olt: t.olt!, slotPort: `${t.slotPort!.slot}/${t.slotPort!.port}` });
      t.status = "TOLAK";
      t.pesan = `Port PON ${t.slotPort!.slot}/${t.slotPort!.port} belum ada di CRM.`;
      alasan[t.pesan] = (alasan[t.pesan] ?? 0) + 1;
    }
  }

  // ── Pemeriksaan silang terhadap OLT yang disebut pelanggan ────
  const perNama = new Map(Object.entries(samaDengan).map(([lama, catatan]) => [lama, catatan]));
  const bedaDenganPelanggan: RencanaTautan["bedaDenganPelanggan"] = [];
  const perKode = new Map(tautan.map((t) => [t.code, t]));

  for (const o of odps) {
    const t = perKode.get(o.code);
    if (!t?.olt) continue;
    const suara = new Map<string, number>();
    for (const p of o.ports) {
      const n = p.subscription?.serviceNumber;
      const lama = n ? oltPerPelanggan[n] : undefined;
      if (!lama) continue;
      const setara = perNama.get(lama) ?? lama;
      suara.set(setara, (suara.get(setara) ?? 0) + 1);
    }
    if (suara.size === 0) continue;
    const setuju = suara.get(t.olt) ?? 0;
    const beda = [...suara.entries()].filter(([k]) => k !== t.olt);
    if (beda.length === 0) continue;
    bedaDenganPelanggan.push({
      odp: o.code,
      catatan: t.olt,
      pelanggan: beda.map(([k, v]) => `${k} (${v})`).join(", "),
      setuju,
      beda: beda.reduce((s, [, v]) => s + v, 0),
    });
  }

  return {
    tautan,
    ringkas: {
      siap: tautan.filter((t) => t.status === "SIAP").length,
      tolak: tautan.filter((t) => t.status === "TOLAK").length,
    },
    alasan,
    portHilang,
    bedaDenganPelanggan,
  };
}

export interface HasilTautan extends RencanaTautan {
  ditaut: number;
  siteDisambung: number;
}

/**
 * Menerapkan tautan ODP → port PON, berikut site-nya.
 *
 * `siteId` ikut diisi dari site perangkat OLT-nya, sebab keduanya menjawab
 * pertanyaan yang sama dari sumber yang sama — memisahkannya hanya membuka
 * peluang keduanya berbeda.
 */
export async function terapkanTautanPon(
  peta: PetaOltOdp,
  userId: string,
  oltPerPelanggan: Record<string, string> = {},
  samaDengan: Record<string, string> = {}
): Promise<HasilTautan> {
  const rencana = await periksaTautanPon(peta, oltPerPelanggan, samaDengan);

  const ponAda = await db.ponPort.findMany({
    select: {
      id: true,
      slot: true,
      port: true,
      olt: { select: { networkDevice: { select: { hostname: true, siteId: true } } } },
    },
  });
  const perKunci = new Map(
    ponAda.map((p) => [
      `${p.olt.networkDevice.hostname}|${p.slot}/${p.port}`,
      { id: p.id, siteId: p.olt.networkDevice.siteId },
    ])
  );

  let ditaut = 0;
  let siteDisambung = 0;
  for (const t of rencana.tautan) {
    if (t.status !== "SIAP") continue;
    const pon = perKunci.get(`${t.hostname}|${t.slotPort!.slot}/${t.slotPort!.port}`);
    if (!pon) continue;
    const sebelum = await db.odp.findUnique({ where: { code: t.code }, select: { siteId: true } });
    await db.odp.update({
      where: { code: t.code },
      data: { ponPortId: pon.id, siteId: pon.siteId },
    });
    ditaut++;
    if (!sebelum?.siteId) siteDisambung++;
  }

  await logAudit({
    userId,
    action: "ODP_PON_LINK",
    module: "noc",
    entityType: "Odp",
    description:
      `Menautkan ODP ke port PON dari catatan berkasnya: ${ditaut} ODP tertaut, ` +
      `${siteDisambung} di antaranya baru mendapat site; ${rencana.ringkas.tolak} ditolak, ` +
      `${rencana.bedaDenganPelanggan.length} berbeda dengan OLT yang disebut pelanggannya.`,
  });

  return { ...rencana, ditaut, siteDisambung };
}
