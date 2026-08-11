import net from "node:net";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// ── Probe Monitoring Realtime (Fase 25, PRD-NOC-TOOLS N3) ───────
//
// Aturan yang dipegang di sini:
//  - Probe READ-ONLY terhadap perangkat: hanya membuka koneksi TCP lalu
//    menutupnya. Tidak ada perintah yang dikirim.
//  - DOWN tidak langsung membangunkan orang. Alarm baru dinaikkan setelah
//    gagal berturut-turut mencapai failThreshold, dan otomatis di-clear saat
//    target pulih — memakai NetworkAlarm yang sudah ada, bukan mekanisme baru.
//  - Hasil tiap pemeriksaan bersifat append-only.
//
// Catatan metode: ICMP ping butuh raw socket (hak root) yang tidak tersedia di
// proses aplikasi, jadi keterjangkauan diukur lewat TCP connect. Konsekuensinya
// jujur: target yang hidup tetapi portnya tertutup akan terbaca DOWN — karena
// itu port-nya dapat dikonfigurasi per target.

export interface ProbeOutcome {
  status: "UP" | "DOWN";
  latencyMs: number | null;
  error?: string;
}

export type Prober = (
  address: string,
  port: number,
  timeoutMs: number
) => Promise<ProbeOutcome>;

/** Probe TCP nyata. Membuka koneksi, mencatat waktu, langsung menutup. */
export const tcpProbe: Prober = (address, port, timeoutMs) =>
  new Promise<ProbeOutcome>((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const finish = (outcome: ProbeOutcome) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(outcome);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () =>
      finish({ status: "UP", latencyMs: Date.now() - started })
    );
    socket.once("timeout", () =>
      finish({ status: "DOWN", latencyMs: null, error: `timeout setelah ${timeoutMs}ms` })
    );
    socket.once("error", (err) =>
      finish({ status: "DOWN", latencyMs: null, error: err.message })
    );

    try {
      socket.connect(port, address);
    } catch (err) {
      finish({
        status: "DOWN",
        latencyMs: null,
        error: err instanceof Error ? err.message : "gagal membuka koneksi",
      });
    }
  });

async function nextAlarmNumber(): Promise<string> {
  const now = new Date();
  const prefix = `ALM-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const count = await db.networkAlarm.count({
    where: { alarmNumber: { startsWith: prefix } },
  });
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

export interface ProbeRunResult {
  targetId: string;
  status: "UP" | "DOWN";
  latencyMs: number | null;
  alarmRaised: boolean;
  alarmCleared: boolean;
}

/** Menjalankan satu target dan menerapkan aturan alarm. */
export async function runProbe(
  targetId: string,
  opts: { prober?: Prober } = {}
): Promise<ProbeRunResult | null> {
  const target = await db.probeTarget.findUnique({ where: { id: targetId } });
  if (!target) return null;

  const prober = opts.prober ?? tcpProbe;
  const outcome = await prober(target.address, target.port, target.timeoutMs);

  await db.probeResult.create({
    data: {
      targetId: target.id,
      status: outcome.status,
      latencyMs: outcome.latencyMs,
      error: outcome.error ?? null,
    },
  });

  const fails = outcome.status === "DOWN" ? target.consecutiveFails + 1 : 0;
  let alarmRaised = false;
  let alarmCleared = false;
  let openAlarmId = target.openAlarmId;

  // Naikkan alarm tepat saat ambang terlampaui — tidak setiap kali gagal,
  // supaya tidak membanjiri daftar alarm.
  if (outcome.status === "DOWN" && fails >= target.failThreshold && !openAlarmId) {
    const alarmNumber = await nextAlarmNumber();
    const alarm = await db.networkAlarm.create({
      data: {
        alarmNumber,
        severity: target.severity,
        source: "PROBE",
        deviceId: target.networkDeviceId,
        siteId: target.siteId,
        message: `${target.name} (${target.address}:${target.port}) tidak terjangkau — ${fails}× gagal berturut-turut`,
        dedupKey: `probe:${target.id}`,
        lastSeenAt: new Date(),
      },
    });
    openAlarmId = alarm.id;
    alarmRaised = true;
    await logAudit({
      userId: null,
      action: "ALARM_AUTO_CREATE",
      module: "noc",
      entityType: "NetworkAlarm",
      entityId: alarm.id,
      description: `Alarm otomatis ${alarmNumber} dari probe ${target.name}`,
    });
  } else if (outcome.status === "DOWN" && openAlarmId) {
    // Sudah ada alarm terbuka — cukup perbarui hitungan, jangan bikin baris baru.
    await db.networkAlarm.update({
      where: { id: openAlarmId },
      data: { count: { increment: 1 }, lastSeenAt: new Date() },
    });
  }

  // Pulih → alarm ditutup otomatis.
  if (outcome.status === "UP" && openAlarmId) {
    await db.networkAlarm.update({
      where: { id: openAlarmId },
      data: { clearedAt: new Date() },
    });
    await logAudit({
      userId: null,
      action: "ALARM_AUTO_CLEAR",
      module: "noc",
      entityType: "NetworkAlarm",
      entityId: openAlarmId,
      description: `Alarm ditutup otomatis — ${target.name} pulih`,
    });
    openAlarmId = null;
    alarmCleared = true;
  }

  await db.probeTarget.update({
    where: { id: target.id },
    data: {
      consecutiveFails: fails,
      lastStatus: outcome.status,
      lastLatencyMs: outcome.latencyMs,
      lastCheckedAt: new Date(),
      openAlarmId,
    },
  });

  return {
    targetId: target.id,
    status: outcome.status,
    latencyMs: outcome.latencyMs,
    alarmRaised,
    alarmCleared,
  };
}

/** Menjalankan semua target aktif yang sudah waktunya diperiksa. */
export async function runDueProbes(
  opts: { prober?: Prober; now?: Date } = {}
): Promise<ProbeRunResult[]> {
  const now = opts.now ?? new Date();
  const targets = await db.probeTarget.findMany({
    where: { isActive: true },
    select: { id: true, intervalSec: true, lastCheckedAt: true },
  });
  const due = targets.filter(
    (t) =>
      !t.lastCheckedAt ||
      now.getTime() - t.lastCheckedAt.getTime() >= t.intervalSec * 1000
  );
  const results: ProbeRunResult[] = [];
  for (const t of due) {
    const r = await runProbe(t.id, { prober: opts.prober });
    if (r) results.push(r);
  }
  return results;
}

/** Membuang hasil probe lama agar tabel tidak tumbuh tanpa batas. */
export async function pruneProbeResults(olderThanDays = 14): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 86400_000);
  const { count } = await db.probeResult.deleteMany({
    where: { checkedAt: { lt: cutoff } },
  });
  return count;
}
