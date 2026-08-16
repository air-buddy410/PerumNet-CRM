// ── Gladi bersih penagihan (Fase 89) ────────────────────────────
//
// Lapisan MURNI. Tidak menyentuh basis data, dan — ini yang penting — TIDAK
// PERNAH BISA menerbitkan apa pun.
//
// Modul penagihan sudah ada sejak Fase 9–10: `BillingRun`, `Invoice`,
// `ServiceSuspension`, antrean perintah router. Yang belum pernah terjadi
// adalah menjalankannya. Penjadwalnya dimatikan, dan `Invoice` masih nol baris.
//
// Menyalakannya untuk "melihat apa yang terjadi" bukan pilihan: penagihan yang
// meleset satu hari saja akan mengirim tagihan ganda atau memutus pelanggan
// yang sudah membayar — kepada orang sungguhan, hari itu juga.
//
// Jadi yang dibangun di sini adalah SIMULASI: menghitung apa yang AKAN terbit
// dan siapa yang AKAN diisolir, lalu berhenti. Hasilnya disandingkan dengan
// tagihan sistem lama; kalau kedua angka cocok pada data yang sama, mesin kita
// terbukti tanpa satu pun pelanggan menerima apa pun.
//
// Fungsi di berkas ini hanya menerima angka dan mengembalikan angka. Tidak ada
// jalan dari sini menuju penerbitan, dan itu disengaja — bukan karena lupa
// menyambungkannya.

export interface LanggananUntukTagih {
  serviceNumber: string;
  status: string;
  monthlyPrice: number;
  /** Tanggal terbit tagihan tiap bulan. */
  billingCycleDay: number;
  /** Tanggal isolir bila belum bayar; null berarti tidak pernah diisolir. */
  isolirDay: number | null;
  /** Kapan langganan ini mulai ditagih. */
  activatedAt: Date | null;
}

export interface BarisSimulasi {
  serviceNumber: string;
  /** TERBIT | LEWAT */
  tindakan: "TERBIT" | "LEWAT";
  jumlah: number;
  alasan: string;
}

export interface HasilSimulasi {
  periode: string;
  baris: BarisSimulasi[];
  akanTerbit: number;
  totalRupiah: number;
  dilewati: number;
  perAlasan: Record<string, number>;
}

/** Status yang tagihannya tetap terbit. */
const DITAGIH = new Set(["ACTIVE", "ISOLATED"]);

/**
 * Menghitung tagihan yang AKAN terbit untuk satu periode.
 *
 * `ISOLATED` ikut ditagih, dan itu bukan kekeliruan: pelanggan yang diisolir
 * karena menunggak tetap berlangganan, dan menghentikan tagihannya justru
 * menghapus alasan ia harus membayar. Yang berhenti ditagih adalah yang
 * `TERMINATED`.
 */
export function simulasiTerbit(
  daftar: LanggananUntukTagih[],
  periode: { tahun: number; bulan: number }
): HasilSimulasi {
  const label = `${periode.tahun}-${String(periode.bulan).padStart(2, "0")}`;
  // Akhir bulan periode — dipakai membandingkan tanggal aktivasi.
  const akhirPeriode = new Date(Date.UTC(periode.tahun, periode.bulan, 0, 23, 59, 59));

  const baris: BarisSimulasi[] = daftar.map((s) => {
    if (!DITAGIH.has(s.status)) {
      return { serviceNumber: s.serviceNumber, tindakan: "LEWAT", jumlah: 0, alasan: `Status ${s.status}.` };
    }
    if (!s.activatedAt) {
      return { serviceNumber: s.serviceNumber, tindakan: "LEWAT", jumlah: 0, alasan: "Belum pernah diaktifkan." };
    }
    // Langganan yang baru aktif SESUDAH periode berakhir tidak ditagih untuk
    // periode itu. Tanpa penjagaan ini, impor data lama akan menerbitkan
    // tagihan mundur untuk bulan-bulan sebelum pelanggannya ada.
    if (s.activatedAt > akhirPeriode) {
      return {
        serviceNumber: s.serviceNumber,
        tindakan: "LEWAT",
        jumlah: 0,
        alasan: "Aktif setelah periode ini berakhir.",
      };
    }
    if (s.monthlyPrice <= 0) {
      return { serviceNumber: s.serviceNumber, tindakan: "LEWAT", jumlah: 0, alasan: "Harga bulanan nol." };
    }
    return { serviceNumber: s.serviceNumber, tindakan: "TERBIT", jumlah: s.monthlyPrice, alasan: "" };
  });

  const perAlasan: Record<string, number> = {};
  for (const b of baris) {
    if (b.tindakan === "LEWAT") perAlasan[b.alasan] = (perAlasan[b.alasan] ?? 0) + 1;
  }

  const terbit = baris.filter((b) => b.tindakan === "TERBIT");
  return {
    periode: label,
    baris,
    akanTerbit: terbit.length,
    totalRupiah: terbit.reduce((s, b) => s + b.jumlah, 0),
    dilewati: baris.length - terbit.length,
    perAlasan,
  };
}

