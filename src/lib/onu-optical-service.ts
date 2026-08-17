// ── Membaca daya optik ONU dari OLT, atas permintaan (Fase 88b) ──
//
// Aturan penyandiannya ada di `onu-optical.ts` dan sudah diuji tanpa jaringan.
//
// TIGA KEPUTUSAN YANG MEMBENTUK BERKAS INI:
//
//  1. **Dibaca saat diminta, bukan di-poll.** Satu klik = satu SNMP GET ke
//     satu OID. Tidak ada penjadwal yang menyapu 1.698 ONU — OLT yang sibuk
//     melayani pembacaan adalah OLT yang tidak sedang melayani pelanggan.
//
//  2. **Community diambil dari LibreNMS, bukan disimpan lagi.** LibreNMS sudah
//     memegangnya untuk mem-poll perangkat yang sama; menyalinnya ke tempat
//     kedua berarti dua tempat yang harus dijaga dan dua tempat yang bisa
//     bocor. `OltDevice.credentialRef` tetap kosong dari rahasia.
//
//  3. **SNMP GET adalah BACA.** Mode baca-saja melarang menulis ke jaringan;
//     membaca satu nilai dari tabel yang memang dipancarkan perangkat setara
//     dengan yang LibreNMS lakukan tiap sepuluh menit. Aksi tulis (reboot,
//     configure) tetap tidak ada di berkas ini, dan jangan ditambahkan ke sini
//     — tempatnya antrean `NetworkAccessJob`, sesudah cutover.

import snmp from "net-snmp";
import { db } from "@/lib/db";
import { bacaPosisiOnu } from "@/lib/onu-import";
import {
  oidRxC300,
  oidNamaC300,
  bacaRxC300,
  nilaiMutu,
  keteranganMutu,
  type MutuSinyal,
} from "@/lib/onu-optical";

export interface HasilDayaOnu {
  ok: true;
  serviceNumber: string;
  olt: string;
  posisi: string;
  dBm: number;
  mutu: MutuSinyal;
  keterangan: string;
  /** Nama ONU menurut perangkat — pembanding pemetaan, bukan hiasan. */
  namaDiPerangkat: string | null;
  dibacaPada: Date;
}

export interface GagalDayaOnu {
  ok: false;
  /** DIDUKUNG tapi gagal, atau memang BELUM_DIDUKUNG. */
  sebab: "BELUM_DIDUKUNG" | "TANPA_POSISI" | "TAK_TERBACA" | "GALAT";
  pesan: string;
}

/** Waktu tunggu satu GET. OLT produksi tidak boleh ditunggu selamanya. */
const TIMEOUT_MS = 8_000;

