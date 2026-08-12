// ── Kembali ke halaman asal setelah aksi penarikan (Fase 48) ────
// Modul MURNI.
//
// Masalahnya: seluruh aksi penarikan dulu selalu kembali ke halaman
// backoffice, sehingga teknisi yang bekerja dari /portal/recoveries terlempar
// keluar dari portalnya setiap kali menekan tombol — dan halaman tujuannya pun
// sering tertutup untuknya sejak Fase 40.
//
// Form mengirim `origin`, TETAPI yang dikirim hanyalah TOKEN, bukan URL.
// Alamatnya disusun di sini dari daftar tertutup. Menerima URL dari form akan
// membuka celah open redirect: satu tautan bertuliskan
// `?origin=https://situs-palsu` sudah cukup untuk melempar teknisi ke halaman
// login tiruan sambil terlihat berasal dari CRM.
//
// Dipisahkan dari actions.ts karena berkas "use server" hanya boleh
// mengekspor fungsi async — dan karena aturan sepenting ini pantas diuji
// tanpa memuat seluruh lapisan action.

const ORIGINS = {
  portal: (id: string) => `/portal/recoveries/${id}`,
  backoffice: (id: string) => `/inventory/device-recoveries/${id}`,
} as const;

export type RecoveryOrigin = keyof typeof ORIGINS;

/**
 * Token asal → path internal.
 *
 * Nilai asing jatuh ke backoffice alih-alih ditolak: aksinya sendiri sudah
 * berhasil saat fungsi ini dipanggil, jadi menggagalkan seluruh permintaan
 * hanya karena token tujuannya aneh akan membuang pekerjaan yang sah.
 */
export function resolveOrigin(raw: string | null | undefined, id: string): string {
  const key = String(raw ?? "").trim().toLowerCase();
  const builder = (ORIGINS as Record<string, (i: string) => string>)[key];
  return (builder ?? ORIGINS.backoffice)(id);
}
