import { test, describe, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import {
  db,
  actor,
  tag,
  makeUser,
  makeDevice,
  makeCustomerWithService,
  ensureMasterData,
  ensureApprovalRule,
  approvedTermination,
  resetTransactionalData,
} from "./fixtures";
import { createTermination, submitTermination, syncTerminationDecision, cancelTermination, makeTerminationEffective } from "@/lib/termination";
import { actOnApproval } from "@/lib/approval";

// Aturan yang dijaga di sini adalah yang paling mahal kalau bocor: perangkat
// milik pelanggan ikut ditarik dari rumahnya, atau surat penarikan terbit
// setengah jadi sehingga perangkat terkunci tanpa ada tugas yang menariknya.

describe("terminasi pelanggan", () => {
  before(async () => { await resetTransactionalData(); await ensureMasterData(); });
  beforeEach(async () => { await resetTransactionalData(); await ensureMasterData(); });
  after(async () => { await resetTransactionalData(); await db.$disconnect(); });

  test("perangkat milik PELANGGAN tidak pernah masuk daftar penarikan", async () => {
    const s = await approvedTermination({
      label: tag("OWN"),
      devices: [
        { serial: "SN-COMPANY-A", ownership: "COMPANY" },
        { serial: "SN-CUSTOMER-B", ownership: "CUSTOMER" },
      ],
    });

    assert.equal(s.itemRows.length, 1, "hanya perangkat perusahaan yang ditarik");
    assert.equal(s.itemRows[0].snapshotSerial, "SN-COMPANY-A");

    const milikPelanggan = await db.serializedDevice.findFirst({
      where: { serialNumber: "SN-CUSTOMER-B" },
    });
    assert.equal(milikPelanggan!.status, "INSTALLED", "status perangkat pelanggan tidak disentuh");
    assert.equal(milikPelanggan!.subscriptionId, s.subscriptionId, "masih terpasang di langganannya");
  });

  test("snapshot mencatat alasan pengecualian, bukan diam-diam membuangnya", async () => {
    const s = await approvedTermination({
      label: tag("SNAP"),
      devices: [
        { serial: "SN-IN", ownership: "COMPANY" },
        { serial: "SN-OUT", ownership: "CUSTOMER" },
      ],
    });
    const trm = await db.customerTermination.findUnique({ where: { id: s.terminationId } });
    const snap = trm!.snapshot as unknown as {
      devices: { serialNumber: string; included: boolean; excludedReason: string | null }[];
    };
    const excluded = snap.devices.find((d) => d.serialNumber === "SN-OUT")!;
    assert.equal(excluded.included, false);
    assert.match(String(excluded.excludedReason), /pelanggan/i);
  });

  test("persetujuan menerbitkan TRM, DRI, WO, item, dan status perangkat sekaligus", async () => {
    const s = await approvedTermination({ label: tag("ATOM") });

    const trm = await db.customerTermination.findUnique({ where: { id: s.terminationId } });
    const dri = await db.deviceRecoveryIssue.findUnique({
      where: { id: s.recoveryId },
      include: { workOrder: true, items: true },
    });
    assert.equal(trm!.status, "APPROVED");
    assert.equal(dri!.workOrder.type, "DEVICE_RETRIEVAL");
    assert.ok(dri!.slaDueAt, "batas SLA terisi");
    assert.equal(dri!.items.length, 1);

    const device = await db.serializedDevice.findUnique({ where: { id: s.itemRows[0].deviceId } });
    assert.equal(device!.status, "RECOVERY_PENDING", "perangkat terkunci menunggu penarikan");
  });

  test("pemutus yang tercatat adalah approver, bukan yang menekan tombol", async () => {
    const master = await ensureMasterData();
    await ensureApprovalRule("termination", master.role.id);
    const label = tag("WHO");
    const csRow = await makeUser(`cs-${label}`, "CS", { divisionId: master.division.id });
    const mgrRow = await makeUser(`mgr-${label}`, "Manager", { divisionId: master.division.id, roleId: master.role.id });
    const clerkRow = await makeUser(`clerk-${label}`, "Petugas", { divisionId: master.division.id });
    const cs = actor(csRow.id, "CS", { divisionId: master.division.id });
    const manager = actor(mgrRow.id, "Manager", {
      divisionId: master.division.id,
      roles: [{ id: master.role.id, code: "management", name: "Management" }],
    });
    const clerk = actor(clerkRow.id, "Petugas", { divisionId: master.division.id });

    const { customer, subscription } = await makeCustomerWithService(csRow.id, master.pkg.id, label);
    await makeDevice(master.item.id, `SN-${label}`, {
      subscriptionId: subscription.id,
      customerId: customer.id,
    });
    const created = await createTermination(cs, {
      subscriptionId: subscription.id,
      reason: "uji",
      reasonCategory: "OTHER",
      effectiveDate: new Date(),
      warehouseToId: master.warehouse.id,
    });
    assert.ok(created.ok);
    await submitTermination(cs, created.ok ? created.id : "");
    const trm = await db.customerTermination.findUnique({ where: { id: created.ok ? created.id : "" } });
    await actOnApproval({
      user: manager,
      requestId: trm!.approvalRequestId!,
      action: "APPROVE",
      note: "silakan tarik",
    });

    // Orang ketiga yang menekan "terapkan keputusan".
    const synced = await syncTerminationDecision(clerk, trm!.id);
    assert.ok(synced.ok, synced.ok ? "" : synced.error);

    const after = await db.customerTermination.findUnique({ where: { id: trm!.id } });
    assert.equal(after!.decidedById, mgrRow.id, "manager, bukan petugas");
    assert.equal(after!.decisionNote, "silakan tarik");
  });

  test("segregation of duties: pengaju tidak bisa menyetujui pengajuannya sendiri", async () => {
    const master = await ensureMasterData();
    await ensureApprovalRule("termination", master.role.id);
    const label = tag("SOD");
    // Pengaju sekaligus pemegang role penyetuju — SoD harus tetap menahan.
    const row = await makeUser(`solo-${label}`, "Solo", {
      divisionId: master.division.id,
      roleId: master.role.id,
    });
    const solo = actor(row.id, "Solo", {
      divisionId: master.division.id,
      roles: [{ id: master.role.id, code: "management", name: "Management" }],
    });
    const { customer, subscription } = await makeCustomerWithService(row.id, master.pkg.id, label);
    await makeDevice(master.item.id, `SN-${label}`, {
      subscriptionId: subscription.id,
      customerId: customer.id,
    });
    const created = await createTermination(solo, {
      subscriptionId: subscription.id,
      reason: "uji",
      reasonCategory: "OTHER",
      effectiveDate: new Date(),
      warehouseToId: master.warehouse.id,
    });
    assert.ok(created.ok);
    await submitTermination(solo, created.ok ? created.id : "");
    const trm = await db.customerTermination.findUnique({ where: { id: created.ok ? created.id : "" } });

    const acted = await actOnApproval({ user: solo, requestId: trm!.approvalRequestId!, action: "APPROVE" });
    assert.equal(acted.ok, false, "harus ditolak");
    assert.match(acted.ok ? "" : acted.error, /Segregation of duties/i);
  });

  test("satu langganan tidak boleh punya dua terminasi berjalan", async () => {
    const s = await approvedTermination({ label: tag("DUP") });
    const kedua = await createTermination(s.cs, {
      subscriptionId: s.subscriptionId,
      reason: "dobel",
      reasonCategory: "OTHER",
      effectiveDate: new Date(),
      warehouseToId: s.warehouseId,
    });
    assert.equal(kedua.ok, false);
    assert.match(kedua.ok ? "" : kedua.error, /sudah punya terminasi berjalan/i);
  });

  test("pembatalan mengembalikan perangkat dan menghapus surat penarikan", async () => {
    const s = await approvedTermination({ label: tag("CANCEL") });
    const cancelled = await cancelTermination(s.cs, s.terminationId, "salah input");
    assert.ok(cancelled.ok, cancelled.ok ? "" : cancelled.error);

    const device = await db.serializedDevice.findUnique({ where: { id: s.itemRows[0].deviceId } });
    assert.equal(device!.status, "INSTALLED", "perangkat kembali terpasang");
    assert.equal(await db.deviceRecoveryIssue.count({ where: { id: s.recoveryId } }), 0);
    const wo = await db.workOrder.findFirst({ where: { type: "DEVICE_RETRIEVAL" } });
    assert.equal(wo!.status, "CANCELLED");
  });

  test("terminasi yang sudah berlaku tidak dapat dibatalkan", async () => {
    const s = await approvedTermination({ label: tag("EFF") });
    const eff = await makeTerminationEffective(s.manager, s.terminationId);
    assert.ok(eff.ok, eff.ok ? "" : eff.error);

    const sub = await db.subscription.findUnique({ where: { id: s.subscriptionId } });
    assert.equal(sub!.status, "TERMINATED");
    assert.ok(sub!.terminatedAt);

    const cancelled = await cancelTermination(s.cs, s.terminationId, "coba batalkan");
    assert.equal(cancelled.ok, false);
    assert.match(cancelled.ok ? "" : cancelled.error, /sudah berlaku/i);
  });

  test("nomor dokumen unik walau banyak terminasi dibuat berurutan", async () => {
    const labels = [tag("N"), tag("N"), tag("N")];
    for (const l of labels) await approvedTermination({ label: l });
    const trms = await db.customerTermination.findMany({ select: { terminationNumber: true } });
    const dris = await db.deviceRecoveryIssue.findMany({ select: { recoveryNumber: true } });
    assert.equal(new Set(trms.map((t) => t.terminationNumber)).size, 3);
    assert.equal(new Set(dris.map((d) => d.recoveryNumber)).size, 3);
  });
});
