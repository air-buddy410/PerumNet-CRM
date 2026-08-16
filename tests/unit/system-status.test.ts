import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { nilaiKesegaran, sewaTertinggal, simpulkan, vonisKesegaran, lamanya } from "@/lib/system-status";

const SEKARANG = new Date("2026-08-17T07:00:00Z");
const lalu = (detik: number) => new Date(SEKARANG.getTime() - detik * 1000);

// Interval di berkas ini disalin dari tugas PerumNet yang sungguhan:
// pppoe.poll 120s, librenms.sync 300s, probe.run 60s.

describe("nilaiKesegaran", () => {
  test("tugas yang sengaja dimatikan BUKAN kegagalan", () => {
    // Mode baca-saja mematikan lima tugas penulis. Menandainya merah akan
    // mengubur peringatan yang sungguhan.
    const k = nilaiKesegaran({ isEnabled: false, intervalSec: 120, lastRunAt: lalu(999999) }, SEKARANG);
    assert.equal(k.status, "MATI");
    assert.equal(vonisKesegaran(k.status), "SEHAT");
  });

  test("jitter wajar tidak berkedip merah", () => {
    // Worker berdetak tiap 15 detik dan satu putaran memakan beberapa detik,
    // jadi tugas 60 detik rutin telat 20–30 detik. Tanpa lantai toleransi,
    // tugas tercepat kita merah sepanjang hari dan layarnya berhenti dipercaya.
    for (const telat of [30, 90, 179]) {
      const k = nilaiKesegaran({ isEnabled: true, intervalSec: 60, lastRunAt: lalu(telat) }, SEKARANG);
      assert.equal(k.status, "SEGAR", `telat ${telat} detik seharusnya SEGAR`);
    }
  });

  test("keterlambatan diukur sebagai KELIPATAN interval, bukan angka mutlak", () => {
    // Telat 10 menit itu gawat bagi tugas 2 menit, dan bukan apa-apa bagi
    // tugas harian. Satu ambang mutlak tidak bisa melayani keduanya.
    const cepat = nilaiKesegaran({ isEnabled: true, intervalSec: 120, lastRunAt: lalu(600) }, SEKARANG);
    const harian = nilaiKesegaran({ isEnabled: true, intervalSec: 86400, lastRunAt: lalu(600) }, SEKARANG);
    assert.equal(cepat.status, "TERLAMBAT");
    assert.equal(harian.status, "SEGAR");
  });

  test("melewati sepuluh kali intervalnya dianggap MACET", () => {
    const k = nilaiKesegaran({ isEnabled: true, intervalSec: 120, lastRunAt: lalu(6 * 3600) }, SEKARANG);
    assert.equal(k.status, "MACET");
    assert.equal(vonisKesegaran(k.status), "GAWAT");
    assert.match(k.alasan, /worker kemungkinan mati/);
  });

  test("aktif tetapi belum pernah berjalan itu MACET, bukan SEGAR", () => {
    const k = nilaiKesegaran({ isEnabled: true, intervalSec: 120, lastRunAt: null }, SEKARANG);
    assert.equal(k.status, "MACET");
    assert.equal(k.telatDetik, null);
  });

  test("tugas hijau SUCCESS yang enam jam diam tetap ketahuan", () => {
    // Inilah sebabnya berkas ini ada. `lastStatus` menjawab "bagaimana hasil
    // jalan terakhir", bukan "apakah ia masih hidup".
    const k = nilaiKesegaran({ isEnabled: true, intervalSec: 300, lastRunAt: lalu(6 * 3600) }, SEKARANG);
    assert.notEqual(k.status, "SEGAR");
  });
});

describe("sewaTertinggal", () => {
  test("worker yang mati di tengah jalan meninggalkan kuncinya terpasang", () => {
    assert.equal(sewaTertinggal(lalu(600), SEKARANG, 300), true);
    assert.equal(sewaTertinggal(lalu(60), SEKARANG, 300), false);
    assert.equal(sewaTertinggal(null, SEKARANG, 300), false);
  });
});

describe("simpulkan", () => {
  test("yang terburuk menang — sistem tidak agak sehat", () => {
    assert.equal(simpulkan([{ bagian: "a", vonis: "SEHAT", pesan: "" }, { bagian: "b", vonis: "GAWAT", pesan: "" }]), "GAWAT");
    assert.equal(simpulkan([{ bagian: "a", vonis: "SEHAT", pesan: "" }, { bagian: "b", vonis: "PERHATIAN", pesan: "" }]), "PERHATIAN");
    assert.equal(simpulkan([]), "SEHAT");
  });
});

describe("lamanya", () => {
  test("jarak waktu dinyatakan dengan kata, bukan cap waktu", () => {
    // Jam VPS UTC sedangkan tim bekerja di Asia/Makassar; cap waktu menuntut
    // orang menghitung sendiri, dan hitungan itu bisa meleset satu hari penuh.
    assert.equal(lamanya(30), "30 detik lalu");
    assert.equal(lamanya(300), "5 menit lalu");
    assert.equal(lamanya(7200), "2.0 jam lalu");
    assert.equal(lamanya(null), "belum pernah");
  });
});
