// ── Brankas kredensial perangkat (Fase 91) ──────────────────────
//
// Lapisan MURNI. Tidak menyentuh basis data, tidak menyentuh jaringan.
//
// MASALAH YANG DIPECAHKAN. Sampai sekarang kredensial perangkat memakai pola
// Fase 13: basis data menyimpan NAMA env var, nilainya di `.env` server. Itu
// aman, tetapi menuntut IT menyunting berkas dan memuat ulang kontainer setiap
// kali NOC menambah satu perangkat — dan NOC tidak boleh bergantung pada itu
// untuk pekerjaan hariannya.
//
// KENAPA TIDAK DISIMPAN APA ADANYA. Sandi perangkat yang tersimpan terbaca
// ikut ke SETIAP cadangan basis data, setiap dump, setiap salinan untuk
// pengembangan. Satu bocor berarti semua bocor — dan sistem lama sudah
// menunjukkan akhir cerita itu: ia menampilkan sandi pelanggan terang-terangan
// di layar adminnya.
//
// JALAN TENGAHNYA. Sandi disimpan TERENKRIPSI di basis data; kunci pembukanya
// satu-satunya ada di environment. Cadangan yang bocor tanpa kuncinya
// menghasilkan teks acak. NOC menambah perangkat lewat layar; IT memasang satu
// kunci sekali, bukan satu variabel per perangkat.
//
// AES-256-GCM dipilih karena ia sekaligus MENYEGEL: sandi yang diubah orang
// langsung di basis data gagal dibuka, bukan diam-diam terpakai sebagai sandi
// yang salah lalu menghitung percobaan gagal di perangkatnya.

import crypto from "node:crypto";

export class RahasiaError extends Error {}

/** Nama env var berisi kunci utama — 64 heksadesimal (32 bita). */
export const ENV_KUNCI = "DEVICE_CRED_KEY";

export interface Tersegel {
  /** Teks tersandi, base64. */
  cipher: string;
  /** Nonce acak per catatan, base64. Tidak rahasia, tetapi tidak boleh berulang. */
  iv: string;
  /** Tanda segel GCM, base64. Yang membuat perubahan diam-diam ketahuan. */
  tag: string;
}

function kunci(): Buffer {
  const raw = process.env[ENV_KUNCI];
  if (!raw) {
    throw new RahasiaError(
      `${ENV_KUNCI} belum diatur. Buat sekali dengan: openssl rand -hex 32 — ` +
        `dan pasang di .env server. Tanpa itu kredensial perangkat tidak bisa dibaca maupun disimpan.`
    );
  }
  const b = Buffer.from(raw.trim(), "hex");
  if (b.length !== 32) {
    // Panjangnya disebut, ISINYA tidak — pesan galat yang mengutip kunci
    // menaruh kunci itu di log selamanya.
    throw new RahasiaError(`${ENV_KUNCI} harus 64 karakter heksadesimal (32 bita); yang ada ${b.length} bita.`);
  }
  return b;
}

/** Apakah kunci utama tersedia — dipakai layar untuk memberi tahu lebih awal. */
export function kunciSiap(): boolean {
  try {
    kunci();
    return true;
  } catch {
    return false;
  }
}

export function segel(teks: string): Tersegel {
  if (!teks) throw new RahasiaError("Tidak ada yang disegel.");
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", kunci(), iv);
  const cipher = Buffer.concat([c.update(teks, "utf8"), c.final()]);
  return {
    cipher: cipher.toString("base64"),
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
  };
}

export function buka(t: Tersegel): string {
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", kunci(), Buffer.from(t.iv, "base64"));
    d.setAuthTag(Buffer.from(t.tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(t.cipher, "base64")), d.final()]).toString("utf8");
  } catch (e) {
    if (e instanceof RahasiaError) throw e;
    // Dua sebab, satu pesan — dan keduanya menuntut tindakan yang sama:
    // isi ulang kredensialnya. Membedakannya tidak menolong siapa pun kecuali
    // orang yang sedang menebak kuncinya.
    throw new RahasiaError(
      "Kredensial tidak bisa dibuka — kuncinya berbeda dari saat disimpan, atau catatannya berubah. " +
        "Isi ulang kredensial perangkat ini dari layar."
    );
  }
}

// ── Bentuk kredensial ───────────────────────────────────────────

export type Protokol = "TELNET" | "SSH";

export const PROTOKOL: readonly Protokol[] = ["TELNET", "SSH"];

/** Port bawaan tiap protokol — dipakai layar sebagai saran, bukan paksaan. */
export const PORT_BAWAAN: Record<Protokol, number> = { TELNET: 23, SSH: 22 };

export interface MasukanKredensial {
  protokol: string;
  port: number | null;
  username: string;
  sandi: string;
}

/**
 * Memeriksa masukan dari layar sebelum apa pun disimpan.
 *
 * Sandi TIDAK pernah ikut di pesan galat, sekalipun untuk mengatakan
 * bentuknya salah.
 */
export function periksaMasukan(m: MasukanKredensial): string | null {
  if (!PROTOKOL.includes(m.protokol as Protokol)) {
    return `Protokol "${m.protokol}" tidak dikenal. Pilih TELNET atau SSH.`;
  }
  if (!m.username?.trim()) return "Nama pengguna wajib diisi.";
  if (/\s/.test(m.username.trim())) return "Nama pengguna tidak boleh memuat spasi.";
  if (!m.sandi) return "Kata sandi wajib diisi.";
  if (m.port !== null && (!Number.isInteger(m.port) || m.port < 1 || m.port > 65535)) {
    return "Port harus antara 1 dan 65535.";
  }
  return null;
}
