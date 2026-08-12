import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  db,
  actor,
  makeUser,
  ensureMasterData,
  resetTransactionalData,
  tag,
} from "./fixtures";
import { saveEmployee } from "@/lib/hrd";
import {
  freezeAccount,
  unfreezeAccount,
  sweepEmploymentLifecycle,
} from "@/lib/employment-lifecycle";
import { archiveRecord, restoreRecord, listArchive } from "@/lib/archive";
import { FREEZE_GRACE_MONTHS, addMonths } from "@/lib/employment";

// Pelakunya harus user SUNGGUHAN: logAudit dan ArchivedRecord.archivedById
// keduanya berelasi ke User, jadi id karangan ditolak foreign key.
let HRD: ReturnType<typeof actor>;

async function makeHrdActor() {
  const u = await makeUser(tag("hrd").toLowerCase(), "HRD Uji");
  return actor(u.id, u.username);
}

const daysFromNow = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

/** Membuat karyawan kontrak beserta akunnya, dengan tanggal berakhir tertentu. */
async function makeContractEmployee(endAt: Date | null, opts: { withUser?: boolean } = {}) {
  const t = tag("EMP");
  const user = opts.withUser === false ? null : await makeUser(t.toLowerCase(), `Pegawai ${t}`);
  const saved = await saveEmployee(HRD, {
    employeeNo: t,
    fullName: `Pegawai ${t}`,
    employeeType: endAt ? "CONTRACT" : "FULL_TIME",
    joinedAt: new Date("2025-01-01"),
    userId: user?.id ?? null,
    contractEndAt: endAt,
  });
  assert.equal(saved.ok, true, saved.ok ? "" : saved.error);
  return { employeeId: (saved as { id: string }).id, user };
}

