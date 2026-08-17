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

// ── Jalur CLI — jawaban perangkat SUNGGUHAN, 17 Agustus 2026 ────

import { perintahRxZte, bacaJawabanRxZte, perintahRxHsgq, bacaJawabanRxHsgq } from "@/lib/onu-optical";

const JAWAB_C600 =
  "show pon power onu-rx gpon_onu-1/17/3:2\r\n" +
  "Onu                  Rx power   \r\n" +
  "------------------------------------\r\n" +
  "gpon_onu-1/17/3:2    -18.292(dbm)\r\nZXAN#";

const JAWAB_HSGQ =
  "show ont-optical 1 \r\n" +
  "Work temperature(c)   :54\r\n" +
  "Work voltage(V)      :3.28\r\n" +
  "Transmit bias(mA)    :12.24\r\n" +
  "Transmit power(dBm)  :2.2480\r\n" +
  "Receive power(dBm)   :-17.2720\r\n" +
  "OLT Rx ONT power(dBm):-23.9794\r\n\r\nOLT(config-gpon-6)#";

describe("jalur CLI ZTE", () => {
  test("perintah tersusun dari posisi ONU", () => {
    assert.equal(perintahRxZte({ slot: 17, port: 3, index: 2 }), "show pon power onu-rx gpon_onu-1/17/3:2");
  });

  test("jawaban sungguhan C600 terbaca", () => {
    assert.equal(bacaJawabanRxZte(JAWAB_C600).dBm, -18.29);
  });

  test("jawaban tanpa angka menjadi null beralasan, bukan nol", () => {
    const h = bacaJawabanRxZte("ZXAN#show pon power onu-rx gpon_onu-1/9/9:9\r\n%Onu is not exist\r\nZXAN#");
    assert.equal(h.dBm, null);
    assert.match(h.alasan!, /tidak mengembalikan/);
  });
});

describe("jalur CLI HSGQ", () => {
  test("rangkaian perintahnya berpindah konteks lalu membaca", () => {
    assert.deepEqual(perintahRxHsgq({ slot: 1, port: 6, index: 1 }), [
      "enable", "configure", "interface gpon 6", "show ont-optical 1",
    ]);
  });

  test("jawaban sungguhan terbaca — RECEIVE, bukan Transmit dan bukan OLT Rx", () => {
    // Tiga angka dBm dalam satu jawaban. Salah pilih baris berarti menampilkan
    // daya pancar (+2.25) sebagai daya terima — angka yang mustahil dan
    // langsung mematahkan kepercayaan pada seluruh panel.
    assert.equal(bacaJawabanRxHsgq(JAWAB_HSGQ).dBm, -17.27);
  });

  test("nilai di luar jendela GPON dibuang meski formatnya benar", () => {
    const h = bacaJawabanRxHsgq("Receive power(dBm)   :-55.01\r\n");
    assert.equal(h.dBm, null);
  });
});
