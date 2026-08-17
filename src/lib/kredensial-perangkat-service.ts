// ── Membaca & menyimpan kredensial perangkat (Fase 91) ──────────
//
// Aturan kriptonya ada di `rahasia-perangkat.ts` dan sudah diuji tanpa basis
// data.
//
// DUA SUMBER, SATU URUTAN. Brankas basis data dibaca LEBIH DULU; env var lama
// (`OltDevice.credentialRef`) menjadi cadangan. Urutannya begitu supaya NOC
// yang mengisi lewat layar langsung berlaku tanpa menunggu siapa pun, sementara
// lima perangkat yang sudah berjalan lewat `.env` tidak perlu disentuh sama
// sekali.
//
// SANDI TIDAK PERNAH KELUAR DARI BERKAS INI ke arah layar. `loadKredensial`
// mengembalikan metadata saja — protokol, port, nama pengguna, kapan terakhir
// terbukti. Yang membuka segelnya hanya `pakaiKredensial`, dan itu dipanggil
// oleh pembaca perangkat, bukan oleh halaman.

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  segel,
  buka,
  periksaMasukan,
  PORT_BAWAAN,
  RahasiaError,
  type Protokol,
  type MasukanKredensial,
} from "@/lib/rahasia-perangkat";

/** Yang boleh dilihat layar. Tidak ada sandi di sini, dengan sengaja. */
export interface KredensialTampil {
  ada: boolean;
  protokol: Protokol | null;
  port: number | null;
  username: string | null;
  sumber: "BRANKAS" | "ENV" | "BELUM ADA";
  terakhirTerbukti: Date | null;
  diperbaruiOleh: string | null;
  diperbaruiPada: Date | null;
}

export async function loadKredensial(networkDeviceId: string): Promise<KredensialTampil> {
  const k = await db.deviceCredential.findUnique({
    where: { networkDeviceId },
    select: {
      protocol: true, port: true, username: true, lastVerifiedAt: true,
      updatedAt: true, updatedBy: { select: { name: true } },
    },
  });
  if (k) {
    return {
      ada: true,
      protokol: k.protocol as Protokol,
      port: k.port,
      username: k.username,
      sumber: "BRANKAS",
      terakhirTerbukti: k.lastVerifiedAt,
      diperbaruiOleh: k.updatedBy.name,
      diperbaruiPada: k.updatedAt,
    };
  }

  // Cadangan: pola lama env var per perangkat.
  const olt = await db.oltDevice.findUnique({
    where: { networkDeviceId },
    select: { credentialRef: true, telnetPort: true },
  });
  const ref = olt?.credentialRef?.trim();
  const adaEnv = !!ref && ref !== "LIBRENMS_API_TOKEN" && !!process.env[ref];
  if (adaEnv) {
    return {
      ada: true,
      protokol: "TELNET",
      port: olt?.telnetPort ?? PORT_BAWAAN.TELNET,
      username: (process.env[ref!] ?? "").split(":")[0] || null,
      sumber: "ENV",
      terakhirTerbukti: null,
      diperbaruiOleh: null,
      diperbaruiPada: null,
    };
  }

  return {
    ada: false, protokol: null, port: null, username: null,
    sumber: "BELUM ADA", terakhirTerbukti: null, diperbaruiOleh: null, diperbaruiPada: null,
  };
}

/** Kredensial siap pakai. HANYA untuk pembaca perangkat, bukan untuk layar. */
export interface KredensialPakai {
  protokol: Protokol;
  port: number;
  user: string;
  password: string;
}

