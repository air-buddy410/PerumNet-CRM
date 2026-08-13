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
};

export default nextConfig;
