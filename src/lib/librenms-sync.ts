import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  deviceTypeFromOs,
  vendorFromOs,
  hostnameOf,
  isUp,
  uptimeText,
  shouldSkip,
  type LibreDevice,
} from "@/lib/librenms";

// ── Menarik inventaris perangkat dari LibreNMS (Fase 70) ────────
//
// Sampai sekarang satu-satunya jalur dari LibreNMS ke CRM adalah webhook
// alarm — dan alarm hanya terkirim ketika ada yang RUSAK. Selama jaringannya
// sehat, CRM tidak pernah tahu perangkat apa saja yang dipantau. Akibatnya
// nyata: LibreNMS mengenal enam perangkat dan 818 port, CRM mengenal satu.
//
// Berkas ini membuka arah sebaliknya: CRM menarik daftar perangkat secara
// berkala, sehingga inventarisnya benar tanpa menunggu sesuatu mati.
//
// Yang TIDAK dilakukan di sini, dan disengaja:
//
//  - Tidak menghapus. Perangkat yang lenyap dari LibreNMS ditandai, bukan
//    dibuang: ia bisa saja hanya dinonaktifkan sementara, sementara di CRM ia
//    sudah tertaut ke langganan, alarm, dan tiket.
//  - Tidak menimpa yang diisi manusia. Nama site, PIC, dan catatan tetap
//    milik operator; sinkron hanya mengurus apa yang LibreNMS memang tahu.

const API_TIMEOUT_MS = 15_000;

