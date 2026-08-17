// ── Membaca daya optik ONU langsung dari OLT (Fase 88b) ─────────
//
// Lapisan MURNI. Tidak menyentuh jaringan; yang menyentuh ada di
// `onu-optical-service.ts`.
//
// BAGAIMANA INI DITEMUKAN, supaya penerusnya tidak mengulang jalannya.
// LibreNMS tidak menarik daya ONU (sensornya cuma SFP router), vendor sistem
// lama tidak bisa ditanya, dan menebak OID dari ingatan gagal — OID ZXA10
// klasik dicoba di C600 dan dijawab "No Such Object". Yang membuka jalan
// adalah mencobanya DI PERANGKAT YANG TEPAT: C300 Pesagi menjawab, lengkap
// dengan tabel NAMA ONU yang diisi operator dengan username pelanggan.
// Dua tabel itu — nama dan daya — dikunci indeks yang sama, dan nama yang
// cocok dengan `pppoeUsername` kita adalah bukti pemetaannya benar.
//
// APA YANG DIDUKUNG, dan kenapa hanya itu:
//
//   ZTE C300   ✓ SNMP — tabel `zxAnPonRmOnu` hidup, terverifikasi
//   ZTE C600   ✗ firmware ini tidak memancarkan DDM ONU lewat SNMP sama
//                sekali (seluruh 3902.3 + 3902.1082 + 3902.1015 dijelajahi;
//                tidak ada antarmuka ONU di IF-MIB, tidak ada kolom ber-bentuk
//                dBm selain ambang alarm) — jalannya CLI telnet, menunggu
//                kredensial
//   HSGQ G008  ✗ pohon 50224 dijelajahi penuh: tabel ONU ada (nama, vendor,
//                model) tetapi tanpa kolom optik — jalannya juga CLI
//
// Menampilkan "belum didukung" untuk C600/HSGQ adalah kejujuran, bukan
// kekurangan: panel yang mengarang angka lebih buruk daripada panel yang
// mengaku tidak tahu.

import type { PosisiOnu } from "@/lib/onu-import";

/** OID dasar tabel C300 (ZXA10 V2.1). */
export const OID_C300 = {
  /** Daya terima ONU. Indeks: `{ponIfIndex}.{onuId}.1`. */
  rx: "1.3.6.1.4.1.3902.1012.3.50.12.1.1.10",
  /** Nama ONU yang diketik operator. Indeks: `{ponIfIndex}.{onuId}`. */
  nama: "1.3.6.1.4.1.3902.1012.3.28.1.1.2",
} as const;

/**
 * ifIndex port PON pada C300.
 *
 * Rumusnya diverifikasi terhadap data sungguhan, bukan diambil dari dokumen:
 * indeks `268566784` yang muncul di tabel RX terurai menjadi
 * `268435456 + slot·65536 + port·256` untuk slot 2 port 1 — persis
 * `gpon_1/2/1`, port PON pertama Pesagi. Rak tidak ikut dihitung; seluruh
 * jaringan ini rak 1.
 */
export function ifIndexPonC300(slot: number, port: number): number {
  return 268435456 + slot * 65536 + port * 256;
}

/** OID lengkap nilai RX seorang ONU pada C300. */
export function oidRxC300(p: PosisiOnu): string {
  return `${OID_C300.rx}.${ifIndexPonC300(p.slot, p.port)}.${p.index}.1`;
}

/** OID lengkap nama ONU pada C300 — dipakai memverifikasi pemetaan. */
export function oidNamaC300(p: PosisiOnu): string {
  return `${OID_C300.nama}.${ifIndexPonC300(p.slot, p.port)}.${p.index}`;
}

// ── Penyandian nilai ────────────────────────────────────────────

/** Batas nilai yang masuk akal untuk daya terima ONU GPON. */
const DBM_MIN = -45;
const DBM_MAKS = -8;

export interface BacaanRx {
  dBm: number | null;
  /** Kalau null, kenapa. */
  alasan: string | null;
}

