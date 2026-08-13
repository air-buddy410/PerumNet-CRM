import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // Direktori build bisa dipisah lewat NEXT_DIST_DIR. Bawaannya tetap ".next",
  // jadi tidak ada yang berubah bagi pemakaian biasa.
  //
  // Gunanya saat dua proses bekerja pada satu working directory: build atau
  // dev server yang satu tidak lagi menimpa chunk milik yang lain. Itu pernah
  // terjadi dan gejalanya menyesatkan — "Cannot find module './5611.js'" yang
  // sama sekali tidak menunjuk ke penyebabnya.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Fase 57 — dibutuhkan untuk citra Docker: Next menyalin hanya berkas yang
  // benar-benar dipakai saat berjalan ke .next/standalone, sehingga citranya
  // tidak perlu memuat seluruh node_modules. Bedanya ratusan megabyte.
  //
  // Tidak berpengaruh pada `npm run dev` maupun `npm start` biasa.
  output: "standalone",
  // Fase 60 — batas ukuran badan Server Action.
  //
  // Bawaan Next hanya 1 MB, sementara pemeriksa unggahan kita mengizinkan 5 MB
  // (MAX_UPLOAD_BYTES dan AVATAR_MAX_BYTES). Selisih itu bukan sekadar angka:
  // berkas 2 MB ditolak Next SEBELUM kode kita berjalan, jadi yang dilihat
  // orang adalah halaman error putih dengan digest — bukan kalimat "Ukuran foto
  // maksimal 5MB" yang sudah kita siapkan. Foto ponsel hampir selalu di atas
  // 1 MB, jadi jalur yang gagal justru jalur yang normal.
  //
  // Aturannya: BATAS LUAR HARUS LEBIH LONGGAR DARI BATAS DALAM. Kalau tidak,
  // penolakan kita yang ramah tidak akan pernah terbaca siapa pun, dan setiap
  // kegagalan unggah menyamar sebagai aplikasi rusak. Kelebihannya menampung
  // ongkos pembungkus multipart dan field lain di form yang sama.
  //
  // Dijaga tes: tests/unit/upload-rules.test.ts
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
};

export default nextConfig;
