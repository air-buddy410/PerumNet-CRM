import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { koordinatDariForm } from "@/lib/noc-site";

// Koordinat site jaringan (Fase 65).
//
// Kolom latitude/longitude ada di NetworkSite sejak lama dan DIBACA peta —
// loadNetworkMap() menyaring `latitude: { not: null }`. Tetapi tidak pernah ada
// jalur yang MENULISNYA, jadi POP dan MINI_POP mustahil muncul di peta apa pun
// yang dilakukan orang. Yang diuji di sini aturan jalur tulis itu.

function form(isi: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(isi)) f.append(k, v);
  return f;
}

describe("koordinat site dari formulir", () => {
  test("terisi keduanya → angka", () => {
    const r = koordinatDariForm(form({ latitude: "-8.4095", longitude: "115.1889" }));
    assert.equal(r.ok, true);
    assert.deepEqual(r.ok && r.data, { latitude: -8.4095, longitude: 115.1889 });
  });

  test("FIELD TIDAK ADA → kolomnya tidak disentuh", () => {
    // Ini yang melindungi koordinat lapangan dari formulir lama yang belum
    // punya inputnya. Pelajaran yang sama dengan data pegawai: yang tidak
    // disebut bukan berarti dihapus.
    const r = koordinatDariForm(form({ name: "POP Kecicang" }));
    assert.equal(r.ok, true);
    assert.deepEqual(r.ok && r.data, {}, "tidak boleh ada kunci apa pun");
  });

  test("field ADA tapi kosong → sengaja dihapus", () => {
    const r = koordinatDariForm(form({ latitude: "", longitude: "" }));
    assert.equal(r.ok, true);
    assert.deepEqual(r.ok && r.data, { latitude: null, longitude: null });
  });

  test("SATU SAJA yang diisi DITOLAK", () => {
    // Site berlintang tanpa bujur tidak akan pernah muncul di peta — peta
    // menyaring keduanya — jadi orang mengira sudah memasukkannya padahal
    // titiknya tidak ada di mana pun.
    for (const isi of [
      { latitude: "-8.4095", longitude: "" },
      { latitude: "", longitude: "115.1889" },
    ]) {
      const r = koordinatDariForm(form(isi));
      assert.equal(r.ok, false, JSON.stringify(isi));
      assert.match(r.ok ? "" : r.error, /keduanya/);
    }
  });

  test("di luar jangkauan DITOLAK — termasuk lintang & bujur TERTUKAR", () => {
    // Tertukar adalah salah ketik paling sering pada koordinat, dan di
    // Indonesia ia selalu tertangkap: bujur kita di atas 90, sementara lintang
    // hanya sampai 90.
    const r = koordinatDariForm(form({ latitude: "115.1889", longitude: "-8.4095" }));
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /-90/);
  });

  test("titik nol DITOLAK — itu GPS yang gagal mengunci", () => {
    const r = koordinatDariForm(form({ latitude: "0", longitude: "0" }));
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /GPS/);
  });

  test("bukan angka DITOLAK, tidak diam-diam jadi NaN", () => {
    const r = koordinatDariForm(form({ latitude: "delapan", longitude: "115" }));
    assert.equal(r.ok, false);
  });

  test("spasi di sekitar angka dimaafkan", () => {
    const r = koordinatDariForm(form({ latitude: "  -8.4095 ", longitude: " 115.1889" }));
    assert.equal(r.ok, true);
    assert.deepEqual(r.ok && r.data, { latitude: -8.4095, longitude: 115.1889 });
  });
});
