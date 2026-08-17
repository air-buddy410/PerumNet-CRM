import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ifIndexPonC300, oidRxC300, bacaRxC300, nilaiMutu } from "@/lib/onu-optical";

// Seluruh angka di berkas ini disalin dari pembacaan OLT C300 Pesagi yang
// sungguhan pada 17 Agustus 2026.

describe("ifIndexPonC300", () => {
  test("rumusnya menghasilkan indeks yang benar-benar diamati di perangkat", () => {
    // 268566784 muncul di tabel RX C300 dan terurai sebagai slot 2 port 1 —
    // gpon_1/2/1, port PON pertama Pesagi. Ini jangkar rumusnya; kalau tes ini
    // jatuh, SEMUA pembacaan menunjuk ONU yang salah.
    assert.equal(ifIndexPonC300(2, 1), 268566784);
    assert.equal(ifIndexPonC300(2, 5), 268567808);
  });

  test("OID lengkap tersusun dengan indeks ONU dan akhiran tabel", () => {
    assert.equal(
      oidRxC300({ slot: 2, port: 1, index: 1 }),
      "1.3.6.1.4.1.3902.1012.3.50.12.1.1.10.268566784.1.1"
    );
  });
});

describe("bacaRxC300", () => {
  test("nilai sungguhan dari perangkat terkonversi ke rentang GPON", () => {
    // Tiga nilai pertama yang dibaca dari 192.168.100.30.
    assert.equal(bacaRxC300(3459).dBm, -23.08);
    assert.equal(bacaRxC300(5519).dBm, -18.96);
    assert.equal(bacaRxC300(4600).dBm, -20.8);
  });

  test("NOL ditolak meski hasil konversinya berada di rentang sah", () => {
    // 0 × 0.002 − 30 = −30 dBm — angka yang SAH untuk sinyal nyaris putus.
    // Tetapi nol berarti "tidak ada pembacaan": menampilkannya sebagai −30
    // akan mengirim teknisi memeriksa serat yang sebenarnya cuma ONU-nya mati.
    const h = bacaRxC300(0);
    assert.equal(h.dBm, null);
    assert.match(h.alasan!, /tidak memberikan pembacaan/);
  });

  test("nilai sentinel dibuang, bukan ditampilkan", () => {
    for (const raw of [65535, 2147483647, -1]) {
      assert.equal(bacaRxC300(raw).dBm, null, `raw ${raw} harus ditolak`);
    }
  });
});

describe("nilaiMutu", () => {
  test("ambang kelas B+ GPON: batas penerima sekitar -28 dBm", () => {
    assert.equal(nilaiMutu(-18.96), "BAGUS");
    assert.equal(nilaiMutu(-25), "BAGUS");
    assert.equal(nilaiMutu(-26.5), "WASPADA");
    assert.equal(nilaiMutu(-28), "WASPADA");
    assert.equal(nilaiMutu(-28.01), "KRITIS");
  });
});
