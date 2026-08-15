import { db } from "@/lib/db";
import { portKind, speedText } from "@/lib/librenms";

// ── Jalur baca port jaringan (Fase 74) ──────────────────────────
//
// `NetworkPort` berisi 818 baris, dan itu BUKAN satu jenis benda. Menyajikan
// seluruhnya sebagai satu daftar panjang membuat halamannya tidak terbaca:
// 669 di antaranya adalah satu baris per ONU pelanggan pada OLT HSGQ, dan
// mereka menenggelamkan 64 port PON serta 52 uplink yang justru dicari orang.
//
// Karena itu jalur baca ini menggolongkan lebih dulu, dan menyediakan
// ringkasan per perangkat supaya halaman bisa menampilkan angka sebelum
// menampilkan baris.

export interface RingkasanPort {
  deviceId: string;
  hostname: string;
  /** Jumlah port per golongan: PON, ONU, ETHERNET, VLAN, PPP, LAIN. */
  perGolongan: Record<string, number>;
  total: number;
  naik: number;
}

export interface BarisPort {
  id: string;
  ifName: string;
  ifAlias: string | null;
  golongan: string;
  operStatus: string | null;
  adminStatus: string | null;
  /** Kecepatan siap tampil, mis. "10 Gbps"; null bila tidak dilaporkan. */
  kecepatan: string | null;
  lastSyncAt: Date;
}

/**
 * Ringkasan per perangkat — dipakai untuk kartu angka di atas tabel.
 *
 * @param deviceId Bila diisi, hanya perangkat itu yang dibaca. Halaman detail
 *   perangkat memerlukan satu ringkasan saja, dan tanpa penyaring ini ia
 *   menarik seluruh 818 baris untuk memakai belasan di antaranya.
 */
export async function loadRingkasanPort(deviceId?: string): Promise<RingkasanPort[]> {
  const ports = await db.networkPort.findMany({
    where: deviceId ? { deviceId } : undefined,
    select: {
      deviceId: true,
      ifName: true,
      ifType: true,
      ifSpeedBps: true,
      operStatus: true,
      device: { select: { hostname: true } },
    },
  });

  const per = new Map<string, RingkasanPort>();
  for (const p of ports) {
    const r =
      per.get(p.deviceId) ??
      { deviceId: p.deviceId, hostname: p.device.hostname, perGolongan: {}, total: 0, naik: 0 };
    const g = portKind(p.ifType, p.ifName, p.ifSpeedBps);
    r.perGolongan[g] = (r.perGolongan[g] ?? 0) + 1;
    r.total++;
    if (p.operStatus?.toLowerCase() === "up") r.naik++;
    per.set(p.deviceId, r);
  }
  return [...per.values()].sort((a, b) => b.total - a.total);
}

/**
 * Port satu perangkat, tersaring menurut golongan.
 *
 * @param golongan Bila diisi, hanya golongan itu yang dikembalikan. Halaman
 *   sebaiknya membuka pada PON dan ETHERNET — ONU disembunyikan di balik satu
 *   tautan, sebab 669 baris pelanggan bukan yang dicari orang saat membuka
 *   detail perangkat.
 */
export async function loadPortPerangkat(deviceId: string, golongan?: string): Promise<BarisPort[]> {
  const ports = await db.networkPort.findMany({
    where: { deviceId },
    orderBy: { ifName: "asc" },
    select: {
      id: true, ifName: true, ifAlias: true, ifType: true,
      ifSpeedBps: true, operStatus: true, adminStatus: true, lastSyncAt: true,
    },
  });

  return ports
    .map((p) => ({
      id: p.id,
      ifName: p.ifName,
      ifAlias: p.ifAlias,
      golongan: portKind(p.ifType, p.ifName, p.ifSpeedBps),
      operStatus: p.operStatus,
      adminStatus: p.adminStatus,
      kecepatan: speedText(p.ifSpeedBps),
      lastSyncAt: p.lastSyncAt,
    }))
    .filter((p) => !golongan || p.golongan === golongan);
}
