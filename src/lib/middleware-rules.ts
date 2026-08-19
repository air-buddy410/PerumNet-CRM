// ── Keputusan penjagaan jalur — murni, bisa diuji tanpa server ──
//
// Dipisah dari `middleware.ts` karena berkas itu hanya berjalan di dalam
// runtime Next dan tidak pernah tersentuh `npm test`. Akibatnya nyata: bug
// yang diperbaiki Fase 96 hidup berbulan-bulan tanpa satu pun tes yang bisa
// menangkapnya, dan baru ketahuan lewat gambar avatar yang rusak.
//
// ## Dua macam "publik", dan membedakannya itu seluruh intinya
//
// Sebelum ini keduanya dicampur dalam satu daftar `PUBLIC_PATHS`, lalu
// diperlakukan dengan satu aturan:
//
//     kalau sudah login DAN jalurnya publik → lempar ke /dashboard
//
// Aturan itu benar untuk `/login`: orang yang sudah masuk tidak perlu melihat
// layar masuk lagi. Aturan itu SALAH TOTAL untuk jalur yang menyajikan data.
//
// `/api/avatar/<token>` masuk daftar yang sama, jadi setiap permintaan foto
// profil dari peramban yang sudah login dijawab dengan pengalihan ke
// `/dashboard` — dan yang diterima tag <img> adalah HTML 184 KB, bukan gambar.
// Hasilnya: SETIAP staf melihat ikon gambar rusak di tempat fotonya, selalu,
// sejak fitur itu ada.
//
// Yang membuatnya bertahan lama adalah cara ia gagal: permintaan ANONIM
// bekerja sempurna. `curl` tanpa cookie mendapat WebP 200. Jadi siapa pun yang
// menguji dari terminal — termasuk aku, berkali-kali — menyimpulkan endpointnya
// sehat. Yang rusak justru jalur yang dipakai orang sungguhan.
//
// Karena itu sekarang ada DUA daftar, dan namanya menjelaskan aturannya:
//
//   TERBUKA    — melayani siapa pun, login atau tidak. Tidak pernah dialihkan.
//   TAMU-SAJA  — hanya untuk yang BELUM masuk; yang sudah masuk dilempar.

/**
 * Jalur yang melayani siapa pun, dengan atau tanpa sesi.
 *
 * Penjagaannya ada di route/halamannya sendiri, bukan di sini:
 * `/api/avatar` dijaga tokennya yang acak penuh, `/verify` menyaring isinya
 * lewat `publicVerification()`, dan `/api/health` memang sengaja hampa.
 */
export const TERBUKA_PATHS = [
  // Foto profil dipasang aplikasi PerumNet lain lewat tag <img>, yang tidak
  // bisa mengirim header otentikasi.
  "/api/avatar/",
  // Halaman verifikasi kartu dipindai pelanggan di depan pintu — DAN oleh
  // pegawai yang sedang login di ponselnya sendiri. Melempar yang kedua ke
  // dasbor membuat kartu tidak bisa diperiksa oleh orang yang paling sering
  // memeriksanya.
  "/verify",
  "/api/verify/",
  // Dibaca Docker dan pengatur beban, yang tidak punya sesi.
  "/api/health",
];

/** Jalur yang hanya masuk akal bagi yang BELUM masuk. */
export const TAMU_SAJA_PATHS = ["/login"];

export type KeputusanJalur =
  /** Teruskan apa adanya. */
  | "lanjut"
  /** Belum masuk dan jalurnya butuh sesi — lempar ke layar masuk. */
  | "ke-login"
  /** Sudah masuk dan membuka layar masuk — lempar ke dasbor. */
  | "ke-dashboard";

const cocok = (pathname: string, daftar: string[]) =>
  daftar.some((p) => pathname === p || pathname.startsWith(p));

/**
 * Satu-satunya tempat aturan penjagaan jalur diputuskan.
 *
 * Urutannya menentukan: TERBUKA diperiksa LEBIH DULU, sebelum apa pun yang
 * bisa mengalihkan. Itu yang menjamin jalur penyaji data tidak pernah dijawab
 * dengan pengalihan, apa pun keadaan sesi peminta.
 */
export function keputusanJalur(input: {
  pathname: string;
  authenticated: boolean;
}): KeputusanJalur {
  if (cocok(input.pathname, TERBUKA_PATHS)) return "lanjut";
  if (cocok(input.pathname, TAMU_SAJA_PATHS)) {
    return input.authenticated ? "ke-dashboard" : "lanjut";
  }
  return input.authenticated ? "lanjut" : "ke-login";
}