describe("siklus kepegawaian: kontrak → beku → arsip", () => {
  before(async () => {
    await ensureMasterData();
    await resetTransactionalData();
    HRD = await makeHrdActor();
  });
  after(async () => {
    await resetTransactionalData();
    await db.$disconnect();
  });

  test("karyawan tetap tidak bisa menyimpan tanggal kontrak", async () => {
    // Aturan keselamatan, bukan kerapian: penyapu membekukan berdasarkan
    // contractEndAt, jadi tanggal nyasar akan membekukan orang yang bekerja.
    const result = await saveEmployee(HRD, {
      employeeNo: tag("EMP"),
      fullName: "Karyawan Tetap",
      employeeType: "FULL_TIME",
      joinedAt: new Date("2025-01-01"),
      contractEndAt: daysFromNow(30),
    });
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /hanya berlaku untuk jenis Kontrak/);
  });

  test("kontrak tanpa tanggal berakhir ditolak di service layer", async () => {
    const result = await saveEmployee(HRD, {
      employeeNo: tag("EMP"),
      fullName: "Kontrak Tanpa Batas",
      employeeType: "CONTRACT",
      joinedAt: new Date("2025-01-01"),
      contractEndAt: null,
    });
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /wajib memiliki tanggal berakhir/);
  });

  test("penyapu membekukan akun yang kontraknya sudah lewat", async () => {
    const { user } = await makeContractEmployee(daysFromNow(-1));
    const r = await sweepEmploymentLifecycle();
    assert.equal(r.frozen >= 1, true, r.summary);

    const after = await db.user.findUnique({ where: { id: user!.id } });
    assert.notEqual(after!.frozenAt, null);
    assert.match(after!.freezeReason ?? "", /Kontrak berakhir/);
  });

  test("membekukan menaikkan sessionEpoch — sesi berjalan ikut tertutup", async () => {
    const { user } = await makeContractEmployee(daysFromNow(-1));
    const before = await db.user.findUnique({ where: { id: user!.id } });
    await sweepEmploymentLifecycle();
    const after = await db.user.findUnique({ where: { id: user!.id } });
    assert.equal(after!.sessionEpoch, before!.sessionEpoch + 1);
  });

  test("DATA KARYAWAN tidak ikut dibekukan — hanya akunnya", async () => {
    // Inti keputusan E4: absensi, cuti, dan jejak persetujuan wajib bertahan.
    const { employeeId, user } = await makeContractEmployee(daysFromNow(-1));
    await sweepEmploymentLifecycle();

    const emp = await db.employee.findUnique({ where: { id: employeeId } });
    assert.equal(emp!.isActive, true, "baris Employee tidak boleh disentuh");
    assert.equal(emp!.contractEndAt !== null, true);
    const acc = await db.user.findUnique({ where: { id: user!.id } });
    assert.notEqual(acc!.frozenAt, null);
  });

  test("penyapu dijalankan dua kali tidak membekukan ulang", async () => {
    // Pembekuan ulang akan menaikkan epoch tiap hari dan menimpa alasan yang
    // mungkin diisi manusia.
    const { user } = await makeContractEmployee(daysFromNow(-1));
    await sweepEmploymentLifecycle();
    const once = await db.user.findUnique({ where: { id: user!.id } });
    const second = await sweepEmploymentLifecycle();
    const twice = await db.user.findUnique({ where: { id: user!.id } });

    assert.equal(twice!.sessionEpoch, once!.sessionEpoch, "epoch tidak boleh naik lagi");
    assert.deepEqual(twice!.frozenAt, once!.frozenAt);
    assert.equal(second.frozen, 0);
  });

  test("kontrak yang belum berakhir tidak dibekukan", async () => {
    const { user } = await makeContractEmployee(daysFromNow(45));
    await sweepEmploymentLifecycle();
    const after = await db.user.findUnique({ where: { id: user!.id } });
    assert.equal(after!.frozenAt, null);
  });

  test("karyawan kontrak tanpa akun sistem tidak menggagalkan penyapu", async () => {
    await makeContractEmployee(daysFromNow(-1), { withUser: false });
    const r = await sweepEmploymentLifecycle();
    assert.equal(typeof r.summary, "string");
  });

  test("pencairan mengembalikan akses dan menaikkan epoch lagi", async () => {
    const { user } = await makeContractEmployee(daysFromNow(-1));
    await sweepEmploymentLifecycle();
    const frozen = await db.user.findUnique({ where: { id: user!.id } });

    const r = await unfreezeAccount(HRD, user!.id, "Kontrak diperpanjang.");
    assert.equal(r.ok, true, r.ok ? "" : r.error);

    const thawed = await db.user.findUnique({ where: { id: user!.id } });
    assert.equal(thawed!.frozenAt, null);
    assert.equal(thawed!.freezeReason, null);
    assert.equal(thawed!.sessionEpoch, frozen!.sessionEpoch + 1);
  });

  test("pembekuan dan pencairan wajib menyertakan alasan", async () => {
    const { user } = await makeContractEmployee(daysFromNow(45));
    const noReason = await freezeAccount(HRD.id, user!.id, "  ");
    assert.equal(noReason.ok, false);
    assert.match(noReason.ok ? "" : noReason.error, /Alasan pembekuan wajib/);

    await freezeAccount(HRD.id, user!.id, "Penyelidikan internal.");
    const thawNoReason = await unfreezeAccount(HRD, user!.id, "");
    assert.equal(thawNoReason.ok, false);
  });

  test("akun yang sudah beku tidak bisa dibekukan dua kali", async () => {
    const { user } = await makeContractEmployee(daysFromNow(45));
    await freezeAccount(HRD.id, user!.id, "Alasan pertama.");
    const again = await freezeAccount(HRD.id, user!.id, "Alasan kedua.");
    assert.equal(again.ok, false);
    assert.match(again.ok ? "" : again.error, /sudah beku/);
  });
});

