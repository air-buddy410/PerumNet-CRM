import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { canViewRecovery, isRecoveryCoordinator } from "@/lib/recovery";

// §9.2 FR-PICK-002 — teknisi hanya melihat tugasnya sendiri. Aturan ini tidak
// boleh hidup di halaman: menyaring daftar tetapi membiarkan halaman detail
// terbuka berarti siapa pun yang tahu id-nya bisa membaca nama, alamat, dan
// nomor telepon pelanggan yang bukan urusannya.

const tech = { id: "tech-1", permissions: new Set(["device_recovery.pickup", "inventory.view"]) };
const lain = { id: "tech-2", permissions: new Set(["device_recovery.pickup", "inventory.view"]) };
const gudang = { id: "wh-1", permissions: new Set(["device_recovery.receive", "inventory.view"]) };
const koordinator = { id: "co-1", permissions: new Set(["device_recovery.assign"]) };
const manajemen = { id: "mg-1", permissions: new Set(["device_recovery.escalate"]) };

const milikTech1 = { assigneeId: "tech-1", workOrderTechnicianId: "tech-1" };
const milikTech2 = { assigneeId: "tech-2", workOrderTechnicianId: "tech-2" };
const belumDitugaskan = { assigneeId: null, workOrderTechnicianId: null };

describe("isRecoveryCoordinator", () => {
  test("peran gudang, koordinator, dan manajemen dianggap koordinasi", () => {
    for (const u of [gudang, koordinator, manajemen]) {
      assert.equal(isRecoveryCoordinator(u), true);
    }
  });

  test("teknisi murni bukan koordinator", () => {
    assert.equal(isRecoveryCoordinator(tech), false);
  });
});

describe("canViewRecovery", () => {
  test("teknisi melihat tugasnya sendiri", () => {
    assert.equal(canViewRecovery(tech, milikTech1), true);
  });

  test("teknisi TIDAK melihat tugas teknisi lain", () => {
    // Inilah lubang yang ditutup: daftar menyaringnya, halaman detail tidak.
    assert.equal(canViewRecovery(tech, milikTech2), false);
  });

  test("teknisi tidak melihat penarikan yang belum ditugaskan", () => {
    assert.equal(canViewRecovery(tech, belumDitugaskan), false);
  });

  test("cukup salah satu: assignee ATAU teknisi work order", () => {
    // Keduanya bisa berbeda bila penugasan diubah lewat work order.
    assert.equal(
      canViewRecovery(tech, { assigneeId: "tech-1", workOrderTechnicianId: "tech-9" }),
      true
    );
    assert.equal(
      canViewRecovery(tech, { assigneeId: "tech-9", workOrderTechnicianId: "tech-1" }),
      true
    );
  });

  test("peran koordinasi melihat seluruhnya", () => {
    for (const u of [gudang, koordinator, manajemen]) {
      assert.equal(canViewRecovery(u, milikTech1), true);
      assert.equal(canViewRecovery(u, milikTech2), true);
      assert.equal(canViewRecovery(u, belumDitugaskan), true);
    }
  });

  test("teknisi yang JUGA memegang izin koordinasi melihat seluruhnya", () => {
    // Perubahan ini sengaja sesempit mungkin — hanya teknisi murni yang
    // dibatasi, supaya tidak ada peran yang kehilangan akses tanpa alasan.
    const merangkap = {
      id: "tech-1",
      permissions: new Set(["device_recovery.pickup", "device_recovery.receive"]),
    };
    assert.equal(canViewRecovery(merangkap, milikTech2), true);
  });

  test("bukan teknisi dan bukan koordinator: perilakunya tidak berubah", () => {
    const penonton = { id: "x", permissions: new Set(["inventory.view"]) };
    assert.equal(canViewRecovery(penonton, milikTech2), true);
  });
});
