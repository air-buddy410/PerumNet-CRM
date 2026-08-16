import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { bacaNamaOlt, bersihkanOlt, bacaPon, susunPon } from "@/lib/olt-import";

// Seluruh nilai di berkas ini disalin dari enam OLT PerumNet yang sungguhan.

describe("bacaNamaOlt", () => {
  test("VLAN wilayah dan lokasi terbaca dari namanya", () => {
    // 100 Kecicang, 102 Seraya, 104 Abang — penanda wilayah yang ikut tertulis
    // di nama paket, nomor pelanggan, dan deskripsi site.
    assert.deepEqual(bacaNamaOlt("ZTE-C600-104-Abang"), { vlan: "104", lokasi: "Abang" });
    assert.deepEqual(bacaNamaOlt("HSGQ-102-SerayaTengah"), { vlan: "102", lokasi: "SerayaTengah" });
    assert.deepEqual(bacaNamaOlt("ZTE-C300-102-Pesagi"), { vlan: "102", lokasi: "Pesagi" });
  });

  test("nama di luar polanya menghasilkan null, bukan potongan asal", () => {
    assert.deepEqual(bacaNamaOlt("OLT Kecicang"), { vlan: null, lokasi: null });
    assert.deepEqual(bacaNamaOlt(""), { vlan: null, lokasi: null });
  });
});

describe("bersihkanOlt", () => {
  test("enam OLT sungguhan terbaca utuh", () => {
    const h = bersihkanOlt({
      nama: "HSGQ-102-SerayaTengah", vendor: "HSGQ", model: "HSGQ-G008",
      managementIp: "172.30.10.6", telnetPort: "1025", snmpPort: "1616",
    });
    assert.equal(h.masalah.length, 0);
    assert.equal(h.bersih.vendor, "HSGQ");
    assert.equal(h.bersih.telnetPort, 1025);
    assert.equal(h.bersih.snmpPort, 1616);
    assert.equal(h.bersih.kodeVlan, "102");
  });

  test("vendor tak dikenal dilaporkan tetapi tetap disimpan", () => {
    const h = bersihkanOlt({ nama: "X-Y-100-Z", vendor: "Nokia", model: "", managementIp: "10.0.0.1" });
    assert.match(h.masalah[0], /tidak dikenal/);
    assert.equal(h.bersih.vendor, "NOKIA");
  });

  test("IP yang bukan alamat dilaporkan", () => {
    const h = bersihkanOlt({ nama: "X-Y-100-Z", vendor: "ZTE", model: "", managementIp: "bukan-ip" });
    assert.match(h.masalah[0], /tidak berbentuk alamat/);
  });
});

describe("bacaPon", () => {
  test("nama ZTE memuat slot dan port — dibaca persis", () => {
    assert.deepEqual(bacaPon({ ifName: "gpon_1/2/13", urutan: 99 }), {
      slot: 2, port: 13, label: "gpon_1/2/13", asal: "NAMA",
    });
  });

  test("sisipan `olt-` pada C600 tidak menghalangi slot terbaca", () => {
    // Nilai asli dari 192.168.100.60. Tanpa sisipan ini seluruh port C600
    // jatuh ke URUTAN, dan dua slot fisik — 16 dan 17 — ditumpuk menjadi satu
    // slot bernomor 1–32. PIU di berkas ODP menyebut slot yang sebenarnya,
    // jadi selama ditumpuk tidak satu pun ODP bisa dijodohkan ke port PON-nya.
    assert.deepEqual(bacaPon({ ifName: "gpon_olt-1/16/1", urutan: 1 }), {
      slot: 16, port: 1, label: "gpon_olt-1/16/1", asal: "NAMA",
    });
    assert.deepEqual(bacaPon({ ifName: "gpon_olt-1/17/16", urutan: 32 }), {
      slot: 17, port: 16, label: "gpon_olt-1/17/16", asal: "NAMA",
    });
  });

  test("dua slot C600 tidak lagi bertumpuk", () => {
    // Sebelum diperbaiki, kedua baris ini menjadi slot 1 port 1 dan slot 1
    // port 2 — port yang tidak ada di perangkatnya.
    const { pon, masalah } = susunPon([
      { ifName: "gpon_olt-1/16/1", urutan: 1 },
      { ifName: "gpon_olt-1/17/1", urutan: 17 },
    ]);
    assert.equal(masalah.length, 0);
    assert.deepEqual(pon.map((p) => `${p.slot}/${p.port}`), ["16/1", "17/1"]);
  });

  test("nama yang menyebut nomornya sendiri dipakai apa adanya", () => {
    assert.equal(bacaPon({ ifName: "PON07", urutan: 3 }).port, 7);
    assert.equal(bacaPon({ ifName: "PON07", urutan: 3 }).asal, "NAMA");
  });

  test("nama daerah jatuh ke URUTAN, dan itu dilaporkan", () => {
    // Operator HSGQ mengganti nama port menjadi master splitter yang
    // disuapinya, sehingga tidak ada angka sama sekali.
    const p = bacaPon({ ifName: "MsPuraPuseh", urutan: 5 });
    assert.deepEqual(p, { slot: 1, port: 5, label: "MsPuraPuseh", asal: "URUTAN" });
  });
});