describe("pengarsipan setelah masa tenggang", () => {
  before(async () => {
    await ensureMasterData();
    await resetTransactionalData();
    HRD = await makeHrdActor();
  });
  after(async () => {
    await resetTransactionalData();
    await db.$disconnect();
  });

  test("akun beku melewati masa tenggang diarsipkan, TIDAK dihapus", async () => {
    const user = await makeUser(tag("arc").toLowerCase(), "Sudah Lama Beku");
    // Mundurkan tanggal beku melewati masa tenggang.
    const longAgo = addMonths(new Date(), -(FREEZE_GRACE_MONTHS + 1));
    await db.user.update({
      where: { id: user.id },
      data: { frozenAt: longAgo, freezeReason: "Kontrak berakhir (uji)." },
    });

    const r = await sweepEmploymentLifecycle();
    assert.equal(r.archived >= 1, true, r.summary);

    // Barisnya HARUS masih ada — dirujuk audit log, approval, dan dokumen.
    const still = await db.user.findUnique({ where: { id: user.id } });
    assert.notEqual(still, null, "baris User tidak boleh dihapus");
    assert.equal(still!.isActive, false);

    const rows = await listArchive({ entityType: "User" });
    const mine = rows.find((x) => x.entityId === user.id);
    assert.notEqual(mine, undefined);
    assert.match(mine!.reason, /masa tenggang/);
  });

  test("snapshot arsip TIDAK memuat passwordHash", async () => {
    // Snapshot ditampilkan di halaman arsip; memasukkan hash ke sana
    // memindahkan rahasia ke tempat yang lebih mudah dibaca dari tabel asal.
    const rows = await listArchive({ entityType: "User" });
    assert.equal(rows.length > 0, true);
    for (const row of rows) {
      assert.equal(row.snapshot.includes("passwordHash"), false);
      assert.equal(row.snapshot.includes("$2"), false, "tidak boleh ada hash bcrypt");
    }
  });

  test("pelaku pengarsipan otomatis dicatat null, bukan diatasnamakan admin", async () => {
    const rows = await listArchive({ entityType: "User" });
    const auto = rows.find((r) => r.reason.includes("otomatis"));
    assert.notEqual(auto, undefined);
    assert.equal(auto!.archivedById, null);
  });

  test("memulihkan mengembalikan akun dan menandai barisnya", async () => {
    const rows = await listArchive({ entityType: "User", onlyPending: true });
    const target = rows[0];
    assert.notEqual(target, undefined);

    const r = await restoreRecord(HRD, target.id);
    assert.equal(r.ok, true, r.ok ? "" : r.error);

    const acc = await db.user.findUnique({ where: { id: target.entityId } });
    assert.equal(acc!.isActive, true);
    assert.equal(acc!.frozenAt, null, "pemulihan juga mencairkan pembekuannya");

    const row = await db.archivedRecord.findUnique({ where: { id: target.id } });
    assert.notEqual(row!.restoredAt, null);
    assert.equal(row!.restoredById, HRD.id);
  });

  test("baris yang sudah dipulihkan tidak bisa dipulihkan dua kali", async () => {
    const rows = await listArchive({ entityType: "User" });
    const restored = rows.find((r) => r.restoredAt !== null);
    assert.notEqual(restored, undefined);
    const again = await restoreRecord(HRD, restored!.id);
    assert.equal(again.ok, false);
    assert.match(again.ok ? "" : again.error, /Sudah dipulihkan/);
  });

  test("baris yang sudah dipulihkan TETAP ada di daftar — jejaknya tidak hilang", async () => {
    const all = await listArchive({});
    const pending = await listArchive({ onlyPending: true });
    assert.equal(
      all.length > pending.length,
      true,
      "yang sudah dipulihkan harus tetap muncul di daftar lengkap"
    );
  });

  test("mengarsipkan tanpa alasan ditolak", async () => {
    const user = await makeUser(tag("nr").toLowerCase(), "Tanpa Alasan");
    const r = await archiveRecord(HRD.id, {
      entityType: "User",
      entityId: user.id,
      label: "Tanpa Alasan",
      snapshot: { username: user.username },
      reason: "  ",
    });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /Alasan pengarsipan wajib/);
  });

  test("jenis tanpa jalur pemulihan ditolak dengan jujur, bukan pura-pura berhasil", async () => {
    const r = await archiveRecord(HRD.id, {
      entityType: "Widget",
      entityId: "widget-1",
      label: "Widget Uji",
      snapshot: { a: 1 },
      reason: "Uji jenis tak dikenal.",
    });
    assert.equal(r.ok, true);
    const restore = await restoreRecord(HRD, (r as { id: string }).id);
    assert.equal(restore.ok, false);
    assert.match(restore.ok ? "" : restore.error, /belum memiliki jalur pemulihan/);
  });
});
