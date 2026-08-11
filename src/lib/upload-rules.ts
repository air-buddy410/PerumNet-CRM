// ── Aturan validasi berkas unggahan (PRD terminasi §15) ─────────
// Modul MURNI: tidak menyentuh filesystem maupun database, supaya aturan
// yang menahan berkas berbahaya bisa diuji tanpa benar-benar menulis file.
//
// §15 menuntut tiga lapis: MIME, ukuran, DAN extension. Ketiganya perlu
// karena masing-masing bisa dibohongi sendiri-sendiri:
//  - `file.type` dikirim browser, jadi sepenuhnya dikendalikan pengunggah.
//  - extension bisa disamarkan (foto.png yang isinya HTML).
//  - karena itu isi berkas ikut diperiksa lewat magic bytes (§19.3
//    "File MIME palsu").

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/// MIME yang diizinkan beserta extension yang sah untuknya. Dipasangkan,
/// bukan dua daftar terpisah — supaya "image/png" bernama .php tidak lolos
/// hanya karena keduanya kebetulan ada di daftar masing-masing.
export const ALLOWED_UPLOADS: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
};

export interface UploadCandidate {
  name: string;
  type: string;
  size: number;
}

/** Extension huruf kecil dari sebuah nama berkas, tanpa menyentuh path. */
export function safeExtension(filename: string): string {
  // Hanya potongan setelah titik TERAKHIR pada nama dasar yang diambil, dan
  // hanya bila isinya huruf/angka. Ini menutup nama seperti "a.pn/g" atau
  // "../../x" sebelum sempat menyentuh path apa pun.
  const base = filename.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  const ext = base.slice(dot).toLowerCase();
  return /^\.[a-z0-9]+$/.test(ext) ? ext : "";
}

/** Alasan penolakan, atau null bila berkas boleh diterima. */
export function uploadRejection(file: UploadCandidate): string | null {
  if (file.size <= 0) return "File kosong.";
  if (file.size > MAX_UPLOAD_BYTES) {
    return `Ukuran file maksimal ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`;
  }
  const allowedExts = ALLOWED_UPLOADS[file.type];
  if (!allowedExts) {
    return "Tipe file harus JPG, PNG, WebP, atau PDF.";
  }
  const ext = safeExtension(file.name);
  if (!ext) return "Nama file harus memiliki ekstensi yang jelas.";
  if (!allowedExts.includes(ext)) {
    return `Ekstensi ${ext} tidak cocok dengan tipe file ${file.type}.`;
  }
  return null;
}

/// Tanda tangan byte awal tiap format. Dipakai untuk menolak berkas yang
/// MIME-nya dibohongi — pemeriksaan terakhir sebelum berkas ditulis.
const MAGIC: { mime: string; test: (b: Uint8Array) => boolean }[] = [
  { mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: "image/png",
    test: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    // RIFF....WEBP
    mime: "image/webp",
    test: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  {
    mime: "application/pdf",
    test: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  },
];

/** MIME sebenarnya menurut isi berkas, atau null bila tidak dikenali. */
export function sniffMime(bytes: Uint8Array): string | null {
  for (const m of MAGIC) {
    if (m.test(bytes)) return m.mime;
  }
  return null;
}

/**
 * Apakah isi berkas cocok dengan MIME yang diakui pengunggah?
 *
 * Dipisah dari `uploadRejection` karena butuh isi berkas, sedangkan
 * pemeriksaan lain cukup dari metadata.
 */
export function contentMismatch(declaredMime: string, bytes: Uint8Array): string | null {
  const actual = sniffMime(bytes);
  if (!actual) return "Isi file tidak dikenali sebagai gambar atau PDF yang sah.";
  if (actual !== declaredMime) {
    return `Isi file sebenarnya ${actual}, bukan ${declaredMime} seperti yang dinyatakan.`;
  }
  return null;
}
