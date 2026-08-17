// ── Keadaan ONU seorang pelanggan (Fase 88a) ────────────────────
//
// Lapisan MURNI. Tidak menyentuh basis data.
//
// APA YANG BISA DIJAWAB SEKARANG, DAN APA YANG TIDAK — itu seluruh isi berkas
// ini, dan membedakannya lebih penting daripada jawabannya sendiri.
//
// Sistem lama menampilkan panel ONU yang mengesankan: RX dBm per pelanggan,
// jarak dari OLT, status dyinggasp/LOS. Itu didapat dengan MEMBACA OLT
// LANGSUNG lewat telnet — sesuatu yang belum kita lakukan.
//
// Yang kita punya sekarang tiga hal, dan ketiganya cukup untuk menjawab
// pertanyaan yang paling sering ditanyakan:
//
//   1. posisi ONU pelanggan (Fase 83) — slot/port:index pada OLT-nya
//   2. keadaan port PON tempat ia bergantung (LibreNMS, `operStatus`)
//   3. keadaan sesi PPPoE-nya (worker penarik)
//
// Menggabungkan ketiganya menjawab: **"pelanggan ini mati sendirian, atau
// seluruh PON-nya yang padam?"** Itu pertanyaan pertama tiap gangguan, dan
// selama ini dijawab dengan menebak.
//
// Yang TIDAK bisa dijawab tanpa membaca OLT: daya terima ONU, jaraknya, dan
// sebab padamnya. Berkas ini menyebutkan ketidaktahuan itu secara terbuka
// alih-alih mengarang angka.

export type KeadaanOnu =
  | "NYALA"
  | "PADAM_SENDIRIAN"
  | "PADAM_SEPON"
  | "PON_TAK_TERPANTAU"
  | "TAK_DIKETAHUI";

export interface BahanOnu {
  /** Status sesi PPPoE terakhir: ONLINE | OFFLINE | DISABLED | null. */
  sesi: string | null;
  /** `operStatus` port PON-nya menurut LibreNMS: up | down | null. */
  portPon: string | null;
  /** Berapa pelanggan lain pada PON yang sama sedang OFFLINE. */
  tetanggaPadam: number;
  /** Berapa pelanggan lain pada PON yang sama seluruhnya. */
  tetangga: number;
}

export interface PenilaianOnu {
  keadaan: KeadaanOnu;
  ringkas: string;
  /** Apa yang TIDAK diketahui, supaya tidak disangka sudah lengkap. */
  belumDiketahui: string[];
}

/** Berapa bagian tetangga yang harus padam sebelum disebut padam se-PON. */
const AMBANG_SEPON = 0.5;

/**
 * Menyimpulkan keadaan ONU dari tiga sumber yang ada.
 *
 * Urutan pemeriksaannya bukan selera: yang paling menentukan tindakan
 * didahulukan. Kalau port PON-nya sendiri padam, keadaan sesi pelanggan tidak
 * relevan — teknisi harus ke OLT, bukan ke rumah pelanggan.
 */
export function nilaiOnu(b: BahanOnu): PenilaianOnu {
  // Daftar ini penjaga kejujuran panel: apa yang TIDAK ditampilkan otomatis.
  // Baris dBm pernah berbunyi "perlu pembacaan langsung ke OLT" — ditulis
  // sebelum jalur pembacaannya ada. Sekarang jalurnya ada (tombol di panel
  // yang sama), jadi kalimatnya menunjuk ke sana alih-alih menyatakan tidak
  // bisa. Jarak ONU tetap jujur belum terbaca: perintahnya belum dipetakan
  // di satu pun vendor.
  const belumDiketahui = [
    "Daya terima ONU (dBm) tidak tampil otomatis — baca dengan tombol \"Baca daya optik\" di bawah.",
    "Jarak ONU dari OLT — belum bisa dibaca.",
  ];

  if (b.portPon === "down") {
    return {
      keadaan: "PADAM_SEPON",
      ringkas: "Port PON-nya sendiri padam — seluruh pelanggan di serat ini ikut mati. Periksa OLT, bukan rumah pelanggan.",
      belumDiketahui,
    };
  }

  if (b.sesi === "DISABLED") {
    return {
      keadaan: "TAK_DIKETAHUI",
      ringkas: "Sambungannya dinonaktifkan di router, jadi keadaan ONU-nya tidak bisa disimpulkan dari sesi.",
      belumDiketahui,
    };
  }

  if (b.sesi === "ONLINE") {
    return { keadaan: "NYALA", ringkas: "Tersambung.", belumDiketahui };
  }

  if (b.sesi === "OFFLINE") {
    // Tetangga yang ikut padam mengubah artinya sepenuhnya: satu rumah mati
    // itu urusan rumah itu; separuh PON mati itu urusan serat atau OLT.
    if (b.tetangga > 0 && b.tetanggaPadam / b.tetangga >= AMBANG_SEPON) {
      return {
        keadaan: "PADAM_SEPON",
        ringkas: `Padam bersama ${b.tetanggaPadam} dari ${b.tetangga} pelanggan lain di PON yang sama — kemungkinan seratnya, bukan rumahnya.`,
        belumDiketahui,
      };
    }
    return {
      keadaan: "PADAM_SENDIRIAN",
      ringkas:
        b.tetangga > 0
          ? `Padam sendirian; ${b.tetangga - b.tetanggaPadam} pelanggan lain di PON yang sama masih menyala.`
          : "Padam.",
      belumDiketahui,
    };
  }

  if (b.portPon === null) {
    return {
      keadaan: "PON_TAK_TERPANTAU",
      ringkas:
        "OLT pelanggan ini di luar pemantauan SNMP, jadi keadaan port PON-nya tidak diketahui otomatis. " +
        "Sesi PPPoE dan tombol daya optik tetap menjawab.",
      belumDiketahui: [
        ...belumDiketahui,
        "Keadaan port PON — OLT ini di luar pemantauan SNMP; tombol daya optik tetap bekerja (lewat CLI).",
      ],
    };
  }

  return {
    keadaan: "TAK_DIKETAHUI",
    ringkas: "Belum ada sesi PPPoE yang tercatat untuk pelanggan ini.",
    belumDiketahui,
  };
}
