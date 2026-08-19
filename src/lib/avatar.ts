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

/** Sisi persegi hasil pemrosesan. Cukup untuk layar retina, jauh lebih ringan. */
export const AVATAR_SIZE = 512;
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

// ── Area potong pilihan pengguna (Fase 95) ──────────────────────
//
// Sebelum ini foto profil dipotong otomatis dengan `position: "attention"` —
// sharp memilih bagian gambar yang paling "ramai". Pada potret tegak yang
// ramai justru BUKAN wajahnya: latar bermotif, kerah baju, atau pola kaus
// menang atas kulit wajah yang halus dan berkontras rendah.
//
// Diukur dengan gambar uji 600x1200, wajah di sepertiga atas dan motif
// berkontras tinggi di sepertiga bawah:
//
//     attention  → wajah  0,0% ikut · motif 32,6%
//     centre     → wajah  0,5% ikut · motif  8,3%
//     top        → wajah 12,5% ikut · motif  0,0%
//
// `attention` membuang wajahnya SEPENUHNYA. Karena itu orang mengunggah
// potret lalu mendapat foto badannya sendiri.

export interface AvatarCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Sisi terpendek yang masih layak, dalam piksel gambar SUMBER.
 *
 * Lebih kecil dari ini akan diperbesar untuk mengisi 512x512 dan hasilnya
 * pecah. Angkanya setengah AVATAR_SIZE: memperbesar 2x masih wajar, lebih
 * dari itu tidak.
 */
export const AVATAR_CROP_MIN_SIDE = AVATAR_SIZE / 2;

/** Alasan potongan ditolak, atau null bila boleh dipakai. */
export function avatarCropRejection(
  c: AvatarCrop,
  sumber: { width: number; height: number }
): string | null {
  const nilai = [c.x, c.y, c.width, c.height];
  if (nilai.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
    return "Area potong tidak terbaca. Geser ulang kotaknya.";
  }
  if (c.width <= 0 || c.height <= 0) return "Area potong kosong. Geser ulang kotaknya.";
  if (c.x < 0 || c.y < 0) return "Area potong keluar dari foto.";
  // Toleransi kecil: pembulatan pecahan di peramban sering menghasilkan
  // 1.0000000000000002, dan menolaknya hanya membuat orang bingung.
  if (c.x + c.width > 1.0001 || c.y + c.height > 1.0001) {
    return "Area potong keluar dari foto.";
  }
  const lebar = Math.round(c.width * sumber.width);
  const tinggi = Math.round(c.height * sumber.height);
  if (lebar < AVATAR_CROP_MIN_SIDE || tinggi < AVATAR_CROP_MIN_SIDE) {
    return (
      `Area potong terlalu kecil (${lebar}x${tinggi} piksel). ` +
      `Perbesar kotaknya, minimal ${AVATAR_CROP_MIN_SIDE}x${AVATAR_CROP_MIN_SIDE} — ` +
      "kalau lebih kecil, wajahnya pecah saat ditampilkan."
    );
  }
  return null;
}

/**
 * Rasio bidang potong foto profil: 1, karena keluarannya persegi.
 *
 * Ada sebagai fungsi — bukan konstanta telanjang — supaya bentuknya sama
 * dengan `cardPhotoAspect()`. Komponen pemotong bisa menerima keduanya lewat
 * satu prop yang sama tanpa tahu ia sedang memotong foto kartu atau foto
 * profil.
 */
export function avatarAspect(): number {
  return 1;
}
