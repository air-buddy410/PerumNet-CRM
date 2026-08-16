// ── Membaca posisi ONU pelanggan (Fase 83) ──────────────────────
//
// Lapisan MURNI. Tidak menyentuh basis data.
//
// Sistem lama mencatat, untuk hampir tiap pelanggan, DI MANA ONU-nya duduk
// pada OLT. Nilai itu dibaca langsung dari perangkatnya, bukan diketik orang —
// dan itulah yang membuatnya berharga: ia menjadi jalur KEDUA yang bebas
// menuju port PON, di samping jalur yang sudah kita punya lewat ODP.
//
//   jalur A  pelanggan → port ODP → ODP → (PIU di berkas) → port PON
//   jalur B  pelanggan → posisi ONU ────────────────────→ port PON
//
// Jalur A berasal dari catatan tertulis, jalur B dari pembacaan perangkat.
// Ketika keduanya sepakat, tautan ODP→PON Fase 82 terbukti benar. Ketika
// berselisih, salah satunya keliru — dan yang seperti itu DILAPORKAN, bukan
// dipilih diam-diam. Modul ini hanya membaca nilainya; yang membandingkan
// ada di `onu-import-service.ts`.

/** Posisi ONU yang sudah terurai. Rak diabaikan — seluruh data menyebut rak 1. */
export interface PosisiOnu {
  slot: number;
  port: number;
  /** Nomor ONU pada port PON itu. HSGQ mulai dari 0, ZTE dari 1. */
  index: number;
}

/**
 * Membaca posisi ONU.
 *
 * Dua bentuk dipakai, dan bentuknya sendiri yang membedakan vendornya —
 * sama seperti PIU pada berkas ODP, jadi tidak perlu tahu OLT-nya:
 *
 *   `1/17/3:2`  → rak 1, slot 17, port 3, ONU 2   (ZTE)
 *   `8:0`       → slot 1, port 8, ONU 0           (HSGQ)
 *
 * NOL adalah nomor ONU yang SAH pada HSGQ — 94 pelanggan memakainya. Karena
 * itu index diperiksa dengan `>= 0`, bukan `> 0`; menolak nol akan membuang
 * satu ONU sungguhan di tiap port HSGQ.
 *
 * Bentuk lain menghasilkan `null`. Satu baris di data sungguhan berbunyi
 * `1/17/:19` — portnya hilang. Menebak portnya berarti menempatkan pelanggan
 * pada serat yang tidak dilaluinya, dan itu lebih buruk daripada tidak tahu:
 * yang tidak tahu kelihatan, yang salah tidak.
 */
export function bacaPosisiOnu(raw: string | null | undefined): PosisiOnu | null {
  const t = (raw ?? "").trim();
  if (!t) return null;

  const zte = /^(\d+)\/(\d+)\/(\d+):(\d+)$/.exec(t);
  if (zte) {
    const slot = Number(zte[2]);
    const port = Number(zte[3]);
    const index = Number(zte[4]);
    return slot > 0 && port > 0 && index >= 0 ? { slot, port, index } : null;
  }

  const hsgq = /^(\d+):(\d+)$/.exec(t);
  if (hsgq) {
    const port = Number(hsgq[1]);
    const index = Number(hsgq[2]);
    return port > 0 && index >= 0 ? { slot: 1, port, index } : null;
  }

  return null;
}

export interface OnuMasuk {
  /** Nomor layanan, mis. `PN100012524`. */
  serviceNumber: string;
  /** Posisi ONU apa adanya dari sistem lama. */
  onu: string | null;
}

export interface OnuBersih {
  serviceNumber: string;
  /** Nilai apa adanya — disimpan verbatim, inilah yang diketik ke konsol OLT. */
  posisi: string;
  terurai: PosisiOnu | null;
  status: "SIAP" | "TOLAK";
  pesan: string;
}

/**
 * Membersihkan sekumpulan baris, memisahkan yang terbaca dari yang tidak.
 *
 * Yang ditolak tetap dikembalikan berikut alasannya, sebab pelanggan tanpa
 * posisi ONU adalah pelanggan yang tidak bisa ditelusuri ke seratnya — dan
 * yang tidak disebutkan namanya tidak akan pernah dibetulkan.
 */
export function bersihkanOnu(rows: OnuMasuk[]): OnuBersih[] {
  return rows.map((r) => {
    const posisi = (r.onu ?? "").trim();
    if (!posisi) {
      return {
        serviceNumber: r.serviceNumber,
        posisi: "",
        terurai: null,
        status: "TOLAK" as const,
        pesan: "Sistem lama tidak mencatat posisi ONU-nya.",
      };
    }
    const terurai = bacaPosisiOnu(posisi);
    if (!terurai) {
      return {
        serviceNumber: r.serviceNumber,
        posisi,
        terurai: null,
        status: "TOLAK" as const,
        pesan: `Posisi "${posisi}" tidak terbaca sebagai slot/port:onu.`,
      };
    }
    return {
      serviceNumber: r.serviceNumber,
      posisi,
      terurai,
      status: "SIAP" as const,
      pesan: `slot ${terurai.slot} port ${terurai.port} ONU ${terurai.index}`,
    };
  });
}
