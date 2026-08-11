import { test, describe, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import {
  db, tag, actor, approvedTermination, ensureMasterData, ensureApprovalRule,
  makeUser, makeDevice, makeCustomerWithService, resetTransactionalData, onHandOf,
} from "./fixtures";
import {
  assignRecovery,
  pickupDevices,
  receiveDevices,
  inspectDevice,
  attachRecoveryEvidence,
} from "@/lib/device-recovery";
import { createTermination, submitTermination, syncTerminationDecision } from "@/lib/termination";
import { actOnApproval } from "@/lib/approval";

// PRD §19.2 menuntut uji konkurensi. Dua di antaranya BUKAN teori: keduanya
// pernah nyata di repo ini dan hanya ketahuan setelah dijalankan berdampingan
// dengan kode sebelum perbaikan.
//
// Yang dijaga bukan "tidak ada error", melainkan tidak ada AKIBAT ganda:
// satu perangkat tidak boleh menghasilkan dua catatan pergerakan, dan tidak
// boleh menambah saldo dua kali.

const CHECKLIST = {
  casing: true, boot: true, reset: true, lan: true, wifi: true, optical: true, accessories: true,
};
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(48).fill(0)]);
const photo = () => new File([new Uint8Array(PNG)], "bukti.png", { type: "image/png" });

