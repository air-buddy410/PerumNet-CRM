// ── Penyamaran data pribadi pelanggan (Fase 66) ─────────────────
//
// Lapisan ini MURNI: nilai masuk, nilai tersamar keluar. Tidak menyentuh
// basis data maupun sesi, jadi aturannya bisa diuji tanpa koneksi apa pun.
//
// Yang membedakannya dari cara aplikasi pembanding melakukan hal yang sama:
// di sana `maskIdentity` adalah KONVENSI LAPISAN TAMPILAN — dipanggil di
// dalam JSX tiap halaman. Akibatnya bisa ditebak, dan memang terjadi di
// kode mereka: fungsinya terdefinisi di dua tempat dengan karakter bintang
// yang berbeda, dan satu halaman menampilkan NIK tanpa penyamaran sama
// sekali karena penulisnya lupa memanggilnya.
//
// Di sini penjaganya diletakkan pada JALUR DATA. Halaman menerima baris yang
// SUDAH tersamar, dengan bentuk yang persis sama seperti sebelumnya, sehingga
// tidak ada yang perlu diingat dan tidak ada yang bisa dilupakan. Halaman baru
// aman secara bawaan, bukan aman kalau penulisnya ingat.

/** Karakter penyamar. Satu tempat, supaya tidak pernah bercabang. */
const BINTANG = "•";

/**
 * NIK: empat digit awal dan empat digit akhir tetap terlihat.
 *
 * Bagian TENGAH yang disembunyikan bukan pilihan sembarangan — enam digit di
 * tengah NIK adalah TANGGAL LAHIR pemiliknya (dengan hari +40 untuk
 * perempuan). Menyamarkan tepat bagian itu berarti nomornya masih bisa
 * dicocokkan sekilas oleh petugas, tetapi tanggal lahirnya tidak ikut bocor
 * ke layar siapa pun yang kebetulan lewat.
 *
 * Empat digit awal (kode provinsi & kabupaten) sengaja dibiarkan: itu sudah
 * sama untuk hampir seluruh pelanggan kita di Karangasem, jadi
 * menyembunyikannya tidak menambah perlindungan apa pun.
 */
export function maskIdentity(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = value.trim();
  if (!s) return null;
  // Nomor yang terlalu pendek untuk disamarkan sebagian disamarkan SELURUHNYA.
  // Menampilkan "12" apa adanya karena rumus potongnya kebetulan menghasilkan
  // string kosong adalah kegagalan yang paling mudah luput dari perhatian.
  if (s.length <= 8) return BINTANG.repeat(s.length);
  return `${s.slice(0, 4)}${BINTANG.repeat(s.length - 8)}${s.slice(-4)}`;
}

/** Telepon: hanya empat digit terakhir yang tersisa. */
export function maskPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = value.trim();
  if (!s) return null;
  if (s.length <= 4) return BINTANG.repeat(s.length);
  return `${BINTANG.repeat(Math.min(s.length - 4, 8))}${s.slice(-4)}`;
}

/**
 * Email: huruf pertama dan domainnya tetap terbaca.
 *
 * Domain dibiarkan karena ia jarang mengidentifikasi orang (gmail.com) dan
 * berguna untuk menebak apakah alamatnya masuk akal. Yang di depan @ itulah
 * yang biasanya berisi nama.
 */
export function maskEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = value.trim();
  if (!s) return null;
  const at = s.lastIndexOf("@");
  if (at <= 0) return BINTANG.repeat(Math.min(s.length, 8));
  const nama = s.slice(0, at);
  const domain = s.slice(at);
  if (nama.length <= 1) return `${nama}${BINTANG.repeat(4)}${domain}`;
  return `${nama[0]}${BINTANG.repeat(Math.min(nama.length - 1, 6))}${domain}`;
}

/** Bidang yang diperlakukan sebagai data pribadi. Daftar tertutup. */
export interface PiiPelanggan {
  identityNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  birthDate?: Date | null;
}

/**
 * Menyamarkan data pribadi pada satu baris pelanggan.
 *
 * Bentuk kembaliannya SAMA PERSIS dengan yang masuk — bidang yang sama, tipe
 * yang sama. Itu disengaja: halaman yang sudah ada tidak perlu diubah
 * sebarispun untuk menjadi aman, dan tidak ada percabangan tampilan
 * "kalau boleh lihat" yang harus dipelihara di puluhan tempat.
 *
 * `birthDate` ikut dikosongkan, dan ini melampaui aplikasi pembanding dengan
 * sengaja. Menyamarkan bagian tengah NIK tidak ada gunanya kalau tanggal
 * lahir yang justru dikodekan di sana ditampilkan utuh pada kolom sebelahnya.
 */
export function redactCustomer<T extends PiiPelanggan>(row: T, bolehLihat: boolean): T {
  if (bolehLihat) return row;
  const out = { ...row };
  if ("identityNumber" in out) out.identityNumber = maskIdentity(out.identityNumber);
  if ("phone" in out) out.phone = maskPhone(out.phone);
  if ("email" in out) out.email = maskEmail(out.email);
  if ("birthDate" in out) out.birthDate = null;
  return out;
}

export function redactCustomers<T extends PiiPelanggan>(rows: T[], bolehLihat: boolean): T[] {
  return bolehLihat ? rows : rows.map((r) => redactCustomer(r, false));
}
