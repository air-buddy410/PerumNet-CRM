import { db } from "@/lib/db";
import { runDueProbes, pruneProbeResults } from "@/lib/probe";
import { pollAllRouters } from "@/lib/pppoe-monitor";
import { runOutboundQueue } from "@/lib/channels";
import { runQueuedJobs, evaluateDunning } from "@/lib/dunning";

// ── Penjadwal Pekerjaan Berkala (Fase 27) ───────────────────────
//
// Masalah yang diselesaikan: seluruh mesin sudah jadi dan teruji, tetapi tidak
// ada yang menjalankannya. Tagihan tidak terbit sendiri, isolir tidak jalan
// sendiri, probe tidak pernah memeriksa apa pun, dan pesan menunggu di antrian
// sampai ada orang membuka halaman lalu menekan tombol.
//
// Aturan yang dipegang di sini:
//
//  - BERJALAN DI LUAR REQUEST. Dipanggil dari scripts/worker.ts, bukan dari
//    halaman. Loop monitoring yang macet tidak boleh menahan invoice bulanan.
//  - SATU PEKERJAAN, SATU PELAKSANA. Perebutan memakai satu UPDATE bersyarat,
//    bukan baca-lalu-tulis, sehingga dua worker tidak pernah menjalankan
//    pekerjaan yang sama bersamaan.
//  - SEWA KEDALUWARSA. Worker yang mati di tengah jalan tidak mengunci
//    pekerjaan selamanya; sewanya boleh direbut setelah lewat batas.
//  - KEGAGALAN ADALAH STATE. Tercatat di tugas dan di riwayat jalannya, bukan
//    hilang di log.
//  - PENERBITAN TAGIHAN TIDAK DIOTOMATISKAN. Lihat catatan di bawah.

export interface TaskOutcome {
  detail: string;
}

export interface TaskDefinition {
  code: string;
  name: string;
  description: string;
  defaultIntervalSec: number;
  enabledByDefault: boolean;
  run: () => Promise<TaskOutcome>;
}

/** Batas sewa: pekerjaan yang terkunci lebih lama dari ini dianggap terbengkalai. */
export const LEASE_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Menegakkan satu aturan: kegagalan TOTAL adalah kegagalan tugas.
 *
 * Sebagian gagal tetap dianggap berhasil — itu memang sebagian, dan
 * keterangannya sudah menyebutkan yang gagal. Tetapi bila tidak ada satu pun
 * yang berhasil padahal ada pekerjaan, melaporkannya SUCCESS membuat kegagalan
 * lolos dari perhatian justru saat paling perlu dilihat.
 *
 * Cacat ini baru ketahuan saat worker benar-benar dijalankan, bukan dari tes.
 */
export function assertNotTotalFailure(
  succeeded: number,
  attempted: number,
  summary: string
): void {
  if (attempted > 0 && succeeded === 0) throw new Error(summary);
}

