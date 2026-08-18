// ── Penarik alarm LibreNMS: jaring pengaman untuk webhook ───────
//
// Jalur utama alarm adalah WEBHOOK (Fase 67) dan ia sudah terbukti bekerja —
// pada 14 Agustus 2026 ia membuat, men-dedup, dan meng-auto-clear alarm dengan
// benar. Berkas ini TIDAK menggantikannya.
//
// Yang ditutupnya adalah lubang yang tidak bisa ditutup webhook: kalau aplikasi
// sedang restart atau jaringan berkedip saat LibreNMS mengirim, alarm itu
// hilang SELAMANYA — LibreNMS tidak mengirim ulang. Penarik berkala
// membandingkan keadaan sebenarnya dengan yang tercatat, jadi yang lolos tetap
// tertangkap pada putaran berikutnya.
//
// HANYA MEMBACA dari LibreNMS. Satu permintaan GET per putaran.

import { db } from "@/lib/db";
import { ingestMonitoringAlert } from "@/lib/integrations";

// Bentuknya disalin dari `integrations.ts` — proyek ini mendefinisikan Result
// per berkas, bukan di satu tempat bersama.
type Result<T = undefined> =
  | { ok: true; id: string; data: T }
  | { ok: false; error: string };

const TIMEOUT_MS = 15_000;

/**
 * Satu alarm dari `GET /api/v0/alerts`.
 *
 * Semua field opsional dengan sengaja. Bentuk jawaban LibreNMS berbeda antar
 * versi, dan aku belum pernah melihat satu pun alarm sungguhan lewat endpoint
 * ini — saat dibangun, jaringannya sedang sehat dan jawabannya nol isi.
 * Menuntut bentuk tertentu berarti penarik ini gagal diam-diam pada alarm
 * pertama yang benar-benar datang.
 */
interface LibreAlert {
  id?: number | string;
  device_id?: number | string;
  hostname?: string;
  sysName?: string;
  rule?: string;
  name?: string;
  severity?: string;
  state?: number | string;
  timestamp?: string;
  alerted?: number | string;
}

export interface TarikAlarmHasil {
  aktifDiLibre: number;
  dimasukkan: number;
  gagal: number;
  ditutup: number;
  catatan: string[];
}

/** Nama perangkat menurut LibreNMS, apa pun field yang dipakainya. */
function hostnameAlert(a: LibreAlert): string | undefined {
  return (a.hostname ?? a.sysName ?? undefined)?.toString().trim() || undefined;
}

/** Kalimat alarm. `rule` adalah nama aturan yang memicunya di LibreNMS. */
function pesanAlert(a: LibreAlert): string {
  const inti = (a.rule ?? a.name ?? "Alarm LibreNMS").toString().trim();
  const host = hostnameAlert(a);
  return host ? `${inti} — ${host}` : inti;
}

/**
 * Kunci dedup HARUS sama dengan yang dipakai webhook, kalau tidak satu alarm
 * yang sama akan muncul dua kali: sekali dari webhook, sekali dari penarik ini.
 * Bentuknya mengikuti `ingestMonitoringAlert`: `kode|hostname|pesan`.
 */
function dedupKeyAlert(a: LibreAlert): string {
  return `librenms|${hostnameAlert(a) ?? "-"}|${pesanAlert(a)}`;
}

export async function tarikAlarmLibrenms(): Promise<Result<TarikAlarmHasil>> {
  const integration = await db.integration.findUnique({
    where: { code: "librenms" },
    select: { id: true, baseUrl: true, credentialRef: true, isEnabled: true, webhookToken: true },
  });
  if (!integration) return { ok: false, error: "Integrasi `librenms` belum terdaftar." };
  if (!integration.isEnabled) return { ok: false, error: "Integrasi `librenms` sedang dimatikan." };
  if (!integration.baseUrl) return { ok: false, error: "Integrasi `librenms` belum punya baseUrl." };

  const envName = integration.credentialRef?.trim() || "LIBRENMS_API_TOKEN";
  const token = process.env[envName];
  if (!token) return { ok: false, error: `Env var ${envName} belum terisi di proses ini.` };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  let alerts: LibreAlert[];
  try {
    const res = await fetch(`${integration.baseUrl.replace(/\/+$/, "")}/api/v0/alerts`, {
      headers: { "X-Auth-Token": token, Accept: "application/json" },
      signal: ac.signal,
    });
    // Badan jawaban sengaja TIDAK ikut dicatat: LibreNMS mengembalikan
    // tokennya sendiri pada sebagian pesan galat.
    if (!res.ok) return { ok: false, error: `LibreNMS menjawab HTTP ${res.status}.` };
    const body = (await res.json()) as { alerts?: LibreAlert[] };
    alerts = Array.isArray(body?.alerts) ? body.alerts : [];
  } catch (e) {
    const nama = e instanceof Error ? e.name : "";
    return { ok: false, error: nama === "AbortError" ? "LibreNMS tidak menjawab dalam 15 detik." : "LibreNMS tidak terjangkau." };
  } finally {
    clearTimeout(timer);
  }

  const catatan: string[] = [];
  let dimasukkan = 0;
  let gagal = 0;

  // State 0 di LibreNMS berarti pulih; endpoint ini semestinya hanya memuat
  // yang aktif, tetapi itu tidak dijamin antar versi — jadi disaring di sini.
  const aktif = alerts.filter((a) => String(a.state ?? "1") !== "0");

  for (const a of aktif) {
    const hasil = await ingestMonitoringAlert("librenms", integration.webhookToken, {
      status: "FIRING",
      severity: a.severity,
      message: pesanAlert(a),
      deviceHostname: hostnameAlert(a),
      dedupKey: dedupKeyAlert(a),
    });
    if (hasil.ok) dimasukkan++;
    else {
      gagal++;
      catatan.push(`${pesanAlert(a)}: ${hasil.error}`);
    }
  }

  // Rekonsiliasi arah sebaliknya — inilah yang tidak bisa dilakukan webhook.
  //
  // Alarm yang masih terbuka di CRM tetapi TIDAK lagi ada di daftar aktif
  // LibreNMS berarti pemberitahuan pulihnya terlewat. Ditutup di sini, dengan
  // catatan sebabnya, supaya papan NOC tidak menyimpan gangguan hantu yang
  // membuat orang mengejar sesuatu yang sudah beres.
  const kunciAktif = new Set(aktif.map(dedupKeyAlert));
  const terbuka = await db.networkAlarm.findMany({
    where: { source: "librenms", clearedAt: null },
    select: { id: true, alarmNumber: true, dedupKey: true },
  });
  const hantu = terbuka.filter((t) => !t.dedupKey || !kunciAktif.has(t.dedupKey));
  if (hantu.length) {
    await db.networkAlarm.updateMany({
      where: { id: { in: hantu.map((h) => h.id) } },
      data: { clearedAt: new Date() },
    });
    for (const h of hantu) catatan.push(`${h.alarmNumber} ditutup — tidak lagi aktif di LibreNMS`);
  }

  return {
    ok: true,
    id: "tarik-alarm",
    data: { aktifDiLibre: aktif.length, dimasukkan, gagal, ditutup: hantu.length, catatan },
  };
}
