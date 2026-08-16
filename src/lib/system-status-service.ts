// ── Mengumpulkan kesehatan sistem jadi satu layar (Fase 84) ─────
//
// Aturan penilaiannya ada di `system-status.ts` dan sudah diuji tanpa basis
// data.
//
// Datanya SUDAH ADA seluruhnya — `ScheduledTask`, `PppoePollRun`,
// `NetworkAccessJob`, `NetworkPort` — tersebar di tiga layar berbeda. Yang
// belum ada adalah satu tempat yang menjawab pertanyaan yang sebenarnya
// ditanyakan orang tiap pagi: **"semuanya jalan atau tidak?"**
//
// Tiga layar yang masing-masing benar tidak menjawab itu. Orang harus membuka
// ketiganya, mengingat ambang tiap tugas, dan menghitung selisih waktu di
// kepalanya — pada jam VPS yang UTC sementara ia bekerja di Asia/Makassar.
// Dalam praktiknya tidak ada yang melakukannya, jadi tidak ada yang tahu.

import { db } from "@/lib/db";
import {
  nilaiKesegaran,
  sewaTertinggal,
  simpulkan,
  vonisKesegaran,
  lamanya,
  type Gejala,
  type Vonis,
  type Kesegaran,
} from "@/lib/system-status";

/** Batas sewa dianggap tertinggal — sama dengan yang dipakai layar penjadwal. */
const SEWA_BATAS_DETIK = 600;

export interface BarisTugas {
  code: string;
  name: string;
  isEnabled: boolean;
  intervalSec: number;
  lastRunAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  runCount: number;
  failCount: number;
  kesegaran: Kesegaran;
  telatDetik: number | null;
  sejak: string;
  alasan: string;
  sewaTertinggal: boolean;
}

export interface BarisRouter {
  hostname: string;
  isPollingEnabled: boolean;
  lastPolledAt: Date | null;
  sejak: string;
  /** Berapa penarikan terakhir yang GAGAL berturut-turut. */
  gagalBeruntun: number;
  errorTerakhir: string | null;
  sesiOnline: number;
}

export interface StatusSistem {
  sekarang: Date;
  vonis: Vonis;
  gejala: Gejala[];
  tugas: BarisTugas[];
  router: BarisRouter[];
  antrean: { queued: number; failed: number; running: number };
  /** Perangkat yang tersinkron LibreNMS, dan kapan terakhir. */
  librenms: { perangkat: number; port: number; terakhirSinkron: Date | null; sejak: string };
  /** Ringkas OLT: berapa OLT, port PON, dan ODP yang tertaut kepadanya. */
  olt: { olt: number; ponPort: number; odpTertaut: number; odpTanpaPon: number };
}

