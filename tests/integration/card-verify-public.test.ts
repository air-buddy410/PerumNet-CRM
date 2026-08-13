import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { db, makeUser, tag, ensureMasterData, resetTransactionalData } from "./fixtures";
import { verifyCardToken, newCardToken, EMPLOYEE_PHOTO_ENTITY } from "@/lib/employee-card-service";
import { isOidcBypassPath } from "@/lib/oidc-rules";

// Verifikasi kartu publik (Fase 50).
//
// Halaman ini dibuka TANPA LOGIN oleh pelanggan di depan pintunya. Yang diuji
// di sini bukan "kartunya bisa diverifikasi", melainkan apa yang TIDAK BOLEH
// bocor: wajah dan nama orang yang kartunya sudah tidak berlaku, dan lampiran
// apa pun selain foto pegawai itu sendiri.

describe("verifikasi kartu publik", () => {
  let employeeId: string;
  let photoId: string;
  let penerbitId: string;

  before(async () => {
    await resetTransactionalData();
    await ensureMasterData();
    const hrd = await makeUser(tag("hrd").toLowerCase(), "HRD");
    penerbitId = hrd.id;
    const emp = await db.employee.create({
      data: {
        employeeNo: "10009001",
        fullName: "Teknisi Lapangan Uji",
        jobTitle: "Teknisi",
        employeeType: "FULL_TIME",
        joinedAt: new Date("2026-01-06"),
      },
    });
    employeeId = emp.id;
    const att = await db.attachment.create({
      data: {
        entityType: EMPLOYEE_PHOTO_ENTITY,
        entityId: emp.id,
        filename: "foto.jpg",
        storedName: "uji-foto.jpg",
        mimeType: "image/jpeg",
        size: 1234,
        uploadedById: hrd.id,
      },
    });
    photoId = att.id;
    await db.employee.update({ where: { id: emp.id }, data: { photoAttachmentId: att.id } });
  });
  after(async () => {
    await resetTransactionalData();
    await db.$disconnect();
  });

  async function buatKartu(over: Partial<{ status: string; expiresAt: Date | null }> = {}) {
    const token = newCardToken();
    await db.employeeCard.create({
      data: {
        employeeId,
        cardNumber: `CARD-${tag("C")}`,
        publicToken: token,
        issuedById: penerbitId,
        status: over.status ?? "ACTIVE",
        expiresAt: over.expiresAt === undefined ? null : over.expiresAt,
      },
    });
    return token;
  }

  test("kartu berlaku menjawab seperlunya — dan tidak lebih", async () => {
    const token = await buatKartu();
    const r = await verifyCardToken(token);
    assert.equal(r.valid, true);
    assert.equal(r.employeeName, "Teknisi Lapangan Uji");
    assert.equal(r.jobTitle, "Teknisi");

    // Yang TIDAK boleh ada di jawaban publik. Kartu dipakai di tempat umum
    // sepanjang hari; anggap semua yang bisa dipindai akan dilihat orang asing.
    const teks = JSON.stringify(r);
    assert.equal(teks.includes("10009001"), false, "NIK tidak boleh ikut");
    assert.equal(teks.includes(employeeId), false, "id internal tidak boleh ikut");
  });

  test("FOTO menunjuk jalur publik berkunci TOKEN, bukan id lampiran", async () => {
    // Ini inti Fase 50. Kalau menunjuk /api/files/<id>, halamannya butuh login
    // dan izin hrd.view — dan melonggarkannya akan melonggarkan SELURUH
    // lampiran aplikasi, termasuk bukti pekerjaan dan tanda tangan.
    const token = await buatKartu();
    const r = await verifyCardToken(token);
    assert.equal(r.photoUrl, `/api/verify/${token}/photo`);
    assert.equal(r.photoUrl!.includes("/api/files/"), false);
    assert.equal(r.photoUrl!.includes(photoId), false, "id lampiran tidak boleh beredar");
  });

  test("KARTU DICABUT: tidak ada nama, tidak ada foto", async () => {
    const token = await buatKartu({ status: "REVOKED" });
    const r = await verifyCardToken(token);
    assert.equal(r.valid, false);
    assert.equal(r.employeeName, null);
    assert.equal(r.photoUrl, null, "wajah orang tidak boleh tampil dari kartu yang dicabut");
    assert.notEqual(r.reason, null, "tetap dijawab, bukan didiamkan");
  });

  test("KARTU KEDALUWARSA: sama, dan alasannya tidak menyebut nama siapa pun", async () => {
    const token = await buatKartu({ expiresAt: new Date("2020-01-01") });
    const r = await verifyCardToken(token);
    assert.equal(r.valid, false);
    assert.equal(r.employeeName, null);
    assert.equal(r.photoUrl, null);
    assert.equal(r.reason!.includes("Teknisi Lapangan Uji"), false);
  });

  test("PEGAWAI DIARSIPKAN mematikan kartunya, meski kartunya sendiri masih ACTIVE", async () => {
    const token = await buatKartu();
    await db.employee.update({ where: { id: employeeId }, data: { isActive: false } });
    const r = await verifyCardToken(token);
    assert.equal(r.valid, false);
    assert.equal(r.photoUrl, null);
    await db.employee.update({ where: { id: employeeId }, data: { isActive: true } });
  });

  test("token ngawur tidak menyentuh database dan tidak membocorkan apa pun", async () => {
    for (const buruk of ["", "pendek", "x".repeat(31)]) {
      const r = await verifyCardToken(buruk);
      assert.equal(r.valid, false);
      assert.equal(r.employeeName, null);
      assert.equal(r.photoUrl, null);
    }
  });

  test("token yang panjangnya cukup tapi tidak terdaftar tetap ditolak", async () => {
    const r = await verifyCardToken("z".repeat(64));
    assert.equal(r.valid, false);
    assert.equal(r.employeeName, null);
  });

  test("jalur verifikasi TIDAK ikut dibelokkan ke penyedia identitas", async () => {
    // Halaman publik yang dilempar ke login akan mematikan seluruh gunanya.
    assert.equal(isOidcBypassPath("/api/verify/abc/photo"), false, "bukan jalur OIDC");
  });
});
