// ── Geometri potong foto profil — AMAN UNTUK KLIEN ──────────────
//
// Berkas ini SENGAJA tidak mengimpor apa pun. Itu bukan kebetulan gaya:
// `avatar.ts` mengimpor `node:crypto` untuk menerbitkan token, dan komponen
// "use client" yang mengimpornya akan menyeret modul Node itu ke bundel
// peramban.
//
// Akibatnya nyata dan sudah terjadi: saat pemotong foto profil dibuat, aturan
// penolakan terpaksa DISALIN ke dalam komponen karena `@/lib/avatar` tidak
// bisa diimpor dari klien. Dua salinan aturan yang sama akan menyimpang, dan
// yang menyimpang di sini berarti kotak potong di layar memperbolehkan sesuatu
// yang ditolak server — atau sebaliknya. Orang menggeser-geser kotak tanpa
// pernah tahu kenapa.
//
// Polanya menyalin `employee-card.ts`, yang juga nol impor dan karena itu bisa
// dipakai `employee-photo-cropper.tsx` sejak awal.
//
// JANGAN menambahkan impor apa pun ke berkas ini.

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

/** Sisi persegi hasil pemrosesan. Cukup untuk layar retina, jauh lebih ringan. */
export const AVATAR_SIZE = 512;

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