export async function bacaDayaOnu(subscriptionId: string): Promise<HasilDayaOnu | GagalDayaOnu> {
  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    select: {
      serviceNumber: true,
      onuPosition: true,
      odpPort: {
        select: {
          odp: {
            select: {
              ponPort: {
                select: {
                  olt: {
                    select: {
                      vendor: true,
                      model: true,
                      name: true,
                      networkDevice: { select: { hostname: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!sub) return { ok: false, sebab: "GALAT", pesan: "Langganan tidak ditemukan." };

  const posisi = bacaPosisiOnu(sub.onuPosition);
  if (!posisi) {
    return {
      ok: false,
      sebab: "TANPA_POSISI",
      pesan: "Posisi ONU pelanggan ini tidak tercatat, jadi tidak ada yang bisa dibaca.",
    };
  }

  const olt = sub.odpPort?.odp.ponPort?.olt;
  if (!olt) {
    return { ok: false, sebab: "TANPA_POSISI", pesan: "ODP pelanggan ini belum tertaut ke OLT mana pun." };
  }

  // Hanya C300 yang memancarkan tabel optik lewat SNMP. C600 dan HSGQ sudah
  // dijelajahi penuh dan memang tidak punya — lihat kepala `onu-optical.ts`.
  const c300 = olt.vendor === "ZTE" && /300/.test(olt.model ?? "");
  if (!c300) {
    return {
      ok: false,
      sebab: "BELUM_DIDUKUNG",
      pesan:
        `OLT ${olt.name ?? olt.networkDevice.hostname} tidak memancarkan daya ONU lewat SNMP — ` +
        `pembacaannya menunggu jalur CLI (perlu kredensial OLT).`,
    };
  }

  const target = await targetSnmp(olt.networkDevice.hostname);
  if (!target.ok) return { ok: false, sebab: "GALAT", pesan: target.error };

  try {
    const [rawRx, rawNama] = await snmpGet(target.host, target.community, [
      oidRxC300(posisi),
      oidNamaC300(posisi),
    ]);

    const rx = bacaRxC300(typeof rawRx === "number" ? rawRx : Number(rawRx));
    if (rx.dBm === null) {
      return { ok: false, sebab: "TAK_TERBACA", pesan: rx.alasan ?? "Perangkat tidak memberikan nilai." };
    }
    const mutu = nilaiMutu(rx.dBm);
    return {
      ok: true,
      serviceNumber: sub.serviceNumber,
      olt: olt.name ?? olt.networkDevice.hostname,
      posisi: sub.onuPosition!,
      dBm: rx.dBm,
      mutu,
      keterangan: keteranganMutu(mutu),
      namaDiPerangkat: rawNama == null ? null : String(rawNama),
      dibacaPada: new Date(),
    };
  } catch (e) {
    return {
      ok: false,
      sebab: "GALAT",
      pesan: `OLT tidak menjawab: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ── Community dari LibreNMS ─────────────────────────────────────

const cacheTarget = new Map<string, { host: string; community: string; sampai: number }>();
const CACHE_MENIT = 10;

async function targetSnmp(
  hostname: string
): Promise<{ ok: true; host: string; community: string } | { ok: false; error: string }> {
  const ada = cacheTarget.get(hostname);
  if (ada && ada.sampai > Date.now()) return { ok: true, host: ada.host, community: ada.community };

  const integration = await db.integration.findUnique({
    where: { code: "librenms" },
    select: { baseUrl: true, credentialRef: true, isEnabled: true },
  });
  if (!integration?.isEnabled || !integration.baseUrl) {
    return { ok: false, error: "Integrasi LibreNMS sedang tidak tersedia." };
  }
  const token = process.env[integration.credentialRef?.trim() ?? ""];
  if (!token) return { ok: false, error: "Token LibreNMS belum terisi di proses ini." };

  const r = await fetch(`${integration.baseUrl.replace(/\/$/, "")}/api/v0/devices/${hostname}`, {
    headers: { "X-Auth-Token": token },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) return { ok: false, error: `LibreNMS menjawab ${r.status} untuk ${hostname}.` };
  const body = (await r.json()) as { devices?: { hostname?: string; community?: string }[] };
  const community = body.devices?.[0]?.community;
  if (!community) return { ok: false, error: `LibreNMS tidak menyimpan community untuk ${hostname}.` };

  cacheTarget.set(hostname, { host: hostname, community, sampai: Date.now() + CACHE_MENIT * 60_000 });
  return { ok: true, host: hostname, community };
}

// ── Pembungkus net-snmp ─────────────────────────────────────────

function snmpGet(host: string, community: string, oids: string[]): Promise<(number | string | null)[]> {
  return new Promise((resolve, reject) => {
    const session = snmp.createSession(host, community, {
      version: snmp.Version2c,
      timeout: TIMEOUT_MS,
      retries: 0,
    });
    session.get(oids, (error: Error | null, varbinds: import("net-snmp").Varbind[]) => {
      session.close();
      if (error) return reject(error);
      resolve(
        varbinds.map((v) => {
          if (snmp.isVarbindError(v)) return null;
          if (Buffer.isBuffer(v.value)) return v.value.toString("utf8");
          if (typeof v.value === "number") return v.value;
          return v.value == null ? null : String(v.value);
        })
      );
    });
  });
}