describe("konkurensi (PRD §19.2)", () => {
  before(async () => { await resetTransactionalData(); await ensureMasterData(); });
  beforeEach(async () => { await resetTransactionalData(); await ensureMasterData(); });
  after(async () => { await resetTransactionalData(); await db.$disconnect(); });

  test("dua penarikan bersamaan pada perangkat yang sama: hanya satu menang", async () => {
    const s = await approvedTermination({ label: tag("RACE1") });
    const row = s.itemRows[0];
    await assignRecovery(s.cs, s.recoveryId, s.manager.id, new Date());

    const [a, b] = await Promise.all([
      pickupDevices(s.cs, s.recoveryId, [{ itemId: row.id, actualSerial: row.snapshotSerial }]),
      pickupDevices(s.manager, s.recoveryId, [{ itemId: row.id, actualSerial: row.snapshotSerial }]),
    ]);

    assert.equal([a, b].filter((r) => r.ok).length, 1, "tepat satu berhasil");
    const moves = await db.deviceMovement.count({
      where: { deviceId: row.deviceId, action: "RECOVERY_PICKED_UP" },
    });
    assert.equal(moves, 1, "satu perangkat, satu catatan pergerakan");
  });

  test("dua inspeksi bersamaan: saldo bertambah TEPAT satu", async () => {
    const s = await approvedTermination({ label: tag("RACE2") });
    const row = s.itemRows[0];
    await assignRecovery(s.cs, s.recoveryId, s.manager.id, new Date());
    await pickupDevices(s.cs, s.recoveryId, [{ itemId: row.id, actualSerial: row.snapshotSerial }]);
    await receiveDevices(s.cs, s.recoveryId, [row.id]);
    await attachRecoveryEvidence(s.cs, "INSPECTION", row.id, photo());

    const before = await onHandOf(s.itemId, s.warehouseId);
    const [a, b] = await Promise.all([
      inspectDevice(s.cs, row.id, { checklist: CHECKLIST, decision: "LAYAK_DIGUNAKAN", note: "inspektur 1" }),
      inspectDevice(s.manager, row.id, { checklist: CHECKLIST, decision: "LAYAK_DIGUNAKAN", note: "inspektur 2" }),
    ]);

    assert.equal([a, b].filter((r) => r.ok).length, 1, "tepat satu inspeksi berhasil");
    assert.equal(await onHandOf(s.itemId, s.warehouseId), before + 1, "saldo TIDAK bertambah dua");
    assert.equal(await db.deviceInspection.count({ where: { itemId: row.id } }), 1);
    assert.equal(
      await db.stockTransaction.count({ where: { status: "POSTED", type: "STOCK_RETURN" } }),
      1,
      "hanya satu transaksi yang terposting"
    );
  });

  test("inspeksi yang gagal tidak meninggalkan draft transaksi menumpuk", async () => {
    const s = await approvedTermination({ label: tag("RACE3") });
    const row = s.itemRows[0];
    await assignRecovery(s.cs, s.recoveryId, s.manager.id, new Date());
    await pickupDevices(s.cs, s.recoveryId, [{ itemId: row.id, actualSerial: row.snapshotSerial }]);
    await receiveDevices(s.cs, s.recoveryId, [row.id]);
    await attachRecoveryEvidence(s.cs, "INSPECTION", row.id, photo());

    // Baris inspeksi disisipkan lebih dulu supaya penulisan di dalam transaksi
    // melanggar unique constraint — mensimulasikan inspektur yang kalah cepat.
    await db.deviceInspection.create({
      data: { itemId: row.id, checklist: {}, decision: "RUSAK", note: "pendahulu", inspectorId: s.manager.id },
    });
    const gagal = await inspectDevice(s.cs, row.id, {
      checklist: CHECKLIST,
      decision: "LAYAK_DIGUNAKAN",
      note: "harusnya gagal",
    });

    assert.equal(gagal.ok, false);
    assert.equal(await onHandOf(s.itemId, s.warehouseId), 0, "saldo utuh");
    assert.equal(await db.stockTransaction.count({ where: { status: "DRAFT" } }), 0, "tidak ada draft sampah");
    assert.equal(await db.stockTransaction.count({ where: { status: "POSTED" } }), 0);
  });

  test("dua pengajuan terminasi bersamaan pada langganan sama: hanya satu jadi", async () => {
    const s = await approvedTermination({ label: tag("RACE4") });
    // Langganan ini sudah punya terminasi berjalan; dua pengajuan lagi
    // bersamaan harus sama-sama ditolak.
    const [a, b] = await Promise.all([
      createTermination(s.cs, {
        subscriptionId: s.subscriptionId, reason: "x", reasonCategory: "OTHER",
        effectiveDate: new Date(), warehouseToId: s.warehouseId,
      }),
      createTermination(s.cs, {
        subscriptionId: s.subscriptionId, reason: "y", reasonCategory: "OTHER",
        effectiveDate: new Date(), warehouseToId: s.warehouseId,
      }),
    ]);
    assert.equal([a, b].filter((r) => r.ok).length, 0, "keduanya ditolak");
    assert.equal(
      await db.customerTermination.count({ where: { subscriptionId: s.subscriptionId } }),
      1
    );
  });

  test("penomoran dokumen aman terhadap pembuatan bersamaan (§11.1)", async () => {
    // Inti mengapa DocumentSequence menggantikan count()+1 di Fase 16.
    //
    // Persiapan sengaja dijalankan BERURUTAN: yang diuji adalah penomoran
    // dokumen, bukan ketahanan fixture. Membuat master data secara paralel
    // hanya menghasilkan kegagalan pada perkakas tes dan menutupi hal yang
    // sebenarnya ingin dijaga.
    const master = await ensureMasterData();
    await ensureApprovalRule("termination", master.role.id);
    const csRow = await makeUser(`seq-cs`, "SEQ CS", { divisionId: master.division.id });
    const mgrRow = await makeUser(`seq-mgr`, "SEQ Mgr", {
      divisionId: master.division.id,
      roleId: master.role.id,
    });
    const cs = actor(csRow.id, "SEQ CS", { divisionId: master.division.id });
    const manager = actor(mgrRow.id, "SEQ Mgr", {
      divisionId: master.division.id,
      roles: [{ id: master.role.id, code: "management", name: "Management" }],
    });

    const subs: string[] = [];
    for (const n of [1, 2, 3, 4]) {
      const label = `SEQ${n}`;
      const { customer, subscription } = await makeCustomerWithService(csRow.id, master.pkg.id, label);
      await makeDevice(master.item.id, `SN-${label}`, {
        subscriptionId: subscription.id,
        customerId: customer.id,
      });
      subs.push(subscription.id);
    }

    // Empat nomor TRM diminta pada saat yang sama.
    const created = await Promise.all(
      subs.map((id) =>
        createTermination(cs, {
          subscriptionId: id,
          reason: "uji penomoran",
          reasonCategory: "OTHER",
          effectiveDate: new Date(),
          warehouseToId: master.warehouse.id,
        })
      )
    );
    assert.equal(created.filter((r) => r.ok).length, 4, "keempatnya berhasil dibuat");

    const ids = created.map((r) => (r.ok ? r.id : ""));
    for (const id of ids) {
      await submitTermination(cs, id);
      const trm = await db.customerTermination.findUnique({ where: { id } });
      await actOnApproval({ user: manager, requestId: trm!.approvalRequestId!, action: "APPROVE" });
    }

    // Empat nomor DRI dan WO diminta pada saat yang sama.
    const synced = await Promise.all(ids.map((id) => syncTerminationDecision(manager, id)));
    assert.equal(synced.filter((r) => r.ok).length, 4, "keempat penarikan terbit");

    const trms = await db.customerTermination.findMany({ select: { terminationNumber: true } });
    const dris = await db.deviceRecoveryIssue.findMany({ select: { recoveryNumber: true } });
    const wos = await db.workOrder.findMany({ select: { woNumber: true } });
    assert.equal(new Set(trms.map((t) => t.terminationNumber)).size, 4, "nomor TRM unik");
    assert.equal(new Set(dris.map((d) => d.recoveryNumber)).size, 4, "nomor DRI unik");
    assert.equal(new Set(wos.map((w) => w.woNumber)).size, 4, "nomor WO unik");
  });
});