export interface SyncOutcome {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  /** Perangkat CRM yang tidak lagi ada di LibreNMS. Ditandai, bukan dihapus. */
  missing: string[];
  siteName: string;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Mengambil daftar perangkat dari LibreNMS.
 *
 * Token dibaca dari environment, TIDAK dari basis data. `Integration`
 * menyimpan nama env var-nya saja (`credentialRef`) — itu aturan yang berlaku
 * di seluruh aplikasi ini, dan alasannya sederhana: basis data disalin untuk
 * cadangan, dibuka saat pemeriksaan, dan diekspor saat pindah mesin.
 */
async function fetchDevices(baseUrl: string, token: string): Promise<Result<LibreDevice[]>> {
  const url = `${baseUrl.replace(/\/+$/, "")}/api/v0/devices`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "X-Auth-Token": token, Accept: "application/json" },
      signal: ac.signal,
    });
    if (!res.ok) {
      // Status ditampilkan apa adanya; badan jawaban TIDAK ikut dicatat sebab
      // LibreNMS mengembalikan tokennya kembali pada sebagian pesan galat.
      return { ok: false, error: `LibreNMS menjawab HTTP ${res.status}.` };
    }
    const body = (await res.json()) as { status?: string; devices?: LibreDevice[] };
    if (body.status !== "ok" || !Array.isArray(body.devices)) {
      return { ok: false, error: "Jawaban LibreNMS tidak berbentuk daftar perangkat." };
    }
    return { ok: true, data: body.devices };
  } catch (e) {
    const err = e as Error;
    return {
      ok: false,
      error: err.name === "AbortError" ? `LibreNMS tidak menjawab dalam ${API_TIMEOUT_MS / 1000} detik.` : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Menyelaraskan `NetworkDevice` dengan daftar perangkat LibreNMS.
 *
 * Perangkat baru dimasukkan ke site yang sudah ada. LibreNMS TIDAK bisa
 * memberi tahu lokasinya: ketiga OLT ZTE melaporkan alamat pabrik di
 * Shanghai, dan kedua HSGQ melaporkan kata "Location". Menempatkannya
 * berdasarkan itu jelas salah, jadi semuanya masuk ke satu site dan diberi
 * catatan agar dipindahkan manusia yang tahu di mana tiangnya berdiri.
 */
export async function syncLibrenmsDevices(): Promise<Result<SyncOutcome>> {
  const integration = await db.integration.findUnique({
    where: { code: "librenms" },
    select: { id: true, baseUrl: true, credentialRef: true, isEnabled: true },
  });
  if (!integration) return { ok: false, error: "Integrasi `librenms` belum terdaftar." };
  if (!integration.isEnabled) return { ok: false, error: "Integrasi `librenms` sedang dimatikan." };
  if (!integration.baseUrl) return { ok: false, error: "Integrasi `librenms` belum punya baseUrl." };

  const envName = integration.credentialRef?.trim();
  if (!envName) {
    return { ok: false, error: "Integrasi `librenms` belum menunjuk nama env var untuk tokennya." };
  }
  const token = process.env[envName];
  if (!token) {
    return { ok: false, error: `Env var ${envName} belum terisi di proses ini.` };
  }

  const hasil = await fetchDevices(integration.baseUrl, token);
  if (!hasil.ok) {
    await db.integrationEvent.create({
      data: {
        integrationId: integration.id,
        direction: "OUT",
        eventType: "DEVICE_SYNC",
        status: "ERROR",
        detail: hasil.error,
      },
    });
    return hasil;
  }

  const site = await db.networkSite.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { siteCode: "asc" },
    select: { id: true, name: true },
  });
  if (!site) return { ok: false, error: "Belum ada site jaringan — buat satu dulu." };

  const out: SyncOutcome = {
    fetched: hasil.data.length, created: 0, updated: 0, skipped: 0, missing: [], siteName: site.name,
  };

  const terlihat = new Set<string>();
  for (const d of hasil.data) {
    if (shouldSkip(d)) {
      out.skipped++;
      continue;
    }
    const hostname = hostnameOf(d);
    terlihat.add(hostname);

    const lama = await db.networkDevice.findUnique({ where: { hostname }, select: { id: true } });
    const hidup = isUp(d.status);
    const uptime = uptimeText(d.uptime);
    const catatanStatus = `LibreNMS: ${hidup ? "hidup" : "MATI"}${uptime ? `, uptime ${uptime}` : ""}`;

    if (!lama) {
      await db.networkDevice.create({
        data: {
          hostname,
          deviceType: deviceTypeFromOs(d.os, d.sysName),
          vendor: vendorFromOs(d.os, d.sysName),
          model: d.hardware?.trim() || null,
          serialNumber: d.serial?.trim() || null,
          managementIp: d.hostname.trim(),
          siteId: site.id,
          notes: `Ditarik dari LibreNMS. Site masih ${site.name} — pindahkan ke site yang benar. ${catatanStatus}`,
        },
      });
      out.created++;
      continue;
    }

    // Hanya yang LibreNMS memang tahu. Site, PIC, rack, dan catatan operator
    // tidak disentuh — itu milik manusia yang mengisinya.
    await db.networkDevice.update({
      where: { id: lama.id },
      data: {
        deviceType: deviceTypeFromOs(d.os, d.sysName),
        vendor: vendorFromOs(d.os, d.sysName),
        model: d.hardware?.trim() || null,
        managementIp: d.hostname.trim(),
        ...(d.serial?.trim() ? { serialNumber: d.serial.trim() } : {}),
      },
    });
    out.updated++;
  }

  // Perangkat yang hilang dari LibreNMS DILAPORKAN, tidak dihapus maupun
  // dinonaktifkan. Ia mungkin hanya dilepas sementara dari pemantauan,
  // sementara di CRM ia sudah tertaut ke langganan dan riwayat alarm.
  const semua = await db.networkDevice.findMany({ select: { hostname: true } });
  out.missing = semua.map((x) => x.hostname).filter((h) => !terlihat.has(h));

  await db.integration.update({ where: { id: integration.id }, data: { lastEventAt: new Date() } });
  await db.integrationEvent.create({
    data: {
      integrationId: integration.id,
      direction: "OUT",
      eventType: "DEVICE_SYNC",
      status: "OK",
      detail: `${out.fetched} dibaca · ${out.created} baru · ${out.updated} diperbarui · ${out.skipped} dilewati${out.missing.length ? ` · ${out.missing.length} tidak lagi dipantau` : ""}`,
    },
  });
  if (out.created > 0) {
    await logAudit({
      action: "LIBRENMS_DEVICE_SYNC",
      module: "noc",
      entityType: "NetworkDevice",
      description: `${out.created} perangkat baru ditarik dari LibreNMS ke site ${site.name}.`,
      metadata: { dibaca: out.fetched, baru: out.created, diperbarui: out.updated, hilang: out.missing },
    });
  }

  return { ok: true, data: out };
}