export const TASKS: TaskDefinition[] = [
  {
    code: "probe.run",
    name: "Jalankan probe jaringan",
    description: "Memeriksa keterjangkauan target yang sudah jatuh tempo, menaikkan/menutup alarm.",
    defaultIntervalSec: 60,
    enabledByDefault: true,
    run: async () => {
      const results = await runDueProbes();
      const down = results.filter((r) => r.status === "DOWN").length;
      const raised = results.filter((r) => r.alarmRaised).length;
      const cleared = results.filter((r) => r.alarmCleared).length;
      return {
        detail: `${results.length} target diperiksa · ${down} down · ${raised} alarm naik · ${cleared} alarm ditutup`,
      };
    },
  },
  {
    code: "pppoe.poll",
    name: "Tarik status PPPoE",
    description: "Menarik sesi aktif & secret dari seluruh router MikroTik yang polling-nya aktif.",
    defaultIntervalSec: 120,
    enabledByDefault: true,
    run: async () => {
      const results = await pollAllRouters();
      const ok = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok);
      const summary =
        `${ok}/${results.length} router berhasil` +
        (failed.length ? ` · gagal: ${failed.map((f) => f.error).join("; ").slice(0, 200)}` : "");
      assertNotTotalFailure(ok, results.length, summary);
      return { detail: summary };
    },
  },
  {
    code: "channels.outbox",
    name: "Kirim antrian pesan",
    description: "Memproses antrian pesan keluar ke pelanggan dengan rate limit.",
    defaultIntervalSec: 60,
    enabledByDefault: true,
    run: async () => {
      const result = await runOutboundQueue(null);
      if (!result.ok) throw new Error(result.error);
      const sent = result.data?.sent ?? 0;
      const failed = result.data?.failed ?? 0;
      const summary = `${sent} terkirim · ${failed} gagal`;
      assertNotTotalFailure(sent, sent + failed, summary);
      return { detail: summary };
    },
  },
  {
    code: "network.access-jobs",
    name: "Eksekusi antrian perintah router",
    description: "Menjalankan job isolir/pemulihan yang mengantre menuju router.",
    defaultIntervalSec: 60,
    enabledByDefault: true,
    run: async () => {
      const result = await runQueuedJobs(null);
      if (!result.ok) throw new Error(result.error);
      const success = result.data?.success ?? 0;
      const failed = result.data?.failed ?? 0;
      const summary = `${success} sukses · ${failed} gagal`;
      assertNotTotalFailure(success, success + failed, summary);
      return { detail: summary };
    },
  },
  {
    code: "billing.dunning",
    name: "Evaluasi tunggakan & isolir",
    description: "Memeriksa kebijakan dunning lalu mengantrikan isolir bagi yang melewati ambang.",
    // Sekali sehari sudah cukup: ambangnya berbasis hari, bukan menit.
    defaultIntervalSec: 24 * 3600,
    // SENGAJA nonaktif secara default — memutus layanan pelanggan secara
    // otomatis harus dinyalakan sadar, setelah dry-run diperiksa.
    enabledByDefault: false,
    run: async () => {
      const result = await evaluateDunning(null);
      if (!result.ok) throw new Error(result.error);
      return {
        detail: `${result.data?.checked ?? 0} langganan diperiksa · ${result.data?.suspended ?? 0} diisolir`,
      };
    },
  },
  {
    code: "probe.prune",
    name: "Pangkas riwayat probe",
    description: "Membuang hasil probe lebih tua dari 14 hari agar tabel tidak tumbuh tanpa batas.",
    defaultIntervalSec: 24 * 3600,
    enabledByDefault: true,
    run: async () => {
      const removed = await pruneProbeResults(14);
      return { detail: `${removed} baris dibuang` };
    },
  },
];

// CATATAN SENGAJA: penerbitan tagihan bulanan TIDAK dijadwalkan.
// generateInvoiceRun() bekerja pada satu InvoiceRun yang harus dibuat lebih
// dulu, dan posting-nya mengunci tagihan bagi ribuan pelanggan. Worker boleh
// menyiapkan, tetapi keputusan menerbitkan tetap di tangan manusia.

const TASK_BY_CODE = new Map(TASKS.map((t) => [t.code, t]));

/** Menyamakan daftar tugas di database dengan definisi di kode. */
export async function syncTaskRegistry(): Promise<void> {
  for (const def of TASKS) {
    await db.scheduledTask.upsert({
      where: { code: def.code },
      // Interval & status aktif TIDAK ditimpa — itu keputusan operator yang
      // sudah tersimpan; kode hanya pemilik nama dan deskripsi.
      update: { name: def.name, description: def.description },
      create: {
        code: def.code,
        name: def.name,
        description: def.description,
        intervalSec: def.defaultIntervalSec,
        isEnabled: def.enabledByDefault,
      },
    });
  }
}

/** Apakah sebuah tugas sudah waktunya dijalankan. */
export function isDue(
  task: { isEnabled: boolean; intervalSec: number; lastRunAt: Date | null },
  now: Date = new Date()
): boolean {
  if (!task.isEnabled) return false;
  if (!task.lastRunAt) return true;
  return now.getTime() - task.lastRunAt.getTime() >= task.intervalSec * 1000;
}