/**
 * Nilai mentah C300 → dBm.
 *
 * Penyandiannya `raw × 0.002 − 30`. Diverifikasi lewat sebaran, bukan
 * dipercaya begitu saja: dari 352 ONU sungguhan, 335 jatuh di −8…−45 dBm
 * setelah konversi — rentang kerja GPON. Tujuh belas sisanya nilai sentinel
 * dari ONU yang sedang tidak membaca.
 *
 * NOL DITOLAK meski hasil konversinya (−30 dBm) berada di rentang sah. Nol
 * adalah "tidak ada pembacaan", dan −30 dBm adalah sinyal yang nyaris putus —
 * menampilkan yang pertama sebagai yang kedua akan mengirim teknisi memeriksa
 * serat yang sebenarnya cuma ONU-nya sedang mati.
 */
export function bacaRxC300(raw: number): BacaanRx {
  if (!Number.isFinite(raw) || raw <= 0) {
    return { dBm: null, alasan: "ONU tidak memberikan pembacaan — kemungkinan sedang mati." };
  }
  const dBm = raw * 0.002 - 30;
  if (dBm < DBM_MIN || dBm > DBM_MAKS) {
    return { dBm: null, alasan: `Nilai mentah ${raw} di luar rentang kerja GPON — dibuang, bukan ditampilkan.` };
  }
  return { dBm: Math.round(dBm * 100) / 100, alasan: null };
}

// ── Penilaian ───────────────────────────────────────────────────

export type MutuSinyal = "BAGUS" | "WASPADA" | "KRITIS";

/**
 * Ambang GPON kelas B+: penerima ONU sanggup sampai sekitar −28 dBm.
 * Di bawah itu sambungan mulai putus-putus SEBELUM mati sepenuhnya — dan
 * justru rentang itulah yang paling berharga diketahui lebih dulu.
 */
export function nilaiMutu(dBm: number): MutuSinyal {
  if (dBm >= -25) return "BAGUS";
  if (dBm >= -28) return "WASPADA";
  return "KRITIS";
}

export function keteranganMutu(m: MutuSinyal): string {
  switch (m) {
    case "BAGUS":
      return "Sinyal sehat.";
    case "WASPADA":
      return "Mendekati batas penerima — layak dijadwalkan pemeriksaan sebelum putus-putus.";
    case "KRITIS":
      return "Di bawah batas penerima GPON — sambungan kemungkinan sudah tidak stabil.";
  }
}

// ── Jalur CLI: ZTE C600 dan HSGQ (Fase 88b lanjutan) ────────────
//
// Ditemukan 17 Agustus 2026 dengan menjelajah konsolnya langsung, sebab kedua
// firmware ini tidak memancarkan DDM lewat SNMP:
//
//   ZTE C600 : `show pon power onu-rx gpon_onu-1/17/3:2`
//              → `gpon_onu-1/17/3:2    -18.292(dbm)`
//   HSGQ     : `interface gpon 6` lalu `show ont-optical 1`
//              → `Receive power(dBm)   :-17.2720`
//
// Nilainya SUDAH dBm — beda dari SNMP C300 yang tersandi 0.002x−30. Penjaga
// rentangnya tetap sama: angka di luar jendela kerja GPON dibuang, bukan
// ditampilkan.

/** Batas bersama untuk nilai yang sudah berbentuk dBm. */
export function sahkanDbm(dBm: number): BacaanRx {
  if (!Number.isFinite(dBm)) {
    return { dBm: null, alasan: "Perangkat tidak memberikan angka." };
  }
  if (dBm < -45 || dBm > -8) {
    return { dBm: null, alasan: `Nilai ${dBm} dBm di luar rentang kerja GPON — dibuang, bukan ditampilkan.` };
  }
  return { dBm: Math.round(dBm * 100) / 100, alasan: null };
}