describe("susunPon", () => {
  test("urutan HSGQ dibenarkan oleh port yang menyebut nomornya sendiri", () => {
    // Nilai asli dari 192.168.100.12: delapan port PON, dan dua terakhir
    // bernama PON07 dan PON08. Kalau penomoran berbasis urutan benar, keduanya
    // HARUS jatuh di 7 dan 8 — dan itulah yang membuat urutan bisa dipercaya
    // untuk enam port lain yang namanya tidak menyebut nomor.
    const nama = ["BenaKaja","BatuTelu","BenaKelod","MsPuskesmas","MsPuraPuseh","MsKikopang","PON07","PON08"];
    const { pon, masalah } = susunPon(nama.map((n, i) => ({ ifName: n, urutan: i + 1 })));
    assert.equal(masalah.length, 0);
    assert.equal(pon.find((p) => p.label === "PON07")!.port, 7);
    assert.equal(pon.find((p) => p.label === "PON08")!.port, 8);
    assert.deepEqual(pon.map((p) => p.port), [1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test("port ZTE tidak terpengaruh urutannya", () => {
    const { pon } = susunPon([
      { ifName: "gpon_1/2/16", urutan: 1 },
      { ifName: "gpon_1/2/1", urutan: 2 },
    ]);
    assert.equal(pon.find((p) => p.label === "gpon_1/2/16")!.port, 16);
    assert.equal(pon.find((p) => p.label === "gpon_1/2/1")!.port, 1);
  });

  test("dua port yang bertabrakan DILAPORKAN, tidak diberi nomor karangan", () => {
    // Kolomnya unik. Menggeser yang kedua supaya muat berarti menyimpan port
    // yang tidak ada di perangkatnya.
    const { pon, masalah } = susunPon([
      { ifName: "PON03", urutan: 1 },
      { ifName: "Gerobog", urutan: 3 },
    ]);
    assert.equal(pon.length, 1);
    assert.match(masalah[0], /diperebutkan/);
  });
});

describe("bacaNamaOlt — bagian model opsional", () => {
  test("nama TANPA model tetap terbaca", () => {
    // `HSGQ-102-SerayaTengah` tiga bagian, `ZTE-C600-104-Abang` empat.
    // Keduanya nama sungguhan dari sistem yang sama.
    assert.deepEqual(bacaNamaOlt("HSGQ-100-Kecicang"), { vlan: "100", lokasi: "Kecicang" });
    assert.deepEqual(bacaNamaOlt("HSGQ-102-SerayaBarat"), { vlan: "102", lokasi: "SerayaBarat" });
  });

  test("nama DENGAN model tetap terbaca", () => {
    assert.deepEqual(bacaNamaOlt("ZTE-C600-100-Kecicang"), { vlan: "100", lokasi: "Kecicang" });
  });
});