/** Apakah sewa sebuah tugas sudah kedaluwarsa (worker-nya diduga mati). */
export function isLeaseExpired(
  task: { lockedAt: Date | null },
  now: Date = new Date()
): boolean {
  if (!task.lockedAt) return true;
  return now.getTime() - task.lockedAt.getTime() > LEASE_TIMEOUT_MS;
}

/**
 * Merebut satu tugas. Mengembalikan true hanya bagi pemenang.
 *
 * Perebutan dilakukan dalam SATU updateMany bersyarat: baris hanya terupdate
 * bila belum terkunci atau sewanya kedaluwarsa. Dua worker yang menjalankan ini
 * bersamaan — tepat satu akan mendapat count 1.
 */
export async function claimTask(taskId: string, workerId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - LEASE_TIMEOUT_MS);
  const { count } = await db.scheduledTask.updateMany({
    where: {
      id: taskId,
      OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
    },
    data: { lockedAt: new Date(), lockedBy: workerId },
  });
  return count === 1;
}

export interface TaskRunResult {
  code: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  detail?: string;
  error?: string;
  durationMs?: number;
}

/** Menjalankan satu tugas yang sudah direbut, lalu melepaskan sewanya. */
export async function executeTask(
  taskId: string,
  workerId: string
): Promise<TaskRunResult> {
  const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
  if (!task) return { code: "?", status: "SKIPPED", error: "Tugas tidak ditemukan." };

  const def = TASK_BY_CODE.get(task.code);
  if (!def) {
    // Tugas ada di database tapi tidak ada penanganannya di kode — kemungkinan
    // sisa versi lama. Dilaporkan, bukan didiamkan.
    await db.scheduledTask.update({
      where: { id: taskId },
      data: {
        lockedAt: null,
        lockedBy: null,
        lastStatus: "FAILED",
        lastError: "Tidak ada penangan untuk kode tugas ini di kode aplikasi.",
      },
    });
    return { code: task.code, status: "FAILED", error: "Tanpa penangan." };
  }

  const run = await db.scheduledTaskRun.create({
    data: { taskId: task.id, workerId, status: "RUNNING" },
  });
  const started = Date.now();

  try {
    const outcome = await def.run();
    const durationMs = Date.now() - started;
    await db.$transaction([
      db.scheduledTaskRun.update({
        where: { id: run.id },
        data: { status: "SUCCESS", finishedAt: new Date(), detail: outcome.detail },
      }),
      db.scheduledTask.update({
        where: { id: task.id },
        data: {
          lastRunAt: new Date(),
          lastStatus: "SUCCESS",
          lastError: null,
          lastDurationMs: durationMs,
          runCount: { increment: 1 },
          lockedAt: null,
          lockedBy: null,
        },
      }),
    ]);
    return { code: task.code, status: "SUCCESS", detail: outcome.detail, durationMs };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pekerjaan gagal.";
    const durationMs = Date.now() - started;
    await db.$transaction([
      db.scheduledTaskRun.update({
        where: { id: run.id },
        data: { status: "FAILED", finishedAt: new Date(), error: message },
      }),
      db.scheduledTask.update({
        where: { id: task.id },
        data: {
          // lastRunAt tetap bergerak supaya tugas yang selalu gagal tidak
          // dicoba ulang tanpa henti setiap detik.
          lastRunAt: new Date(),
          lastStatus: "FAILED",
          lastError: message,
          lastDurationMs: durationMs,
          runCount: { increment: 1 },
          failCount: { increment: 1 },
          lockedAt: null,
          lockedBy: null,
        },
      }),
    ]);
    return { code: task.code, status: "FAILED", error: message, durationMs };
  }
}

/** Satu putaran penjadwal: jalankan semua tugas yang jatuh tempo. */
export async function runDueTasks(workerId: string): Promise<TaskRunResult[]> {
  const tasks = await db.scheduledTask.findMany({ where: { isEnabled: true } });
  const now = new Date();
  const results: TaskRunResult[] = [];

  for (const task of tasks) {
    if (!isDue(task, now)) continue;
    if (!isLeaseExpired(task, now)) continue; // sedang dikerjakan worker lain
    if (!(await claimTask(task.id, workerId))) continue; // kalah rebutan
    results.push(await executeTask(task.id, workerId));
  }
  return results;
}
