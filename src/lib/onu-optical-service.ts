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
  perintahRxZte,
  bacaJawabanRxZte,
  perintahRxHsgq,
  bacaJawabanRxHsgq,
  perintahJarakZte,
  bacaJarakZte,
  nilaiMutu,
  keteranganMutu,
  type MutuSinyal,
  type BacaanRx,
} from "@/lib/onu-optical";
import { bacaKredensialOlt, jalankanPerintahMultiPort, OltTelnetError } from "@/lib/olt-telnet";

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
  /**
   * Jarak ONU dari OLT dalam meter. NULL berarti perangkatnya tidak memberi —
   * hanya CLI ZTE yang memuatnya; HSGQ tidak menyediakan, dan C300 menunggu
   * kredensial CLI-nya sendiri.
   */
  jarakMeter: number | null;
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
                      telnetPort: true,
                      credentialRef: true,
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

  // Tiga jalur, dipilih menurut apa yang perangkatnya sanggup:
  //
  //   C300  → SNMP  — satu-satunya yang memancarkan tabel optik
  //   C600  → CLI   — `show pon power onu-rx`, ditemukan 17 Agustus 2026
  //   HSGQ  → CLI   — `interface gpon N` lalu `show ont-optical`
  //
  // Seluruh jalur CLI melewati daftar putih perintah di `olt-telnet.ts`:
  // hanya membaca, dan perintah pengubah ditolak sebelum menyentuh soket.
  const namaOlt = olt.name ?? olt.networkDevice.hostname;
  const jadi = (rx: BacaanRx, namaDiPerangkat: string | null, jarakMeter: number | null = null): HasilDayaOnu | GagalDayaOnu => {
    if (rx.dBm === null) {
      return { ok: false, sebab: "TAK_TERBACA", pesan: rx.alasan ?? "Perangkat tidak memberikan nilai." };
    }
    const mutu = nilaiMutu(rx.dBm);
    return {
      ok: true,
      serviceNumber: sub.serviceNumber,
      olt: namaOlt,
      posisi: sub.onuPosition!,
      dBm: rx.dBm,
      mutu,
      keterangan: keteranganMutu(mutu),
      namaDiPerangkat,
      jarakMeter,
      dibacaPada: new Date(),
    };
  };

  const c300 = olt.vendor === "ZTE" && /300/.test(olt.model ?? "");

  // C300 punya DUA jalur, dan CLI menang bila kredensialnya ada: SNMP-nya
  // memberi daya tetapi TIDAK memberi jarak. Tanpa kredensial ia tetap
  // terbaca lewat SNMP — separuh jawaban lebih baik daripada nol.
  const c300PunyaKredensial =
    c300 && !!olt.credentialRef && olt.credentialRef !== "LIBRENMS_API_TOKEN" && !!process.env[olt.credentialRef];

  if (c300 && !c300PunyaKredensial) {
    const target = await targetSnmp(olt.networkDevice.hostname);
    if (!target.ok) return { ok: false, sebab: "GALAT", pesan: target.error };
    try {
      const [rawRx, rawNama] = await snmpGet(target.host, target.community, [
        oidRxC300(posisi),
        oidNamaC300(posisi),
      ]);
      return jadi(
        bacaRxC300(typeof rawRx === "number" ? rawRx : Number(rawRx)),
        rawNama == null ? null : String(rawNama)
      );
    } catch (e) {
      return { ok: false, sebab: "GALAT", pesan: `OLT tidak menjawab: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  // Jalur CLI — ZTE C600 dan HSGQ.
  let kred;
  try {
    kred = bacaKredensialOlt(olt.credentialRef);
  } catch (e) {
    return {
      ok: false,
      sebab: "BELUM_DIDUKUNG",
      pesan: `OLT ${namaOlt} dibaca lewat CLI, tetapi kredensialnya belum siap: ${(e as Error).message}`,
    };
  }

  const ports = [olt.telnetPort ?? 23, 23];
  const zte = olt.vendor === "ZTE";
  const platform: "C600" | "C300" = c300 ? "C300" : "C600";
  // Pada ZTE, jarak ikut dibaca DALAM SESI YANG SAMA — dua perintah satu
  // login, bukan dua login. Sesi konsol OLT terbatas jumlahnya.
  const perintah = zte
    ? [perintahRxZte(posisi, platform), perintahJarakZte(posisi, platform)]
    : perintahRxHsgq(posisi);

  try {
    const { keluaran } = await jalankanPerintahMultiPort(
      { host: olt.networkDevice.hostname, user: kred.user, password: kred.password },
      ports,
      perintah
    );
    return jadi(
      zte ? bacaJawabanRxZte(keluaran) : bacaJawabanRxHsgq(keluaran),
      null,
      zte ? bacaJarakZte(keluaran) : null
    );
  } catch (e) {
    const pesan = e instanceof OltTelnetError ? e.message : String(e);
    return { ok: false, sebab: "GALAT", pesan };
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
