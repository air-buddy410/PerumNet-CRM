import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  db,
  actor,
  makeUser,
  tag,
  ensureMasterData,
  resetTransactionalData,
} from "./fixtures";
import { profileView } from "@/lib/profile";
import { saveEmployee } from "@/lib/hrd";
import { archiveRecord, listArchive } from "@/lib/archive";
import { attachSignatureImage, isSignableDocType } from "@/lib/document-signature";
import { PERMISSIONS } from "@/lib/constants";

// Tiga celah backend yang diminta frontend (PRD §24–25). Ketiganya kontrak,
// bukan tampilan — halamannya tetap urusan Luna.

let HRD: ReturnType<typeof actor>;

function pngFile(name = "ttd.png"): File {
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415478da6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
    "hex"
  );
  return new File([new Uint8Array(png)], name, { type: "image/png" });
}

describe("profileView membawa field kepegawaian Fase 41", () => {
  before(async () => {
    await resetTransactionalData();
    await ensureMasterData();
    HRD = actor((await makeUser(tag("hrd").toLowerCase(), "HRD")).id, "hrd");
  });
  after(async () => {
    await resetTransactionalData();
    await db.$disconnect();
  });

  test("karyawan kontrak: alamat, pola kerja, jenjang, dan masa kontrak ikut", async () => {
    const u = await makeUser(tag("p").toLowerCase(), "Pegawai Kontrak");
    const saved = await saveEmployee(HRD, {
      employeeNo: tag("EMP"),
      fullName: "Pegawai Kontrak",
      employeeType: "CONTRACT",
      joinedAt: new Date("2025-03-01"),
      userId: u.id,
      address: "Jl. Melati No. 7",
      workPattern: "SHIFT",
      jobLevel: "LEADER",
      contractStartAt: new Date("2026-01-01"),
      contractEndAt: new Date("2026-12-31"),
    });
    assert.equal(saved.ok, true, saved.ok ? "" : saved.error);

    const view = await profileView(u.id);
    assert.equal(view!.employee!.address, "Jl. Melati No. 7");
    assert.equal(view!.employee!.workPattern, "SHIFT");
    assert.equal(view!.employee!.jobLevel, "LEADER");
    assert.ok(view!.employee!.contractStartAt);
    assert.ok(view!.employee!.contractEndAt);
  });

  test("karyawan tetap: tanggal kontrak null, bukan tanggal palsu", async () => {
    const u = await makeUser(tag("q").toLowerCase(), "Pegawai Tetap");
    await saveEmployee(HRD, {
      employeeNo: tag("EMP"),
      fullName: "Pegawai Tetap",
      employeeType: "FULL_TIME",
      joinedAt: new Date("2024-01-01"),
      userId: u.id,
    });
    const view = await profileView(u.id);
    assert.equal(view!.employee!.contractStartAt, null);
    assert.equal(view!.employee!.contractEndAt, null);
    // Nilai bawaan tetap terisi, bukan undefined — UI tidak perlu menebak.
    assert.equal(view!.employee!.workPattern, "NON_SHIFT");
    assert.equal(view!.employee!.jobLevel, "STAFF");
  });

  test("tanggal dikirim sebagai ISO string, konsisten dengan joinedAt", async () => {
    const u = await db.user.findFirst({ where: { employee: { employeeType: "CONTRACT" } } });
    const view = await profileView(u!.id);
    assert.match(view!.employee!.contractEndAt!, /^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("listArchive: filter rentang tanggal", () => {
  let actorId: string;

  before(async () => {
    await resetTransactionalData();
    await ensureMasterData();
    actorId = (await makeUser(tag("arc").toLowerCase(), "Pengarsip")).id;

    // Tiga baris pada tiga hari berbeda.
    for (const [label, at] of [
      ["lama", new Date("2026-06-01T10:00:00")],
      ["tengah", new Date("2026-07-15T10:00:00")],
      ["baru", new Date("2026-08-12T17:45:00")],
    ] as const) {
      const r = await archiveRecord(actorId, {
        entityType: "Widget",
        entityId: `w-${label}`,
        label,
        snapshot: {},
        reason: `uji ${label}`,
      });
      await db.archivedRecord.update({
        where: { id: (r as { id: string }).id },
        data: { archivedAt: at },
      });
    }
  });
  after(async () => {
    await resetTransactionalData();
    await db.$disconnect();
  });

  test("tanpa filter, ketiganya muncul", async () => {
    assert.equal((await listArchive({})).length, 3);
  });

  test("batas bawah menyaring yang lebih lama", async () => {
    const rows = await listArchive({ from: new Date("2026-07-01") });
    assert.deepEqual(rows.map((r) => r.label).sort(), ["baru", "tengah"]);
  });

  test("BATAS ATAS INKLUSIF — baris pada hari itu ikut terjaring", async () => {
    // Inti perbaikannya: memilih "sampai 12 Agustus" harus memuat baris
    // pukul 17:45 pada tanggal 12 itu sendiri.
    const rows = await listArchive({ to: new Date("2026-08-12T00:00:00") });
    assert.equal(rows.some((r) => r.label === "baru"), true, "baris 12 Agustus harus ikut");
    assert.equal(rows.length, 3);
  });

  test("rentang sempit hanya memuat yang di dalamnya", async () => {
    const rows = await listArchive({
      from: new Date("2026-07-01"),
      to: new Date("2026-07-31"),
    });
    assert.deepEqual(rows.map((r) => r.label), ["tengah"]);
  });

  test("filter tanggal bisa digabung dengan jenis dan status", async () => {
    const rows = await listArchive({
      entityType: "Widget",
      onlyPending: true,
      from: new Date("2026-06-01"),
    });
    assert.equal(rows.length, 3);
    const kosong = await listArchive({ entityType: "Lain", from: new Date("2026-06-01") });
    assert.equal(kosong.length, 0);
  });
});

describe("gambar tanda tangan dokumen gudang", () => {
  let gudang: ReturnType<typeof actor>;
  let docId: string;

  before(async () => {
    await resetTransactionalData();
    await ensureMasterData();
    const u = await makeUser(tag("wh").toLowerCase(), "Gudang");
    gudang = actor(u.id, u.username, {
      permissions: new Set([PERMISSIONS.STOCK_CREATE, PERMISSIONS.INVENTORY_VIEW]),
    });
    docId = `irf-${tag("D")}`;
    await db.documentSignature.create({
      data: { docType: "IRF", docId, role: "REQUESTOR", signerName: "Pak Budi" },
    });
  });
  after(async () => {
    await resetTransactionalData();
    await db.$disconnect();
  });

  test("jenis dokumen yang dikenal saja", () => {
    assert.equal(isSignableDocType("IRF"), true);
    assert.equal(isSignableDocType("RECEIPT"), true);
    // Gagal-tertutup: jenis asing ditolak, bukan dilewatkan.
    assert.equal(isSignableDocType("APA_SAJA"), false);
  });

  test("melampirkan gambar dan MENAUTKANNYA sekaligus", async () => {
    const r = await attachSignatureImage(
      gudang,
      { docType: "IRF", docId, role: "REQUESTOR" },
      pngFile()
    );
    assert.equal(r.ok, true, r.ok ? "" : r.error);

    // Pemanggil tidak perlu langkah kedua yang bisa terlupakan.
    const sig = await db.documentSignature.findFirst({ where: { docId, role: "REQUESTOR" } });
    assert.equal(sig!.attachmentId, (r as { id: string }).id);
  });

  test("lampirannya berjangkar pada BARIS TANDA TANGAN, bukan pada dokumennya", async () => {
    const sig = await db.documentSignature.findFirst({ where: { docId, role: "REQUESTOR" } });
    const att = await db.attachment.findUnique({ where: { id: sig!.attachmentId! } });
    assert.equal(att!.entityType, "DocumentSignatureImage");
    assert.equal(att!.entityId, sig!.id);
  });

  test("TANDA TANGAN YANG BELUM ADA ditolak — gambar tidak menciptakan tanda tangan", async () => {
    // Nama penanda tangan tetap yang wajib; gambar hanya pelengkap.
    const r = await attachSignatureImage(
      gudang,
      { docType: "IRF", docId, role: "WAREHOUSE_ADMIN" },
      pngFile()
    );
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /belum dibubuhkan/);
  });

  test("jenis dokumen tak dikenal ditolak", async () => {
    const r = await attachSignatureImage(
      gudang,
      { docType: "SURAT_SAKTI", docId, role: "REQUESTOR" },
      pngFile()
    );
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /tidak menerima gambar tanda tangan/);
  });

  test("tanpa izin dokumennya, ditolak", async () => {
    const lain = actor("x", "Tanpa Izin", { permissions: new Set([PERMISSIONS.INVENTORY_VIEW]) });
    const r = await attachSignatureImage(
      lain,
      { docType: "IRF", docId, role: "REQUESTOR" },
      pngFile()
    );
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /tidak memiliki izin/);
  });

  test("berkas non-gambar ditolak mesin lampiran", async () => {
    const jahat = new File([new Uint8Array([60, 63, 112, 104, 112])], "ttd.php", {
      type: "application/x-php",
    });
    const r = await attachSignatureImage(
      gudang,
      { docType: "IRF", docId, role: "REQUESTOR" },
      jahat
    );
    assert.equal(r.ok, false);
  });
});
