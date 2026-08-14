import { coordinateRejection } from "@/lib/recovery";

// ── Koordinat site jaringan (Fase 65) ───────────────────────────
//
// Kolom latitude/longitude ada di NetworkSite sejak lama dan DIBACA peta —
// loadNetworkMap() menyaring `latitude: { not: null }`. Tetapi tidak pernah
// ada jalur yang MENULISNYA: skema penyimpanannya tidak memuatnya, formnya
// tidak punya inputnya, dan payloadnya melewatinya. Akibatnya POP dan
// MINI_POP mustahil muncul di peta, apa pun yang dilakukan orang.
//
// Diletakkan di sini, bukan di berkas aksi, supaya aturannya bisa diuji
// tanpa sesi maupun basis data — dan supaya jalur lain yang kelak menyimpan
// site memakai aturan yang sama persis.

/**
 * Membaca lintang/bujur dari formulir site.
 *
 * Tiga keadaan yang dibedakan, dan pembedaan itulah gunanya:
 *
 *   field tidak ada    -> `undefined`, kolomnya tidak disentuh
 *   field ada, kosong  -> `null`, koordinatnya sengaja dihapus
 *   field ada, terisi  -> angka, setelah lolos coordinateRejection()
 *
 * Mengisi salah satu saja DITOLAK. Site berlintang tanpa bujur tidak akan
 * pernah muncul di peta — `loadNetworkMap()` menyaring keduanya — jadi orang
 * mengira sudah memasukkannya padahal titiknya tidak ada di mana pun.
 */
export function koordinatDariForm(
  formData: FormData
):
  | { ok: true; data: { latitude?: number | null; longitude?: number | null } }
  | { ok: false; error: string } {
  const adaLat = formData.has("latitude");
  const adaLng = formData.has("longitude");
  if (!adaLat && !adaLng) return { ok: true, data: {} };

  const baca = (k: string) => String(formData.get(k) ?? "").trim();
  const sLat = baca("latitude");
  const sLng = baca("longitude");

  if (!sLat && !sLng) return { ok: true, data: { latitude: null, longitude: null } };
  if (!sLat || !sLng) {
    return { ok: false, error: "Lintang dan bujur harus diisi keduanya, atau dikosongkan keduanya." };
  }

  const latitude = Number(sLat);
  const longitude = Number(sLng);
  const alasan = coordinateRejection({ latitude, longitude });
  if (alasan) return { ok: false, error: alasan };
  return { ok: true, data: { latitude, longitude } };
}