/** Perintah pembaca RX pada ZTE (C600 maupun C300 lewat CLI). */
export function perintahRxZte(p: PosisiOnu): string {
  return `show pon power onu-rx gpon_onu-1/${p.slot}/${p.port}:${p.index}`;
}

/**
 * Membaca jawaban `show pon power onu-rx`.
 *
 * Bentuk sungguhannya: `gpon_onu-1/17/3:2    -18.292(dbm)`. ONU yang tidak
 * dikenal dijawab kalimat galat tanpa angka — dan itu dikembalikan sebagai
 * "tidak ditemukan", bukan diarang jadi nol.
 */
export function bacaJawabanRxZte(keluaran: string): BacaanRx {
  const m = /(-?\d+(?:\.\d+)?)\s*\(\s*dbm\s*\)/i.exec(keluaran);
  if (!m) {
    return { dBm: null, alasan: "Perangkat tidak mengembalikan nilai RX — ONU mungkin tidak dikenal atau sedang mati." };
  }
  return sahkanDbm(Number(m[1]));
}

/**
 * Rangkaian perintah pembaca RX pada HSGQ.
 *
 * `enable` dan `configure` hanya berpindah mode; `interface gpon N` masuk ke
 * konteks port. Tidak satu pun mengubah keadaan, dan daftar putih di
 * `olt-telnet.ts` tetap menyaring semuanya.
 */
export function perintahRxHsgq(p: PosisiOnu): string[] {
  return ["enable", "configure", `interface gpon ${p.port}`, `show ont-optical ${p.index}`];
}

/** Membaca `Receive power(dBm)   :-17.2720` dari jawaban HSGQ. */
export function bacaJawabanRxHsgq(keluaran: string): BacaanRx {
  const m = /receive\s*power\s*\(dBm\)\s*:\s*(-?\d+(?:\.\d+)?)/i.exec(keluaran);
  if (!m) {
    return { dBm: null, alasan: "Perangkat tidak mengembalikan Receive power — ONU mungkin tidak dikenal atau sedang mati." };
  }
  return sahkanDbm(Number(m[1]));
}

// ── Jarak ONU (Fase 88b lanjutan kedua) ─────────────────────────
//
// Peta kemampuannya, dari penjelajahan 17 Agustus 2026 malam:
//
//   ZTE C600 : `show gpon onu detail-info` memuat `ONU Distance: 811m` ✓
//   ZTE C300 : perintah yang sama ada, tetapi butuh kredensial CLI sendiri
//              (OLT_PSG_CRED) — tabel SNMP-nya TIDAK memuat jarak
//   HSGQ     : tidak menyediakan jarak sama sekali — konteks gpon-nya sudah
//              disisir penuh (ont-info, ont-optical, optical-state)
//
// Jadi jarak bersifat OPSIONAL pada hasil: null berarti perangkatnya tidak
// memberi, bukan pembacaannya gagal.

/** Perintah detail ONU pada ZTE — satu-satunya yang memuat jarak. */
export function perintahJarakZte(p: PosisiOnu): string {
  return `show gpon onu detail-info gpon_onu-1/${p.slot}/${p.port}:${p.index}`;
}

/** Batas jarak yang masuk akal: GPON kelas B+ menjangkau ±20 km; 60 km sudah mustahil. */
const JARAK_MAKS_M = 60_000;

/**
 * Membaca `ONU Distance:         811m` dari jawaban detail-info.
 *
 * Nol DITERIMA di sini — beda dari daya. ONU yang baru menyala bisa terukur
 * 0 m sebelum ranging selesai, dan itu keadaan sungguhan yang layak tampil,
 * bukan sentinel.
 */
export function bacaJarakZte(keluaran: string): number | null {
  const m = /ONU\s*Distance\s*:\s*(\d+)\s*m/i.exec(keluaran);
  if (!m) return null;
  const meter = Number(m[1]);
  if (!Number.isFinite(meter) || meter < 0 || meter > JARAK_MAKS_M) return null;
  return meter;
}
