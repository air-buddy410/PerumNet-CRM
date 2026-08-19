import crypto from "node:crypto";

// ── Foto profil (Fase 59) ───────────────────────────────────────
//
// SENGAJA terpisah dari foto resmi pegawai, dan pemisahan itu bukan kerapian.
//
// `Employee.photoAttachmentId` adalah foto RESMI milik HRD: dicetak di kartu
// pegawai dan ditampilkan di halaman verifikasi publik yang dipindai pelanggan
// di depan pintunya. Kalau orang bisa menggantinya sendiri, verifikasi kartu
// kehilangan seluruh artinya — siapa pun bisa menukar wajah di kartunya, dan
// pelanggan melihat wajah yang salah persis saat ia sedang mencoba memastikan.
//
// Yang di sini milik orangnya sendiri, dan hanya untuk tampilan aplikasi.

export const AVATAR_MIME = "image/webp";
export const AVATAR_TOKEN_BYTES = 24;

/**
 * Token buram untuk menyajikan foto ke aplikasi PerumNet lain.
 *
 * Tidak mengandung nama, email, maupun id — jadi URL-nya boleh ditempel di mana
 * pun tanpa membocorkan siapa yang bekerja di sini. Dan karena acak penuh, ia
 * tidak bisa dipakai menelusuri daftar pegawai dengan menebak.
 */
export function newAvatarToken(): string {
  return crypto.randomBytes(AVATAR_TOKEN_BYTES).toString("base64url");
}

/** Alamat foto profil, atau null bila belum ada. */
export function avatarPath(token: string | null): string | null {
  return token ? `/api/avatar/${token}` : null;
}

/**
 * Inisial dari nama, untuk ditampilkan saat foto profil belum ada.
 *
 * Jatuhnya HARUS ke inisial, bukan ke foto resmi pegawai — menampilkan foto
 * resmi di tempat foto profil membuat orang mengira foto kartunya bisa mereka
 * ganti sendiri.
 */
export function initialsOf(name: string): string {
  const kata = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!kata.length) return "?";
  if (kata.length === 1) return kata[0].slice(0, 2).toUpperCase();
  return (kata[0][0] + kata[kata.length - 1][0]).toUpperCase();
}

/**
 * Alasan penolakan berkas foto profil, atau null bila boleh diproses.
 *
 * Pemeriksaan MIME, ukuran, dan magic byte tetap dilakukan mesin lampiran yang
 * sudah ada. Yang di sini khusus foto profil: hanya gambar, dan hanya format
 * yang benar-benar bisa dibaca ulang.
 */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_INPUT_MIME = ["image/jpeg", "image/png", "image/webp"];

export function avatarRejection(file: { type: string; size: number }): string | null {
  if (file.size <= 0) return "Berkas kosong.";
  if (file.size > AVATAR_MAX_BYTES) {
    return `Ukuran foto maksimal ${Math.round(AVATAR_MAX_BYTES / 1024 / 1024)}MB.`;
  }
  if (!AVATAR_INPUT_MIME.includes(file.type)) {
    return "Foto harus berformat JPG, PNG, atau WebP.";
  }
  return null;
}

// Geometri potong dipindah ke `avatar-crop.ts` supaya bisa diimpor komponen
// klien — berkas ini memuat `node:crypto` dan tidak boleh masuk bundel
// peramban. Di-re-export di sini supaya kode server yang sudah ada tidak perlu
// tahu perpindahannya.
export {
  AVATAR_SIZE,
  AVATAR_CROP_MIN_SIDE,
  avatarAspect,
  avatarCropRejection,
  type AvatarCrop,
} from "@/lib/avatar-crop";