export async function loadStatusSistem(sekarang = new Date()): Promise<StatusSistem> {
  const [tasks, routers, antreanRows, oltCount, ponCount, odpTertaut, odpTanpaPon, perangkat, port, sinkron] =
    await Promise.all([
      db.scheduledTask.findMany({ orderBy: { code: "asc" } }),
      db.mikrotikRouter.findMany({
        select: {
          id: true,
          isPollingEnabled: true,
          lastPolledAt: true,
          networkDevice: { select: { hostname: true } },
          pollRuns: {
            select: { status: true, error: true, startedAt: true },
            orderBy: { startedAt: "desc" },
            take: 20,
          },
          _count: { select: { sessions: { where: { status: "ONLINE" } } } },
        },
      }),
      db.networkAccessJob.groupBy({ by: ["status"], _count: { _all: true } }),
      db.oltDevice.count(),
      db.ponPort.count(),
      db.odp.count({ where: { ponPortId: { not: null } } }),
      db.odp.count({ where: { ponPortId: null } }),
      db.networkDevice.count(),
      db.networkPort.count(),
      db.networkPort.aggregate({ _max: { lastSyncAt: true } }),
    ]);

  // ── Tugas berjadwal ──────────────────────────────────────────
  const tugas: BarisTugas[] = tasks.map((t) => {
    const k = nilaiKesegaran(
      { isEnabled: t.isEnabled, intervalSec: t.intervalSec, lastRunAt: t.lastRunAt },
      sekarang
    );
    return {
      code: t.code,
      name: t.name,
      isEnabled: t.isEnabled,
      intervalSec: t.intervalSec,
      lastRunAt: t.lastRunAt,
      lastStatus: t.lastStatus,
      lastError: t.lastError,
      runCount: t.runCount,
      failCount: t.failCount,
      kesegaran: k.status,
      telatDetik: k.telatDetik,
      sejak: lamanya(k.telatDetik),
      alasan: k.alasan,
      sewaTertinggal: sewaTertinggal(t.lockedAt, sekarang, SEWA_BATAS_DETIK),
    };
  });

  // ── Router ───────────────────────────────────────────────────
  //
  // Yang dihitung KEGAGALAN BERUNTUN, bukan jumlah kegagalan seumur hidup.
  // Router yang gagal 200 kali bulan lalu lalu pulih tidak sedang bermasalah;
  // yang gagal tiga kali berturut-turut sejak sepuluh menit lalu, iya.
  const router: BarisRouter[] = routers.map((r) => {
    let beruntun = 0;
    for (const run of r.pollRuns) {
      if (run.status !== "FAILED") break;
      beruntun++;
    }
    const gagalTerakhir = r.pollRuns.find((x) => x.status === "FAILED");
    const detik = r.lastPolledAt
      ? Math.max(0, Math.round((sekarang.getTime() - r.lastPolledAt.getTime()) / 1000))
      : null;
    return {
      hostname: r.networkDevice.hostname,
      isPollingEnabled: r.isPollingEnabled,
      lastPolledAt: r.lastPolledAt,
      sejak: lamanya(detik),
      gagalBeruntun: beruntun,
      errorTerakhir: beruntun > 0 ? (gagalTerakhir?.error ?? null) : null,
      sesiOnline: r._count.sessions,
    };
  });

  const antrean = {
    queued: antreanRows.find((a) => a.status === "QUEUED")?._count._all ?? 0,
    failed: antreanRows.find((a) => a.status === "FAILED")?._count._all ?? 0,
    running: antreanRows.find((a) => a.status === "RUNNING")?._count._all ?? 0,
  };

  const terakhirSinkron = sinkron._max?.lastSyncAt ?? null;
  const detikSinkron = terakhirSinkron
    ? Math.max(0, Math.round((sekarang.getTime() - terakhirSinkron.getTime()) / 1000))
    : null;

  // ── Gejala ───────────────────────────────────────────────────
  const gejala: Gejala[] = [];

  for (const t of tugas) {
    const v = vonisKesegaran(t.kesegaran);
    if (v !== "SEHAT") gejala.push({ bagian: `tugas ${t.code}`, vonis: v, pesan: t.alasan });
    if (t.sewaTertinggal) {
      gejala.push({
        bagian: `tugas ${t.code}`,
        vonis: "PERHATIAN",
        pesan: "Kuncinya tertinggal terpasang — worker sebelumnya kemungkinan mati di tengah jalan.",
      });
    }
  }

  for (const r of router) {
    if (!r.isPollingEnabled) continue;
    // Tiga kali berturut-turut: satu kegagalan bisa kebetulan, tiga tidak.
    if (r.gagalBeruntun >= 3) {
      gejala.push({
        bagian: `router ${r.hostname}`,
        vonis: "GAWAT",
        pesan: `${r.gagalBeruntun} penarikan gagal berturut-turut. ${r.errorTerakhir ?? ""}`.trim(),
      });
    } else if (r.gagalBeruntun > 0) {
      gejala.push({
        bagian: `router ${r.hostname}`,
        vonis: "PERHATIAN",
        pesan: `Penarikan terakhir gagal. ${r.errorTerakhir ?? ""}`.trim(),
      });
    }
  }

  if (antrean.failed > 0) {
    gejala.push({
      bagian: "antrean perintah router",
      vonis: "PERHATIAN",
      pesan: `${antrean.failed} perintah gagal dan menunggu ditinjau.`,
    });
  }

  return {
    sekarang,
    vonis: simpulkan(gejala),
    gejala,
    tugas,
    router,
    antrean,
    librenms: { perangkat, port, terakhirSinkron, sejak: lamanya(detikSinkron) },
    olt: { olt: oltCount, ponPort: ponCount, odpTertaut, odpTanpaPon },
  };
}
