import { test, describe } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  AVATAR_CROP_MIN_SIDE,
  AVATAR_SIZE,
  avatarCropRejection,
} from "@/lib/avatar";

// Sumber cukup besar supaya potongan yang wajar lolos ambang minimum.
const sumber = { width: 1200, height: 1600 };

describe("avatarCropRejection", () => {
  test("bidang yang wajar diterima", () => {
    assert.equal(avatarCropRejection({ x: 0.1, y: 0.05, width: 0.6, height: 0.45 }, sumber), null);
    assert.equal(avatarCropRejection({ x: 0, y: 0, width: 1, height: 1 }, sumber), null);
  });

  test("bidang di luar foto ditolak", () => {
    for (const c of [
      { x: -0.01, y: 0, width: 0.5, height: 0.5 },
      { x: 0, y: -0.01, width: 0.5, height: 0.5 },
      { x: 0.7, y: 0, width: 0.5, height: 0.5 },
      { x: 0, y: 0.7, width: 0.5, height: 0.5 },
    ]) {
      assert.notEqual(avatarCropRejection(c, sumber), null, JSON.stringify(c));
    }
  });

  test("bidang kosong ditolak", () => {
    assert.notEqual(avatarCropRejection({ x: 0, y: 0, width: 0, height: 0.5 }, sumber), null);
    assert.notEqual(avatarCropRejection({ x: 0, y: 0, width: 0.5, height: 0 }, sumber), null);
  });

  // Peramban rutin menghasilkan 1.0000000000000002 dari pembagian pecahan.
  // Menolaknya hanya membuat orang menggeser-geser kotak tanpa tahu sebabnya.
  test("selisih pembulatan peramban ditoleransi", () => {
    assert.equal(
      avatarCropRejection({ x: 0, y: 0, width: 1.00000000000000022, height: 1 }, sumber),
      null,
    );
  });

  test("angka tak masuk akal ditolak, bukan dibiarkan lewat", () => {
    for (const c of [
      { x: NaN, y: 0, width: 0.5, height: 0.5 },
      { x: 0, y: Infinity, width: 0.5, height: 0.5 },
      { x: 0, y: 0, width: "0.5" as unknown as number, height: 0.5 },
    ]) {
      assert.notEqual(avatarCropRejection(c as never, sumber), null, JSON.stringify(c));
    }
  });

  test("bidang terlalu kecil ditolak, dan pesannya menyebut ukurannya", () => {
    const r = avatarCropRejection({ x: 0, y: 0, width: 0.05, height: 0.05 }, sumber);
    assert.notEqual(r, null);
    assert.match(String(r), new RegExp(String(AVATAR_CROP_MIN_SIDE)));
    assert.match(String(r), /60x80/); // 0.05 x 1200 = 60, 0.05 x 1600 = 80
  });
});

// ── Kenapa `attention` diganti `centre` ─────────────────────────
//
// Ini tes yang menjaga BUG-nya tidak kembali, bukan sekadar tes pustaka.
// Gambar uji meniru potret tegak: wajah halus di sepertiga atas, motif
// berkontras tinggi di sepertiga bawah — persis pola foto orang berbaju
// bermotif atau berlatar ramai.
describe("strategi potong bawaan tidak boleh membuang wajah", () => {
  async function potretUji() {
    const W = 600;
    const H = 1200;
    const wajah = Buffer.from(
      `<svg width="${W}" height="${H}"><circle cx="300" cy="200" r="120" fill="#e8c9a0"/></svg>`,
    );
    let kotak = "";
    for (let y = 800; y < H; y += 40) {
      for (let x = 0; x < W; x += 40) {
        if (((x + y) / 40) % 2 === 0) kotak += `<rect x="${x}" y="${y}" width="40" height="40" fill="#000"/>`;
      }
    }
    return sharp({ create: { width: W, height: H, channels: 3, background: "#c8d8e8" } })
      .composite([{ input: wajah }, { input: Buffer.from(`<svg width="${W}" height="${H}">${kotak}</svg>`) }])
      .png()
      .toBuffer();
  }

  async function persenWajah(buf: Buffer) {
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    let n = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r > 200 && g > 170 && g < 220 && b > 130 && b < 190) n++;
    }
    return (n / (info.width * info.height)) * 100;
  }

  test("`attention` membuang wajahnya — inilah bug yang dilaporkan", async () => {
    const hasil = await sharp(await potretUji())
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" })
      .png()
      .toBuffer();
    // Nyaris nol. Kalau suatu saat sharp berubah dan angka ini naik, tes ini
    // gagal — dan itu kabar baik yang layak diperiksa, bukan kerusakan.
    assert.ok(await persenWajah(hasil) < 0.1, "attention ternyata tidak lagi membuang wajah");
  });

  test("`centre` — yang sekarang dipakai — mempertahankan lebih banyak wajah", async () => {
    const potret = await potretUji();
    const [dgnAttention, dgnCentre] = await Promise.all([
      sharp(potret).resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" }).png().toBuffer(),
      sharp(potret).resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "centre" }).png().toBuffer(),
    ]);
    assert.ok(
      (await persenWajah(dgnCentre)) > (await persenWajah(dgnAttention)),
      "centre harus mempertahankan lebih banyak wajah daripada attention",
    );
  });

  test("crop pilihan pengguna mengalahkan tebakan apa pun", async () => {
    // Bidang persegi di sekitar wajah: x 0.1..0.9, y 0.05..0.45 pada 600x1200.
    const potret = await potretUji();
    const dipotong = await sharp(potret)
      .extract({ left: 60, top: 60, width: 480, height: 480 })
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
    assert.ok(await persenWajah(dipotong) > 10, "potongan pilihan pengguna harus memuat wajahnya");
  });
});
