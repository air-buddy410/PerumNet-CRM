import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { simulasiTerbit, simulasiIsolir, bandingkanTagihan } from "@/lib/billing-dryrun";

const aktif = (n: string, harga = 225000, mulaiTagih = "2026-01-01") => ({
  serviceNumber: n, status: "ACTIVE", monthlyPrice: harga,
  billingCycleDay: 1, isolirDay: 16, billingStartAt: new Date(mulaiTagih),
});

describe("simulasiTerbit", () => {
  test("ISOLATED tetap ditagih — ia masih berlangganan", () => {
    // Menghentikan tagihan pelanggan yang diisolir karena menunggak justru
    // menghapus alasan ia harus membayar.
    const h = simulasiTerbit([{ ...aktif("PN1"), status: "ISOLATED" }], { tahun: 2026, bulan: 8 });
    assert.equal(h.akanTerbit, 1);
  });

  test("TERMINATED tidak ditagih", () => {
    const h = simulasiTerbit([{ ...aktif("PN1"), status: "TERMINATED" }], { tahun: 2026, bulan: 8 });
    assert.equal(h.akanTerbit, 0);
    assert.equal(h.dilewati, 1);
  });

  test("langganan yang mulai ditagih SESUDAH periode tidak ditagih mundur", () => {
    // Tanpa penjagaan ini, impor data lama akan menerbitkan tagihan untuk
    // bulan-bulan sebelum pelanggannya ada.
    const h = simulasiTerbit([aktif("PN1", 225000, "2026-09-15")], { tahun: 2026, bulan: 8 });
    assert.equal(h.akanTerbit, 0);
    assert.match(Object.keys(h.perAlasan)[0], /setelah periode/);
  });

  test("total rupiah dijumlahkan dari yang TERBIT saja", () => {
    const h = simulasiTerbit(
      [aktif("PN1", 225000), aktif("PN2", 175000), { ...aktif("PN3"), status: "TERMINATED" }],
      { tahun: 2026, bulan: 8 }
    );
    assert.equal(h.akanTerbit, 2);
    assert.equal(h.totalRupiah, 400000);
  });

  test("harga nol dilewati — akun gratis tidak menghasilkan tagihan Rp0", () => {
    const h = simulasiTerbit([aktif("PN1", 0)], { tahun: 2026, bulan: 8 });
    assert.equal(h.akanTerbit, 0);
  });
});

describe("simulasiIsolir", () => {
  test("isolir menuntut tanggal DAN tunggakan, bukan salah satu", () => {
    const daftar = [
      { serviceNumber: "PN1", status: "ACTIVE", isolirDay: 16, tunggakan: 2 }, // keduanya
      { serviceNumber: "PN2", status: "ACTIVE", isolirDay: 16, tunggakan: 0 }, // sudah bayar
      { serviceNumber: "PN3", status: "ACTIVE", isolirDay: 21, tunggakan: 3 }, // belum tanggalnya
    ];
    const h = simulasiIsolir(daftar, 16);
    assert.deepEqual(h.akanDiisolir.map((x) => x.serviceNumber), ["PN1"]);
  });

  test("pemulihan TIDAK menunggu tanggal", () => {
    // Menunda pemulihan sampai tanggal tertentu berarti menghukum orang yang
    // sudah membayar.
    const h = simulasiIsolir(
      [{ serviceNumber: "PN9", status: "ISOLATED", isolirDay: 16, tunggakan: 0 }],
      3
    );
    assert.deepEqual(h.akanDipulihkan, ["PN9"]);
  });
});

describe("bandingkanTagihan", () => {
  test("selisih ditunjuk per pelanggan, bukan cuma totalnya", () => {
    // Dua total yang kebetulan sama bisa menyembunyikan dua kesalahan yang
    // saling menutup.
    const h = bandingkanTagihan(
      [{ serviceNumber: "PN1", jumlah: 225000 }, { serviceNumber: "PN2", jumlah: 175000 }],
      [{ serviceNumber: "PN1", jumlah: 175000 }, { serviceNumber: "PN2", jumlah: 225000 }]
    );
    assert.equal(h.totalKita, h.totalLama);
    assert.equal(h.cocok, 0);
    assert.equal(h.selisih.length, 2);
  });

  test("pelanggan yang hanya ada di salah satu sisi dilaporkan dua arah", () => {
    const h = bandingkanTagihan(
      [{ serviceNumber: "PN1", jumlah: 1 }],
      [{ serviceNumber: "PN2", jumlah: 1 }]
    );
    assert.deepEqual(h.hanyaDiKita, ["PN1"]);
    assert.deepEqual(h.hanyaDiLama, ["PN2"]);
  });
});
