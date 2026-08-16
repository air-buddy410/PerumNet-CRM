import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { bacaCatatanOdp, bacaPiu, kunciOlt, susunTautan } from "@/lib/odp-pon";

// Seluruh nilai di berkas ini disalin dari catatan ODP PerumNet yang sungguhan.

describe("bacaCatatanOdp", () => {
  test("OLT dan PIU terbaca dari catatan biasa", () => {
    assert.deepEqual(
      bacaCatatanOdp("OLT menurut berkas: OLT ZTE C300 Pesagi · PIU: 1/2/5"),
      { olt: "OLT ZTE C300 Pesagi", piu: "1/2/5" }
    );
  });

  test("keterangan tambahan sesudah PIU dibuang", () => {
    // ODP yang dibuat dari rujukan ODP lain membawa kalimat panjang di
    // belakang PIU-nya. Kalau ikut terbawa, tidak satu pun dari mereka bisa
    // dijodohkan ke port PON.
    const n =
      'OLT menurut berkas: OLT ZTE C600 Kecicang · PIU: 1/16/1 · Dibuat dari rujukan "VTR 240111" ' +
      "pada ODP VTR 01DC01; tidak punya barisnya sendiri di berkas.";
    assert.deepEqual(bacaCatatanOdp(n), { olt: "OLT ZTE C600 Kecicang", piu: "1/16/1" });
  });

  test("catatan kosong atau tanpa polanya menghasilkan null, bukan potongan asal", () => {
    assert.deepEqual(bacaCatatanOdp(null), { olt: null, piu: null });
    assert.deepEqual(bacaCatatanOdp(""), { olt: null, piu: null });
    assert.deepEqual(bacaCatatanOdp("Dipasang ulang 12 Mei"), { olt: null, piu: null });
  });
});

describe("bacaPiu", () => {
  test("PIU ZTE — rak diabaikan, slot dan port diambil", () => {
    assert.deepEqual(bacaPiu("1/16/9"), { slot: 16, port: 9 });
    assert.deepEqual(bacaPiu("1/2/5"), { slot: 2, port: 5 });
    assert.deepEqual(bacaPiu("1/17/16"), { slot: 17, port: 16 });
  });

  test("PIU HSGQ — satu slot, nomor port saja", () => {
    assert.deepEqual(bacaPiu("Port 6"), { slot: 1, port: 6 });
    assert.deepEqual(bacaPiu("port8"), { slot: 1, port: 8 });
  });

  test("bentuk yang tidak dikenal DITOLAK, tidak ditebak", () => {
    // ODP yang salah port tidak kelihatan; ODP yang belum tertaut kelihatan.
    assert.equal(bacaPiu("Port"), null);
    assert.equal(bacaPiu("1/16"), null);
    assert.equal(bacaPiu("0/0/0"), null);
    assert.equal(bacaPiu("PIU utama"), null);
    assert.equal(bacaPiu(null), null);
  });
});

describe("kunciOlt", () => {
  test("huruf besar-kecil dan spasi rangkap tidak membedakan", () => {
    assert.equal(kunciOlt("  OLT ZTE  C600 Kecicang "), kunciOlt("olt zte c600 kecicang"));
  });
});

describe("susunTautan", () => {
  const peta = {
    "OLT ZTE C600 Kecicang": "192.168.100.60",
    "OLT HSGQ Seraya Barat": "192.168.100.11",
  };

  test("ODP yang lengkap catatannya siap ditautkan", () => {
    const [a, b] = susunTautan(
      [
        { code: "JGS 05120101", notes: "OLT menurut berkas: OLT ZTE C600 Kecicang · PIU: 1/16/9" },
        { code: "SRY 05J4", notes: "OLT menurut berkas: OLT HSGQ Seraya Barat · PIU: Port 6" },
      ],
      peta
    );
    assert.equal(a.status, "SIAP");
    assert.deepEqual(a.slotPort, { slot: 16, port: 9 });
    assert.equal(a.hostname, "192.168.100.60");
    assert.equal(b.status, "SIAP");
    assert.deepEqual(b.slotPort, { slot: 1, port: 6 });
  });

  test("ODP tanpa penghuni tetap tertaut — justru mereka yang paling perlu", () => {
    // Penyimpulan lewat pelanggan tidak bisa menyentuh ODP kosong sama sekali,
    // padahal port kosongnya yang dicari saat memasang pelanggan baru.
    const [t] = susunTautan(
      [{ code: "ABB 012405", notes: "OLT menurut berkas: OLT ZTE C600 Kecicang · PIU: 1/16/3" }],
      peta
    );
    assert.equal(t.status, "SIAP");
  });

  test("OLT yang belum dijodohkan DILAPORKAN berikut namanya", () => {
    const [t] = susunTautan(
      [{ code: "KCC 01", notes: "OLT menurut berkas: OLT HSGQ Kecicang · PIU: Port 5" }],
      peta
    );
    assert.equal(t.status, "TOLAK");
    assert.equal(t.olt, "OLT HSGQ Kecicang");
    assert.match(t.pesan, /belum dijodohkan/);
  });

  test("PIU yang tidak terbaca DITOLAK, ODP-nya tidak ditaut asal", () => {
    const [t] = susunTautan(
      [{ code: "X 01", notes: "OLT menurut berkas: OLT ZTE C600 Kecicang · PIU: entah" }],
      peta
    );
    assert.equal(t.status, "TOLAK");
    assert.match(t.pesan, /tidak terbaca/);
  });
});
