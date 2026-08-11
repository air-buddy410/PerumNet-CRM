/**
 * Penyiapan database untuk tes integrasi.
 *
 * URL tes DITURUNKAN dari DATABASE_URL yang sudah ada, bukan ditulis ulang di
 * berkas — supaya kredensial tidak pernah tersalin ke dalam repo dan tetap
 * benar walau kredensial dev diganti.
 *
 * Pengaman utamanya ada di `assertTestDatabase()`: modul ini MENOLAK berjalan
 * bila nama database tidak berakhiran `_test`. Tanpa itu, satu salah ketik
 * environment bisa membuat seluruh tes ini menghapus data dev.
 */

export const TEST_DB_SUFFIX = "_test";

/** Mengganti nama database pada sebuah URL koneksi. */
export function withDatabaseName(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

export function databaseNameOf(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

/** Nama database tes yang diturunkan dari database dev. */
export function testDatabaseName(devUrl: string): string {
  const base = databaseNameOf(devUrl).replace(/_dev$/, "");
  return `${base}${TEST_DB_SUFFIX}`;
}

/**
 * Menolak berjalan bila DATABASE_URL bukan database tes.
 *
 * Sengaja melempar, bukan sekadar melewati tes: tes integrasi yang diam-diam
 * tidak berjalan memberi rasa aman palsu, sedangkan yang berjalan di database
 * salah menghancurkan data. Keduanya harus berisik.
 */
export function assertTestDatabase(url: string | undefined): string {
  if (!url) {
    throw new Error(
      "DATABASE_URL tidak di-set. Jalankan lewat `npm run test:integration`, " +
        "bukan `tsx --test` langsung."
    );
  }
  const name = databaseNameOf(url);
  if (!name.endsWith(TEST_DB_SUFFIX)) {
    throw new Error(
      `Menolak berjalan: database "${name}" bukan database tes. ` +
        `Tes integrasi menghapus data, jadi hanya database berakhiran ` +
        `"${TEST_DB_SUFFIX}" yang diterima.`
    );
  }
  return url;
}