// ── Simulasi isolir ─────────────────────────────────────────────

export interface LanggananUntukIsolir {
  serviceNumber: string;
  status: string;
  isolirDay: number | null;
  /** Berapa tagihan yang belum dibayar. */
  tunggakan: number;
}

export interface HasilIsolir {
  /** Yang AKAN diisolir hari ini. */
  akanDiisolir: { serviceNumber: string; tunggakan: number }[];
  /** Yang AKAN dipulihkan karena tunggakannya lunas. */
  akanDipulihkan: string[];
  dilewati: number;
}

/**
 * Menghitung siapa yang AKAN diisolir pada tanggal tertentu.
 *
 * Ambangnya `tunggakan >= 1` DAN tanggalnya tepat — dua syarat, bukan satu.
 * Menjalankan isolir hanya berdasarkan tunggakan akan memutus pelanggan pada
 * hari yang salah; hanya berdasarkan tanggal akan memutus yang sudah membayar.
 */
export function simulasiIsolir(daftar: LanggananUntukIsolir[], tanggalHariIni: number): HasilIsolir {
  const akanDiisolir: { serviceNumber: string; tunggakan: number }[] = [];
  const akanDipulihkan: string[] = [];
  let dilewati = 0;

  for (const s of daftar) {
    if (s.status === "ACTIVE" && s.isolirDay === tanggalHariIni && s.tunggakan >= 1) {
      akanDiisolir.push({ serviceNumber: s.serviceNumber, tunggakan: s.tunggakan });
      continue;
    }
    // Pemulihan TIDAK menunggu tanggal: begitu tunggakannya nol, pelanggan
    // berhak menyala lagi hari itu juga. Menunda pemulihan sampai tanggal
    // tertentu berarti menghukum orang yang sudah membayar.
    if (s.status === "ISOLATED" && s.tunggakan === 0) {
      akanDipulihkan.push(s.serviceNumber);
      continue;
    }
    dilewati++;
  }

  return { akanDiisolir, akanDipulihkan, dilewati };
}

// ── Menyandingkan dengan sistem lama ────────────────────────────

export interface SelisihTagih {
  serviceNumber: string;
  kita: number;
  lama: number;
}

export interface HasilBanding {
  cocok: number;
  selisih: SelisihTagih[];
  hanyaDiKita: string[];
  hanyaDiLama: string[];
  totalKita: number;
  totalLama: number;
}

/**
 * Membandingkan hasil simulasi dengan tagihan sistem lama pada periode yang
 * sama.
 *
 * Inilah ujian sebenarnya Fase 89. Angka yang cocok pada 1.700 pelanggan
 * membuktikan mesin penagihan kita tanpa satu pun pelanggan menerima apa pun;
 * angka yang meleset menunjukkan tepat pada siapa, sebelum uang berpindah.
 */
export function bandingkanTagihan(
  kita: { serviceNumber: string; jumlah: number }[],
  lama: { serviceNumber: string; jumlah: number }[]
): HasilBanding {
  const k = new Map(kita.map((x) => [x.serviceNumber, x.jumlah]));
  const l = new Map(lama.map((x) => [x.serviceNumber, x.jumlah]));

  const selisih: SelisihTagih[] = [];
  const hanyaDiKita: string[] = [];
  let cocok = 0;

  for (const [nomor, jumlah] of k) {
    const lawan = l.get(nomor);
    if (lawan === undefined) {
      hanyaDiKita.push(nomor);
      continue;
    }
    if (lawan === jumlah) cocok++;
    else selisih.push({ serviceNumber: nomor, kita: jumlah, lama: lawan });
  }

  const hanyaDiLama = [...l.keys()].filter((n) => !k.has(n));

  return {
    cocok,
    selisih,
    hanyaDiKita,
    hanyaDiLama,
    totalKita: [...k.values()].reduce((a, b) => a + b, 0),
    totalLama: [...l.values()].reduce((a, b) => a + b, 0),
  };
}
