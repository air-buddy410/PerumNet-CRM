import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { nilaiOnu } from "@/lib/onu-telemetry";

describe("nilaiOnu", () => {
  test("port PON padam mengalahkan segalanya — teknisi ke OLT, bukan ke rumah", () => {
    // Kalau seratnya sendiri mati, keadaan sesi pelanggan tidak relevan.
    // Mengirim teknisi ke rumah pelanggan adalah perjalanan yang terbuang.
    const h = nilaiOnu({ sesi: "OFFLINE", portPon: "down", tetanggaPadam: 0, tetangga: 0 });
    assert.equal(h.keadaan, "PADAM_SEPON");
    assert.match(h.ringkas, /Periksa OLT/);
  });

  test("padam sendirian dibedakan dari padam se-PON", () => {
    // Ini pertanyaan pertama tiap gangguan, dan selama ini dijawab menebak.
    const sendiri = nilaiOnu({ sesi: "OFFLINE", portPon: "up", tetanggaPadam: 1, tetangga: 30 });
    const sepon = nilaiOnu({ sesi: "OFFLINE", portPon: "up", tetanggaPadam: 20, tetangga: 30 });
    assert.equal(sendiri.keadaan, "PADAM_SENDIRIAN");
    assert.equal(sepon.keadaan, "PADAM_SEPON");
    assert.match(sepon.ringkas, /seratnya, bukan rumahnya/);
  });

  test("dinonaktifkan BUKAN padam — itu keputusan, bukan gangguan", () => {
    const h = nilaiOnu({ sesi: "DISABLED", portPon: "up", tetanggaPadam: 0, tetangga: 10 });
    assert.equal(h.keadaan, "TAK_DIKETAHUI");
    assert.doesNotMatch(h.ringkas, /padam/i);
  });

  test("OLT tanpa SNMP dikatakan apa adanya, bukan dilaporkan rusak", () => {
    // 97 pelanggan bergantung pada OLT HSGQ Kecicang yang di luar SNMP.
    // Sejak 17 Agustus CLI-nya terbuka — kalimatnya menyebut jalan yang ADA,
    // bukan hanya yang tidak ada.
    const h = nilaiOnu({ sesi: null, portPon: null, tetanggaPadam: 0, tetangga: 0 });
    assert.equal(h.keadaan, "PON_TAK_TERPANTAU");
    assert.ok(h.belumDiketahui.some((x) => /di luar pemantauan SNMP/.test(x)));
    assert.match(h.ringkas, /tombol daya optik tetap menjawab/);
  });

  test("yang belum diketahui SELALU disebutkan, bahkan saat nyala", () => {
    // Panel yang tampak lengkap membuat orang mengira dBm-nya tampil sendiri.
    // Baris dBm kini MENUNJUK tombolnya, bukan menyatakan tidak bisa — sebab
    // jalur bacanya sudah ada; sedangkan jarak ONU tetap jujur belum terbaca.
    const h = nilaiOnu({ sesi: "ONLINE", portPon: "up", tetanggaPadam: 0, tetangga: 20 });
    assert.equal(h.keadaan, "NYALA");
    assert.ok(h.belumDiketahui.some((x) => /Baca daya optik/.test(x)));
    assert.ok(h.belumDiketahui.some((x) => /Jarak ONU.*ikut terbaca.*HSGQ tidak menyediakannya/.test(x)));
  });
});
