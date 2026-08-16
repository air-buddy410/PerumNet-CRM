import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { bandingkan, hargaDariPlan, kunciOdp, statusSetara, type BarisAlus, type BarisCrm } from "@/lib/rekon-alus";

// Seluruh nilai di berkas ini disalin dari data PerumNet yang sungguhan.

describe("hargaDariPlan", () => {
  test("harga diambil dari kurung di ujung, pemisah ribuan diabaikan", () => {
    assert.equal(hargaDariPlan("Paket-Berdua (225,000)"), 225000);
    assert.equal(hargaDariPlan("Paket-KeluargaPlus (300,000)"), 300000);
    assert.equal(hargaDariPlan("Paket-D175(175000)"), 175000);
  });

  test("nama tanpa harga menghasilkan null — tidak ditebak dari namanya", () => {
    assert.equal(hargaDariPlan("Paket-Berdua"), null);
    assert.equal(hargaDariPlan("Paket-Berdua ( Rp. 225.000 )"), null);
    assert.equal(hargaDariPlan(null), null);
  });
});

describe("kunciOdp", () => {
  test("spasi, huruf besar-kecil, dan tanda tak terlihat tidak membedakan", () => {
    // `KCC‎ 1440701` di data sungguhan memuat LEFT-TO-RIGHT MARK.
    assert.equal(kunciOdp("KCC‎ 1440701"), kunciOdp("kcc1440701"));
    assert.equal(kunciOdp("SRY 05J4"), kunciOdp("sry05j4"));
    assert.equal(kunciOdp(null), "");
  });
});

describe("kunci", () => {
  test("tanda tak terlihat pada CID tidak memecah satu orang menjadi dua", () => {
    // `‎‎PN102052675` sungguhan ada di sistem lama, berawalan dua
    // LEFT-TO-RIGHT MARK. Tanpa dibersihkan, ia muncul sekaligus sebagai
    // "hanya di sistem lama" DAN "hanya di CRM" — dan kedua barisnya terlihat
    // benar, sebab tandanya tidak kelihatan mata.
    const h = bandingkan(
      [{ cid: "‎‎PN102052675", nama: "I Wayan Wiastana", status: "Active", plan: "Paket-Personal (175,000)", odp: null, onu: null }],
      [{ serviceNumber: "PN102052675", nama: "I Wayan Wiastana", status: "ACTIVE", monthlyPrice: 175000, odp: null, onuPosition: null, linkStatus: "ONLINE" }]
    );
    assert.equal(h.perJenis.HANYA_DI_ALUS, 0);
    assert.equal(h.perJenis.HANYA_DI_CRM, 0);
    assert.equal(h.bersama, 1);
    assert.equal(h.cocokPenuh, 1);
  });
});

describe("statusSetara", () => {
  test("status sistem lama dipetakan ke status langganan", () => {
    assert.equal(statusSetara("Active"), "ACTIVE");
    assert.equal(statusSetara("Blocked"), "ISOLATED");
    assert.equal(statusSetara("Inactive"), "INACTIVE");
    assert.equal(statusSetara("Potensial"), "PROSPECT");
  });
});

describe("bandingkan", () => {
  const alus: BarisAlus[] = [
    { cid: "PN1", nama: "A", status: "Active", plan: "Paket-Berdua (225,000)", odp: "KCC 01", onu: "1/17/3:2" },
    { cid: "PN2", nama: "B", status: "Blocked", plan: "Paket-Personal (175,000)", odp: "SRY 02", onu: "8:0" },
    { cid: "PN3", nama: "C", status: "Active", plan: "Paket-Personal (175,000)", odp: "ABG 03", onu: null },
  ];
  const crm: BarisCrm[] = [
    { serviceNumber: "PN1", nama: "A", status: "ACTIVE", monthlyPrice: 225000, odp: "KCC 01", onuPosition: "1/17/3:2", linkStatus: "ONLINE" },
    { serviceNumber: "PN2", nama: "B", status: "ACTIVE", monthlyPrice: 175000, odp: "SRY 02", onuPosition: "8:0", linkStatus: "ONLINE" },
    { serviceNumber: "PN9", nama: "Z", status: "ACTIVE", monthlyPrice: 175000, odp: null, onuPosition: null, linkStatus: "DISABLED" },
  ];

  test("yang seluruh bidangnya cocok tidak menghasilkan selisih", () => {
    const h = bandingkan(alus, crm);
    assert.equal(h.cocokPenuh, 1); // hanya PN1
  });

  test("pelanggan yang hanya ada di salah satu sistem dilaporkan dua arah", () => {
    const h = bandingkan(alus, crm);
    assert.equal(h.perJenis.HANYA_DI_ALUS, 1); // PN3
    assert.equal(h.perJenis.HANYA_DI_CRM, 1); // PN9
  });

  test("status yang berbeda dilaporkan berikut pemetaannya", () => {
    const h = bandingkan(alus, crm);
    const s = h.selisih.find((x) => x.jenis === "STATUS")!;
    assert.equal(s.cid, "PN2");
    assert.match(s.alus, /Blocked → ISOLATED/);
    assert.equal(s.crm, "ACTIVE");
  });

  test("ONU kosong di sistem lama BUKAN selisih — kosong berarti tidak tahu", () => {
    // Kalau kolom kosong dihitung sebagai selisih, 11 baris tanpa ONU akan
    // menenggelamkan selisih yang sungguhan.
    const h = bandingkan(
      [{ cid: "PN1", nama: "A", status: "Active", plan: "Paket-Berdua (225,000)", odp: "KCC 01", onu: null }],
      [{ serviceNumber: "PN1", nama: "A", status: "ACTIVE", monthlyPrice: 225000, odp: "KCC 01", onuPosition: "1/17/3:2", linkStatus: "ONLINE" }]
    );
    assert.equal(h.perJenis.ONU, 0);
    assert.equal(h.cocokPenuh, 1);
  });

  test("harga dibandingkan, nama paket TIDAK", () => {
    // Master paket kedua sistem dinamai berbeda sejak awal; yang harus sama
    // adalah yang dibayar pelanggan.
    const h = bandingkan(
      [{ cid: "PN1", nama: "A", status: "Active", plan: "Paket-Berdua (225,000)", odp: null, onu: null }],
      [{ serviceNumber: "PN1", nama: "A", status: "ACTIVE", monthlyPrice: 225000, odp: null, onuPosition: null, linkStatus: null }]
    );
    assert.equal(h.perJenis.HARGA, 0);
    assert.equal(h.cocokPenuh, 1);
  });

  test("status penagihan disandingkan dengan keadaan router sebagai sumbu terpisah", () => {
    const h = bandingkan(alus, crm);
    const b = h.blokirVsRouter.find((x) => x.alus === "Blocked")!;
    assert.equal(b.link, "ONLINE"); // diblokir di penagihan, tetapi masih menyala
    assert.equal(b.jumlah, 1);
  });
});
