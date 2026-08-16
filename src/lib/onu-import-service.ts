// ── Menyimpan posisi ONU + memeriksa silang tautan PON (Fase 83) ─
//
// Aturan bacanya ada di `onu-import.ts` dan sudah diuji tanpa basis data.
//
// YANG MEMBUAT BERKAS INI ADA bukan penyimpanannya — itu dua kolom — melainkan
// PEMERIKSAAN SILANGNYA.
//
// Fase 82 menautkan tiap ODP ke port PON-nya dari PIU yang tertulis di berkas
// ODP. Tidak ada cara memastikan tulisan itu benar; satu-satunya pembanding
// waktu itu adalah OLT yang disebut pelanggan, dan itu pun catatan tertulis.
//
// Posisi ONU berbeda jenisnya: ia DIBACA DARI PERANGKAT. Jadi menyandingkannya
// dengan tautan Fase 82 memberi ujian yang sungguhan — dua jalur bebas menuju
// port PON yang sama.
//
// Yang berselisih TIDAK dipakai mengubah tautan ODP. Alasannya bukan karena
// pembacaan perangkat kurang dipercaya — justru sebaliknya — melainkan karena
// memindahkan ODP menyentuh SELURUH penghuninya sekaligus, sedangkan yang
// diketahui di sini cuma sebagian. Itu keputusan lapangan, dan tugas berkas
// ini adalah menyerahkan buktinya dalam bentuk yang bisa ditindak.

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { bersihkanOnu, type OnuMasuk, type OnuBersih } from "@/lib/onu-import";

export interface SelisihOnu {
  odp: string;
  /** Port PON menurut tautan ODP (Fase 82). */
  ponOdp: string;
  olt: string;
  /** Port PON menurut posisi ONU penghuninya, beserta jumlah suaranya. */
  ponOnu: { slotPort: string; jumlah: number }[];
  pelanggan: string[];
}

export interface RencanaOnu {
  baris: OnuBersih[];
  ringkas: { siap: number; tolak: number; takDikenal: number };
  alasan: Record<string, number>;
  /** Berapa pelanggan posisinya SEPAKAT dengan tautan PON ODP-nya. */
  sepakat: number;
  /** ODP yang tautan PON-nya berselisih dengan posisi ONU penghuninya. */
  selisih: SelisihOnu[];
  /** Pelanggan yang ODP-nya belum bertaut PON — tidak bisa diperiksa silang. */
  takTerperiksa: number;
}

export async function periksaOnu(rows: OnuMasuk[]): Promise<RencanaOnu> {
  const bersih = bersihkanOnu(rows);

  const subs = await db.subscription.findMany({
    select: {
      serviceNumber: true,
      odpPort: {
        select: {
          odp: {
            select: {
              code: true,
              ponPort: {
                select: {
                  slot: true,
                  port: true,
                  olt: { select: { name: true, networkDevice: { select: { hostname: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });
  const perNomor = new Map(subs.map((s) => [kunci(s.serviceNumber), s]));

  const alasan: Record<string, number> = {};
  let takDikenal = 0;
  let sepakat = 0;
  let takTerperiksa = 0;

  /** ODP → suara posisi ONU penghuninya yang BERBEDA dari tautan ODP. */
  const beda = new Map<string, { ponOdp: string; olt: string; suara: Map<string, string[]> }>();

  for (const b of bersih) {
    if (b.status === "TOLAK") {
      alasan[b.pesan.replace(/"[^"]*"/, '"…"')] = (alasan[b.pesan.replace(/"[^"]*"/, '"…"')] ?? 0) + 1;
      continue;
    }
    const s = perNomor.get(kunci(b.serviceNumber));
    if (!s) {
      takDikenal++;
      continue;
    }
    const odp = s.odpPort?.odp;
    const pon = odp?.ponPort;
    if (!odp || !pon) {
      takTerperiksa++;
      continue;
    }
    const dariOdp = `${pon.slot}/${pon.port}`;
    const dariOnu = `${b.terurai!.slot}/${b.terurai!.port}`;
    if (dariOdp === dariOnu) {
      sepakat++;
      continue;
    }
    const nama = pon.olt.name ?? pon.olt.networkDevice.hostname;
    const e = beda.get(odp.code) ?? { ponOdp: dariOdp, olt: nama, suara: new Map<string, string[]>() };
    e.suara.set(dariOnu, [...(e.suara.get(dariOnu) ?? []), b.serviceNumber]);
    beda.set(odp.code, e);
  }

  const selisih: SelisihOnu[] = [...beda.entries()]
    .map(([odp, e]) => ({
      odp,
      ponOdp: e.ponOdp,
      olt: e.olt,
      ponOnu: [...e.suara.entries()]
        .map(([slotPort, l]) => ({ slotPort, jumlah: l.length }))
        .sort((a, b) => b.jumlah - a.jumlah),
      pelanggan: [...e.suara.values()].flat(),
    }))
    .sort((a, b) => b.pelanggan.length - a.pelanggan.length);

  return {
    baris: bersih,
    ringkas: {
      siap: bersih.filter((b) => b.status === "SIAP").length,
      tolak: bersih.filter((b) => b.status === "TOLAK").length,
      takDikenal,
    },
    alasan,
    sepakat,
    selisih,
    takTerperiksa,
  };
}

export interface HasilOnu extends RencanaOnu {
  disimpan: number;
}

/**
 * Menyimpan posisi ONU pada langganan yang bersangkutan.
 *
 * Yang DITOLAK tidak menghapus nilai lama: `undefined` pada Prisma berarti
 * jangan sentuh. Berkas ekspor yang kebetulan kosong kolomnya karena itu tidak
 * bisa mengosongkan data yang sudah benar — pelajaran yang sama seperti impor
 * identitas.
 */
export async function terapkanOnu(rows: OnuMasuk[], userId: string): Promise<HasilOnu> {
  const rencana = await periksaOnu(rows);

  const subs = await db.subscription.findMany({ select: { id: true, serviceNumber: true } });
  const perNomor = new Map(subs.map((s) => [kunci(s.serviceNumber), s.id]));

  let disimpan = 0;
  for (const b of rencana.baris) {
    if (b.status !== "SIAP") continue;
    const id = perNomor.get(kunci(b.serviceNumber));
    if (!id) continue;
    await db.subscription.update({
      where: { id },
      data: { onuPosition: b.posisi, onuIndex: b.terurai!.index },
    });
    disimpan++;
  }

  await logAudit({
    userId,
    action: "ONU_POSITION_IMPORT",
    module: "noc",
    entityType: "Subscription",
    description:
      `Menyimpan posisi ONU dari sistem lama: ${disimpan} langganan. ` +
      `Pemeriksaan silang terhadap tautan PON Fase 82: ${rencana.sepakat} sepakat, ` +
      `${rencana.selisih.length} ODP berselisih, ${rencana.takTerperiksa} tak terperiksa.`,
  });

  return { ...rencana, disimpan };
}

function kunci(n: string): string {
  return n.replace(/\s+/g, "").toUpperCase();
}
