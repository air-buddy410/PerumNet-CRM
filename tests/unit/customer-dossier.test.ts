import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { JENIS_BERKAS, BERKAS_PII, jenisBerkasSah, ENTITAS_TERKAIT, susunRiwayat } from "@/lib/customer-dossier";

describe("jenis berkas pelanggan", () => {
  test("jenis yang tidak terdaftar ditolak — gagal-tertutup", () => {
    // Rute penyajian berkas memetakan entityType ke izin; jenis yang lolos
    // tanpa didaftarkan akan gagal mendapat izinnya dan menjadi 404. Penjagaan
    // di sisi unggah mencegahnya tersimpan sejak awal.
    assert.equal(jenisBerkasSah(JENIS_BERKAS.KTP), true);
    assert.equal(jenisBerkasSah(JENIS_BERKAS.FORM), true);
    assert.equal(jenisBerkasSah("Customer"), false);
    assert.equal(jenisBerkasSah("../../etc/passwd"), false);
  });

  test("hanya scan identitas yang ditandai PII", () => {
    // Melindungi kolom NIK pada daftar lalu membiarkan scan KTP-nya terbuka
    // berarti tidak melindungi apa pun.
    assert.equal(BERKAS_PII.has(JENIS_BERKAS.KTP), true);
    assert.equal(BERKAS_PII.has(JENIS_BERKAS.FORM), false);
    assert.equal(BERKAS_PII.has(JENIS_BERKAS.FOTO), false);
  });
});

describe("riwayat pelanggan", () => {
  test("menjaring lintas entitas, bukan hanya Customer", () => {
    // Perubahan yang paling berarti bagi pelanggan — diisolir, ditagih,
    // perangkatnya ditarik — tercatat pada entitas LAIN. Layar yang berbunyi
    // "tidak ada perubahan" untuk pelanggan yang bulan lalu diisolir lebih
    // buruk daripada tidak ada layar.
    for (const e of ["Customer", "Subscription", "Invoice", "ServiceSuspension"]) {
      assert.ok((ENTITAS_TERKAIT as readonly string[]).includes(e), `${e} harus ikut terjaring`);
    }
  });

  test("terbaru di atas", () => {
    const r = susunRiwayat([
      { createdAt: new Date("2026-01-01"), action: "A", module: "m", description: "lama", user: null },
      { createdAt: new Date("2026-08-01"), action: "B", module: "m", description: "baru", user: { name: "Ayu" } },
    ]);
    assert.equal(r[0].keterangan, "baru");
    assert.equal(r[0].oleh, "Ayu");
    assert.equal(r[1].oleh, null);
  });
});
