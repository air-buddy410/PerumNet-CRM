// Worker penjadwal — Fase 27.
//
// Dijalankan SEBAGAI PROSES TERSENDIRI, bukan di dalam aplikasi web:
//
//     npm run worker
//
// Alasannya bukan kerapian, melainkan pemisahan kegagalan. Polling router dan
// pengiriman pesan berfrekuensi tinggi dan boleh gagal; penerbitan tagihan dan
// jurnal bersifat transaksional dan tidak boleh. Loop monitoring yang macet
// tidak boleh menahan operasi bisnis.
//
// Aman dijalankan lebih dari satu: perebutan tugas memakai kunci sewa di
// database, jadi satu pekerjaan tetap hanya dikerjakan satu worker.

import os from "node:os";
import { db } from "@/lib/db";
import { syncTaskRegistry, runDueTasks } from "@/lib/scheduler";

const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 15_000);
const WORKER_ID = `${os.hostname()}#${process.pid}`;

let stopping = false;
let ticking = false;

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function tick(): Promise<void> {
  // Tick sebelumnya belum selesai — lewati, jangan menumpuk.
  if (ticking || stopping) return;
  ticking = true;
  try {
    const results = await runDueTasks(WORKER_ID);
    for (const r of results) {
      const line = `${r.code} → ${r.status}${r.durationMs ? ` (${r.durationMs}ms)` : ""}`;
      log(r.status === "FAILED" ? `${line} — ${r.error}` : `${line} — ${r.detail ?? ""}`);
    }
  } catch (error) {
    // Satu putaran gagal tidak boleh mematikan worker.
    log(`putaran gagal: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    ticking = false;
  }
}

async function main(): Promise<void> {
  log(`Worker ${WORKER_ID} mulai — tick ${TICK_MS}ms`);
  await syncTaskRegistry();

  const tasks = await db.scheduledTask.findMany({ orderBy: { code: "asc" } });
  for (const t of tasks) {
    log(
      `  ${t.isEnabled ? "aktif " : "mati  "} ${t.code} — tiap ${t.intervalSec}s`
    );
  }

  const timer = setInterval(() => void tick(), TICK_MS);
  void tick();

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log(`${signal} diterima — menunggu pekerjaan berjalan selesai…`);
    clearInterval(timer);
    // Beri kesempatan tick yang sedang jalan menyelesaikan diri.
    while (ticking) await new Promise((r) => setTimeout(r, 200));
    await db.$disconnect();
    log("Worker berhenti.");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