export async function pakaiKredensial(
  networkDeviceId: string,
  portCadangan?: number | null
): Promise<KredensialPakai> {
  const k = await db.deviceCredential.findUnique({
    where: { networkDeviceId },
    select: { protocol: true, port: true, username: true, secretCipher: true, secretIv: true, secretTag: true },
  });
  if (k) {
    return {
      protokol: k.protocol as Protokol,
      port: k.port,
      user: k.username,
      password: buka({ cipher: k.secretCipher, iv: k.secretIv, tag: k.secretTag }),
    };
  }

  const olt = await db.oltDevice.findUnique({
    where: { networkDeviceId },
    select: { credentialRef: true, telnetPort: true },
  });
  const ref = olt?.credentialRef?.trim();
  if (!ref || ref === "LIBRENMS_API_TOKEN") {
    throw new RahasiaError(
      "Perangkat ini belum punya kredensial. Isi dari layar perangkat — tidak perlu menyentuh berkas apa pun."
    );
  }
  const raw = process.env[ref];
  if (!raw) throw new RahasiaError(`Env var ${ref} belum terisi di proses ini.`);
  const pisah = raw.indexOf(":");
  if (pisah < 1) throw new RahasiaError(`Isi ${ref} harus berbentuk "user:password".`);
  return {
    protokol: "TELNET",
    port: olt?.telnetPort ?? portCadangan ?? PORT_BAWAAN.TELNET,
    user: raw.slice(0, pisah),
    password: raw.slice(pisah + 1),
  };
}

/**
 * Menyimpan kredensial dari layar.
 *
 * Sandinya disegel SEBELUM menyentuh basis data, dan tidak pernah dicatat di
 * audit — yang dicatat hanya bahwa ia diubah, oleh siapa, untuk perangkat mana.
 */
export async function simpanKredensial(
  networkDeviceId: string,
  m: MasukanKredensial,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const salah = periksaMasukan(m);
  if (salah) return { ok: false, error: salah };

  const perangkat = await db.networkDevice.findUnique({
    where: { id: networkDeviceId },
    select: { hostname: true },
  });
  if (!perangkat) return { ok: false, error: "Perangkat tidak ditemukan." };

  const protokol = m.protokol as Protokol;
  const port = m.port ?? PORT_BAWAAN[protokol];

  let disegel;
  try {
    disegel = segel(m.sandi);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  await db.deviceCredential.upsert({
    where: { networkDeviceId },
    update: {
      protocol: protokol, port, username: m.username.trim(),
      secretCipher: disegel.cipher, secretIv: disegel.iv, secretTag: disegel.tag,
      // Sandi berganti → bukti lama tidak berlaku lagi.
      lastVerifiedAt: null,
      updatedById: userId,
    },
    create: {
      networkDeviceId, protocol: protokol, port, username: m.username.trim(),
      secretCipher: disegel.cipher, secretIv: disegel.iv, secretTag: disegel.tag,
      updatedById: userId,
    },
  });

  await logAudit({
    userId,
    action: "DEVICE_CREDENTIAL_SET",
    module: "noc",
    entityType: "NetworkDevice",
    entityId: networkDeviceId,
    description: `Kredensial ${protokol} perangkat ${perangkat.hostname} disimpan (pengguna "${m.username.trim()}", port ${port}).`,
  });
  return { ok: true };
}

/** Menandai kredensial terbukti berhasil — dipanggil sesudah uji login lolos. */
export async function tandaiTerbukti(networkDeviceId: string): Promise<void> {
  await db.deviceCredential.updateMany({
    where: { networkDeviceId },
    data: { lastVerifiedAt: new Date() },
  });
}

export async function hapusKredensial(networkDeviceId: string, userId: string): Promise<void> {
  const perangkat = await db.networkDevice.findUnique({
    where: { id: networkDeviceId }, select: { hostname: true },
  });
  await db.deviceCredential.deleteMany({ where: { networkDeviceId } });
  await logAudit({
    userId,
    action: "DEVICE_CREDENTIAL_DELETE",
    module: "noc",
    entityType: "NetworkDevice",
    entityId: networkDeviceId,
    description: `Kredensial perangkat ${perangkat?.hostname ?? networkDeviceId} dihapus.`,
  });
}
