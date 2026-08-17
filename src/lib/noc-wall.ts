// ── Papan dinding NOC (Fase 85) ─────────────────────────────────
//
// Datanya sudah ada seluruhnya; yang belum ada satu bentuk yang muat di layar
// dinding. Berkas ini merangkumnya, dan aturan perangkumannya sendiri yang
// menentukan papan itu berguna atau diabaikan.
//
// KENAPA JARINGAN, BUKAN TIKET. Rencana Fase 85 menyebut TV Wall helpdesk,
// meniru layar `/schedule` sistem lama. Tetapi tabel tiket kita nol baris, dan
// di sistem lama pun nol — dinding tiket berarti televisi yang menampilkan
// "tidak ada tiket" sepanjang hari. Setelah dua hari orang berhenti melihatnya,
// dan ketika akhirnya ada tiket, tidak ada lagi yang menoleh. Yang hidup hari
// ini jaringannya: 1.612 sesi menyala, 21 padam.
//
// Tiket tetap ikut sebagai satu panel — ketika ticketing pindah saat cutover,
// panel itu terisi sendiri tanpa perlu layar baru.

import { db } from "@/lib/db";
import { nilaiKesegaran, lamanya, simpulkan, vonisKesegaran, type Gejala, type Vonis } from "@/lib/system-status";

export interface GerombolPadam {
  odp: string;
  jumlah: number;
  ponPort: string | null;
  olt: string | null;
}

export interface NocWall {
  sesi: { online: number; offline: number; disabled: number };
  /** ODP dengan LEBIH DARI SATU pelanggan padam — bintang papan ini. */
  padamMenggerombol: GerombolPadam[];
  /** Pelanggan padam yang sendirian di ODP-nya. */
  padamTersebar: number;
  router: { hostname: string; sejak: string; gagalBeruntun: number }[];
  tugas: { macet: number; terlambat: number };
  tiket: { terbuka: number; lewatSla: number; mttrMenit: number | null };
  vonis: Vonis;
  diperbaruiPada: Date;
}

/** Berapa pelanggan padam di satu ODP sebelum disebut menggerombol. */
const AMBANG_GEROMBOL = 2;

export async function loadNocWall(sekarang = new Date()): Promise<NocWall> {
  const [sesiRows, padamRows, routerRows, tasks, tiketTerbuka, tiketSla, mttr] = await Promise.all([
    db.pppoeSession.groupBy({ by: ["status"], _count: { _all: true } }),
    // Pelanggan padam BESERTA ODP-nya — pengelompokan dikerjakan di sini,
    // sebab yang menentukan tindakan bukan jumlahnya melainkan sebarannya.
    db.pppoeSession.findMany({
      where: { status: "OFFLINE", subscriptionId: { not: null } },
      select: {
        subscription: {
          select: {
            odpPort: {
              select: {
                odp: {
                  select: {
                    code: true,
                    ponPort: {
                      select: { label: true, olt: { select: { name: true, networkDevice: { select: { hostname: true } } } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    db.mikrotikRouter.findMany({
      where: { isPollingEnabled: true },
      select: {
        lastPolledAt: true,
        networkDevice: { select: { hostname: true } },
        pollRuns: { select: { status: true }, orderBy: { startedAt: "desc" }, take: 10 },
      },
    }),
    db.scheduledTask.findMany({ select: { isEnabled: true, intervalSec: true, lastRunAt: true } }),
    db.customerTicket.count({ where: { status: { notIn: ["CLOSED", "SOLVED"] } } }),
    db.customerTicket.count({ where: { slaBreached: true, status: { notIn: ["CLOSED", "SOLVED"] } } }),
    db.customerTicket.aggregate({ _avg: { mttrMinutes: true } }),
  ]);

  const hitung = (s: string) => sesiRows.find((r) => r.status === s)?._count._all ?? 0;

  // ── Sebaran padam ────────────────────────────────────────────
  const perOdp = new Map<string, GerombolPadam>();
  for (const p of padamRows) {
    const odp = p.subscription?.odpPort?.odp;
    if (!odp) continue;
    const e = perOdp.get(odp.code) ?? {
      odp: odp.code,
      jumlah: 0,
      ponPort: odp.ponPort?.label ?? null,
      olt: odp.ponPort?.olt.name ?? odp.ponPort?.olt.networkDevice.hostname ?? null,
    };
    e.jumlah++;
    perOdp.set(odp.code, e);
  }
  const semua = [...perOdp.values()];
  const padamMenggerombol = semua
    .filter((x) => x.jumlah >= AMBANG_GEROMBOL)
    .sort((a, b) => b.jumlah - a.jumlah);
  const padamTersebar = semua.filter((x) => x.jumlah < AMBANG_GEROMBOL).length;

  // ── Router ───────────────────────────────────────────────────
  const router = routerRows.map((r) => {
    let beruntun = 0;
    for (const run of r.pollRuns) {
      if (run.status !== "FAILED") break;
      beruntun++;
    }
    const detik = r.lastPolledAt
      ? Math.max(0, Math.round((sekarang.getTime() - r.lastPolledAt.getTime()) / 1000))
      : null;
    return { hostname: r.networkDevice.hostname, sejak: lamanya(detik), gagalBeruntun: beruntun };
  });

  // ── Kesegaran penjadwal ──────────────────────────────────────
  let macet = 0;
  let terlambat = 0;
  const gejala: Gejala[] = [];
  for (const t of tasks) {
    const k = nilaiKesegaran(t, sekarang);
    if (k.status === "MACET") macet++;
    if (k.status === "TERLAMBAT") terlambat++;
    const v = vonisKesegaran(k.status);
    if (v !== "SEHAT") gejala.push({ bagian: "penjadwal", vonis: v, pesan: k.alasan });
  }

  // Padam menggerombol adalah satu-satunya hal di papan ini yang berarti
  // "kirim orang sekarang" — jadi ia yang mengangkat vonis ke GAWAT.
  if (padamMenggerombol.length) {
    gejala.push({ bagian: "jaringan", vonis: "GAWAT", pesan: `${padamMenggerombol.length} ODP padam menggerombol.` });
  }
  for (const r of router) {
    if (r.gagalBeruntun >= 3) {
      gejala.push({ bagian: `router ${r.hostname}`, vonis: "GAWAT", pesan: `${r.gagalBeruntun} penarikan gagal beruntun.` });
    }
  }

  return {
    sesi: { online: hitung("ONLINE"), offline: hitung("OFFLINE"), disabled: hitung("DISABLED") },
    padamMenggerombol,
    padamTersebar,
    router,
    tugas: { macet, terlambat },
    tiket: {
      terbuka: tiketTerbuka,
      lewatSla: tiketSla,
      mttrMenit: mttr._avg.mttrMinutes === null ? null : Math.round(mttr._avg.mttrMinutes),
    },
    vonis: simpulkan(gejala),
    diperbaruiPada: sekarang,
  };
}
