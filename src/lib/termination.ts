import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { submitApprovalRequest } from "@/lib/approval";
import { notifyPermission, notifyUsers } from "@/lib/notify";
import { nextDocumentNumber, highestSuffix } from "@/lib/documents";
import { PERMISSIONS, APPROVAL_STATUS, TERMINATION_REASONS } from "@/lib/constants";
import { isRecoverable, recoveryExclusionReason } from "@/lib/recovery";
import { decidingStep } from "@/lib/approval-decision";
import type { CurrentUser } from "@/lib/rbac";

// ── Mesin Terminasi Pelanggan (Fase 29, PRD §11) ────────────────
//
// Alur: DRAFT → SUBMITTED → APPROVED → EFFECTIVE
//                        ↘ REJECTED   ↘ CANCELLED
//
// Aturan yang ditegakkan DI SINI, bukan di UI:
//  - Satu langganan tidak boleh punya dua terminasi aktif sekaligus.
//  - Hanya perangkat ownership COMPANY yang masuk daftar penarikan (§13.1).
//  - Satu perangkat tidak boleh berada di dua recovery aktif sekaligus.
//  - Pembuatan TRM → DRI → WO → item → status perangkat bersifat ATOMIK:
//    gagal satu berarti tidak ada yang tersimpan. Setengah jadi di sini
//    berarti perangkat berstatus "ditarik" tanpa ada surat tugasnya.
//  - Terminasi yang sudah EFFECTIVE tidak dapat dibatalkan (§11.4).
//  - Langganan baru berstatus TERMINATED saat terminasi EFFECTIVE, bukan
//    saat disetujui — pelanggan masih dilayani sampai tanggal berlaku.

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

/** Status terminasi yang masih "hidup" — menghalangi pengajuan baru. */
const ACTIVE_TERMINATION_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED"];

/** Status recovery yang masih berjalan — perangkatnya sedang dipesan. */
const ACTIVE_RECOVERY_STATUSES = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "PARTIAL",
  "RECOVERED",
  "INSPECTION",
];

export interface TerminationSnapshot {
  takenAt: string;
  customer: {
    number: string;
    name: string;
    phone: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
  };
  service: {
    serviceNumber: string;
    package: string;
    monthlyPrice: string;
    activatedAt: string | null;
    status: string;
  };
  network: {
    pppoeUsername: string | null;
    ipAddress: string | null;
    vlan: string | null;
    odp: string | null;
    odpPort: number | null;
    router: string | null;
  };
  devices: {
    serialNumber: string;
    macAddress: string | null;
    itemName: string;
    itemCategory: string | null;
    ownership: string;
    status: string;
    condition: string;
    included: boolean;
    excludedReason: string | null;
  }[];
  /// Gudang penerima & SLA yang berlaku ikut dipotret (§11.2): kebijakan SLA
  /// bisa diubah kapan saja, sedangkan berita acara harus tetap menunjukkan
  /// aturan yang berlaku saat pengajuan.
  receiving: { warehouse: string | null; slaDays: number | null; minAttempts: number | null };
  outstandingInvoices: {
    number: string;
    total: string;
    outstanding: string;
    status: string;
    dueAt: string;
  }[];
}

/**
 * Potret kondisi pelanggan saat pengajuan (§11.2).
 *
 * Diambil sekali dan disimpan utuh: master data boleh berubah kapan saja,
 * tetapi berita acara yang sudah ditandatangani tidak boleh ikut berubah.
 * Perangkat yang DIKECUALIKAN pun ikut dicatat beserta alasannya — supaya
 * kelak bisa dibuktikan bahwa pengecualian itu memang disengaja.
 */
export async function buildTerminationSnapshot(
  subscriptionId: string,
  receiving?: { warehouseName: string; slaDays: number; minAttempts: number }
): Promise<TerminationSnapshot | null> {
  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      customer: true,
      package: true,
      odpPort: { include: { odp: true } },
      devices: { include: { item: { include: { category: true } } } },
      router: { select: { hostname: true } },
      // Tagihan yang belum lunas ikut dipotret: §11.2 menuntut kondisi
      // finansial pelanggan terekam saat pengajuan, bukan dicari ulang nanti.
      invoices: {
        where: { status: { in: ["OPEN", "PARTIAL"] } },
        select: {
          invoiceNumber: true,
          totalAmount: true,
          paidAmount: true,
          status: true,
          dueAt: true,
        },
        orderBy: { dueAt: "asc" },
      },
    },
  });
  if (!sub) return null;

  return {
    takenAt: new Date().toISOString(),
    customer: {
      number: sub.customer.customerNumber,
      name: sub.customer.name,
      phone: sub.customer.phone,
      address: sub.customer.address,
      latitude: sub.customer.latitude,
      longitude: sub.customer.longitude,
    },
    service: {
      serviceNumber: sub.serviceNumber,
      package: sub.package.name,
      monthlyPrice: sub.monthlyPrice.toString(),
      activatedAt: sub.activatedAt?.toISOString() ?? null,
      status: sub.status,
    },
    network: {
      pppoeUsername: sub.pppoeUsername,
      ipAddress: sub.ipAddress,
      vlan: sub.vlan,
      odp: sub.odpPort?.odp.code ?? null,
      odpPort: sub.odpPort?.portNumber ?? null,
      router: sub.router?.hostname ?? null,
    },
    devices: sub.devices.map((d) => ({
      serialNumber: d.serialNumber,
      macAddress: d.macAddress,
      itemName: d.item.name,
      itemCategory: d.item.category?.name ?? null,
      ownership: d.ownership,
      status: d.status,
      condition: d.condition,
      included: isRecoverable(d),
      excludedReason: recoveryExclusionReason(d),
    })),
    receiving: {
      warehouse: receiving?.warehouseName ?? null,
      slaDays: receiving?.slaDays ?? null,
      minAttempts: receiving?.minAttempts ?? null,
    },
    outstandingInvoices: sub.invoices.map((i) => ({
      number: i.invoiceNumber,
      total: i.totalAmount.toString(),
      outstanding: (i.totalAmount - i.paidAmount).toString(),
      status: i.status,
      dueAt: i.dueAt.toISOString(),
    })),
  };
}

export async function createTermination(
  user: CurrentUser,
  data: {
    subscriptionId: string;
    reason: string;
    reasonCategory: string;
    effectiveDate: Date;
    warehouseToId: string;
  }
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.TERMINATION_CREATE)) {
    return { ok: false, error: "Anda tidak memiliki izin mengajukan terminasi." };
  }
  if (!data.reason?.trim()) {
    return { ok: false, error: "Alasan terminasi wajib diisi." };
  }
  if (!TERMINATION_REASONS.some(([code]) => code === data.reasonCategory)) {
    return { ok: false, error: "Kategori alasan tidak dikenal." };
  }
  if (Number.isNaN(data.effectiveDate.getTime())) {
    return { ok: false, error: "Tanggal berlaku tidak valid." };
  }

  const sub = await db.subscription.findUnique({
    where: { id: data.subscriptionId },
    select: { id: true, customerId: true, status: true, serviceNumber: true },
  });
  if (!sub) return { ok: false, error: "Langganan tidak ditemukan." };
  if (sub.status === "TERMINATED") {
    return { ok: false, error: "Langganan ini sudah terminasi." };
  }

  const warehouse = await db.warehouse.findUnique({
    where: { id: data.warehouseToId },
    select: { id: true, name: true, isActive: true },
  });
  if (!warehouse?.isActive) {
    return { ok: false, error: "Gudang penerima tidak valid atau nonaktif." };
  }
  const slaSetting = await db.deviceRecoverySetting.findFirst({ where: { isActive: true } });

  const active = await db.customerTermination.findFirst({
    where: {
      subscriptionId: data.subscriptionId,
      status: { in: ACTIVE_TERMINATION_STATUSES },
    },
    select: { terminationNumber: true, status: true },
  });
  if (active) {
    return {
      ok: false,
      error: `Langganan ini sudah punya terminasi berjalan (${active.terminationNumber}).`,
    };
  }

  const snapshot = await buildTerminationSnapshot(data.subscriptionId, {
    warehouseName: warehouse.name,
    slaDays: slaSetting?.slaDays ?? 7,
    minAttempts: slaSetting?.minAttempts ?? 3,
  });
  if (!snapshot) return { ok: false, error: "Gagal menyusun snapshot langganan." };

  const termination = await db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, {
      docType: "TRM",
      period: "MONTHLY",
      backfill: async (periodKey) => {
        const rows = await tx.customerTermination.findMany({
          where: { terminationNumber: { startsWith: `TRM-${periodKey}-` } },
          select: { terminationNumber: true },
        });
        return highestSuffix(rows.map((r) => r.terminationNumber));
      },
    });
    return tx.customerTermination.create({
      data: {
        terminationNumber: number,
        customerId: sub.customerId,
        subscriptionId: sub.id,
        reason: data.reason.trim(),
        reasonCategory: data.reasonCategory,
        effectiveDate: data.effectiveDate,
        warehouseToId: data.warehouseToId,
        snapshot: snapshot as unknown as object,
        createdById: user.id,
      },
    });
  });

  await logAudit({
    userId: user.id,
    action: "TERMINATION_CREATE",
    module: "termination",
    entityType: "CustomerTermination",
    entityId: termination.id,
    description: `Draft terminasi ${termination.terminationNumber} untuk ${sub.serviceNumber}`,
  });
  return { ok: true, id: termination.id };
}

export async function submitTermination(user: CurrentUser, id: string): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.TERMINATION_CREATE)) {
    return { ok: false, error: "Anda tidak memiliki izin mengajukan terminasi." };
  }
  const trm = await db.customerTermination.findUnique({
    where: { id },
    include: { customer: true, subscription: true },
  });
  if (!trm) return { ok: false, error: "Terminasi tidak ditemukan." };
  if (trm.status !== "DRAFT") {
    return { ok: false, error: "Hanya draft yang dapat diajukan." };
  }

  const approval = await submitApprovalRequest({
    user,
    module: "termination",
    title: `Terminasi ${trm.subscription.serviceNumber} — ${trm.customer.name}`,
    description: trm.reason,
    entityType: "CustomerTermination",
    entityId: trm.id,
  });
  if (!approval.ok) return approval;

  await db.customerTermination.update({
    where: { id },
    data: { status: "SUBMITTED", approvalRequestId: approval.id },
  });
  await logAudit({
    userId: user.id,
    action: "TERMINATION_SUBMIT",
    module: "termination",
    entityType: "CustomerTermination",
    entityId: id,
    description: `Mengajukan ${trm.terminationNumber} untuk persetujuan`,
  });
  return { ok: true, id };
}

/**
 * Menarik keputusan approval ke dalam terminasi.
 *
 * Approval engine tidak punya callback (lihat lib/approval.ts), jadi modul
 * pemakainya yang menjemput hasilnya — pola yang sama dipakai write-off
 * perangkat dan stock opname.
 *
 * Bila DISETUJUI, seluruh akibatnya dibuat dalam SATU transaksi: nomor DRI,
 * work order penarikan, daftar perangkat, dan penguncian status perangkat.
 * Ini yang membuat "disetujui" tidak pernah berarti setengah jadi.
 */
export async function syncTerminationDecision(user: CurrentUser, id: string): Promise<Result> {
  const trm = await db.customerTermination.findUnique({
    where: { id },
    include: {
      subscription: { select: { id: true, serviceNumber: true } },
      customer: { select: { id: true, name: true, address: true } },
      recovery: { select: { id: true } },
    },
  });
  if (!trm) return { ok: false, error: "Terminasi tidak ditemukan." };
  if (trm.status !== "SUBMITTED") {
    return { ok: false, error: "Terminasi tidak sedang menunggu persetujuan." };
  }
  if (!trm.approvalRequestId) {
    return { ok: false, error: "Terminasi ini tidak memiliki approval request." };
  }

  const approval = await db.approvalRequest.findUnique({
    where: { id: trm.approvalRequestId },
    select: {
      status: true,
      requestNumber: true,
      resolvedAt: true,
      steps: {
        orderBy: { stepOrder: "asc" },
        select: {
          stepOrder: true,
          status: true,
          actedById: true,
          actedAt: true,
          note: true,
          actedBy: { select: { name: true } },
        },
      },
    },
  });
  if (!approval) return { ok: false, error: "Approval request tidak ditemukan." };

  if (approval.status === APPROVAL_STATUS.PENDING) {
    return { ok: false, error: "Approval masih menunggu keputusan." };
  }

  // Yang tercatat sebagai pemutus HARUS orang yang benar-benar memutuskan di
  // approval engine — bukan siapa pun yang kebetulan menekan tombol "terapkan
  // keputusan" di halaman ini. Keduanya sering berbeda orang, dan berita acara
  // yang menyebut nama yang salah lebih buruk daripada tidak menyebut nama.
  const decider = decidingStep(approval.steps, approval.status);
  const decidedById = decider?.actedById ?? null;
  const decidedAt = decider?.actedAt ?? approval.resolvedAt ?? new Date();
  const decisionNote = decider?.note ?? null;
  const deciderName = decider?.actedBy?.name ?? "tidak diketahui";

  if (approval.status === APPROVAL_STATUS.REJECTED) {
    await db.customerTermination.update({
      where: { id },
      data: { status: "REJECTED", decidedById, decidedAt, decisionNote },
    });
    await logAudit({
      userId: user.id,
      action: "TERMINATION_REJECT",
      module: "termination",
      entityType: "CustomerTermination",
      entityId: id,
      description:
        `${trm.terminationNumber} ditolak oleh ${deciderName} lewat ${approval.requestNumber}` +
        (decisionNote ? ` — ${decisionNote}` : ""),
    });
    await notifyUsers([trm.createdById], {
      type: "TERMINATION_REJECTED",
      title: `Terminasi ditolak: ${trm.terminationNumber}`,
      body:
        `Pengajuan terminasi ${trm.subscription.serviceNumber} ditolak oleh ${deciderName}` +
        (decisionNote ? ` — ${decisionNote}` : "."),
      link: `/crm/terminations/${id}`,
      module: "termination",
    });
    return { ok: true, id };
  }

  if (trm.recovery) {
    return { ok: false, error: "Penarikan untuk terminasi ini sudah dibuat." };
  }

  // Daftar perangkat disusun ULANG di sini, bukan diambil dari snapshot:
  // snapshot adalah potret saat pengajuan, sedangkan yang dikunci statusnya
  // haruslah kondisi perangkat saat ini. Perangkat yang sudah pindah tangan
  // sejak pengajuan tidak boleh ikut tertarik.
  const devices = await db.serializedDevice.findMany({
    where: { subscriptionId: trm.subscriptionId },
    include: { item: { select: { name: true } } },
    orderBy: { serialNumber: "asc" },
  });
  const eligible = devices.filter(isRecoverable);

  const busy = await db.deviceRecoveryItem.findMany({
    where: {
      deviceId: { in: eligible.map((d) => d.id) },
      recovery: { status: { in: ACTIVE_RECOVERY_STATUSES } },
    },
    select: { deviceId: true, recovery: { select: { recoveryNumber: true } } },
  });
  if (busy.length) {
    const sn = eligible.find((d) => d.id === busy[0].deviceId)?.serialNumber ?? "-";
    return {
      ok: false,
      error: `Perangkat ${sn} sudah masuk penarikan ${busy[0].recovery.recoveryNumber}.`,
    };
  }

  const setting = await db.deviceRecoverySetting.findFirst({ where: { isActive: true } });
  const slaDays = setting?.slaDays ?? 7;
  const slaDueAt = new Date(decidedAt.getTime() + slaDays * 24 * 60 * 60 * 1000);

  const recoveryId = await db.$transaction(async (tx) => {
    const woNumber = await nextDocumentNumber(tx, {
      docType: "WO",
      period: "MONTHLY",
      backfill: async (periodKey) => {
        const rows = await tx.workOrder.findMany({
          where: { woNumber: { startsWith: `WO-${periodKey}-` } },
          select: { woNumber: true },
        });
        return highestSuffix(rows.map((r) => r.woNumber));
      },
    });
    const driNumber = await nextDocumentNumber(tx, {
      docType: "DRI",
      period: "MONTHLY",
      backfill: async (periodKey) => {
        const rows = await tx.deviceRecoveryIssue.findMany({
          where: { recoveryNumber: { startsWith: `DRI-${periodKey}-` } },
          select: { recoveryNumber: true },
        });
        return highestSuffix(rows.map((r) => r.recoveryNumber));
      },
    });

    const wo = await tx.workOrder.create({
      data: {
        woNumber,
        type: "DEVICE_RETRIEVAL",
        customerId: trm.customerId,
        subscriptionId: trm.subscriptionId,
        address: trm.customer.address,
        description: `Penarikan perangkat — terminasi ${trm.terminationNumber} (${eligible.length} unit)`,
        createdById: user.id,
      },
    });

    const dri = await tx.deviceRecoveryIssue.create({
      data: {
        recoveryNumber: driNumber,
        terminationId: trm.id,
        workOrderId: wo.id,
        warehouseToId: trm.warehouseToId,
        slaDueAt,
      },
    });

    for (const d of eligible) {
      await tx.deviceRecoveryItem.create({
        data: {
          recoveryId: dri.id,
          deviceId: d.id,
          snapshotSerial: d.serialNumber,
          snapshotMac: d.macAddress,
          snapshotItemName: d.item.name,
        },
      });
      await tx.serializedDevice.update({
        where: { id: d.id },
        data: { status: "RECOVERY_PENDING" },
      });
      await tx.deviceMovement.create({
        data: {
          deviceId: d.id,
          action: "RECOVERY_SCHEDULED",
          fromNote: "Terpasang di pelanggan",
          toNote: `Menunggu penarikan (${driNumber})`,
          workOrderId: wo.id,
          byUserId: user.id,
        },
      });
    }

    await tx.customerTermination.update({
      where: { id: trm.id },
      data: { status: "APPROVED", decidedById, decidedAt, decisionNote },
    });
    return dri.id;
  });

  await logAudit({
    userId: user.id,
    action: "TERMINATION_APPROVE",
    module: "termination",
    entityType: "CustomerTermination",
    entityId: id,
    description: `${trm.terminationNumber} disetujui oleh ${deciderName}; penarikan dibuat untuk ${eligible.length} perangkat`,
    metadata: { excluded: devices.length - eligible.length },
  });
  await notifyPermission(PERMISSIONS.RECOVERY_ASSIGN, {
    type: "RECOVERY_CREATED",
    title: "Penarikan perangkat baru",
    body: `${trm.terminationNumber} disetujui — ${eligible.length} perangkat menunggu penugasan teknisi.`,
    link: `/inventory/device-recoveries/${recoveryId}`,
    module: "device_recovery",
  });
  return { ok: true, id: recoveryId };
}

export async function cancelTermination(
  user: CurrentUser,
  id: string,
  reason: string
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.TERMINATION_CANCEL)) {
    return { ok: false, error: "Anda tidak memiliki izin membatalkan terminasi." };
  }
  if (!reason?.trim()) {
    return { ok: false, error: "Alasan pembatalan wajib diisi." };
  }
  const trm = await db.customerTermination.findUnique({
    where: { id },
    include: { recovery: { include: { items: true } } },
  });
  if (!trm) return { ok: false, error: "Terminasi tidak ditemukan." };
  if (trm.status === "EFFECTIVE") {
    return {
      ok: false,
      error: "Terminasi yang sudah berlaku tidak dapat dibatalkan (PRD §11.4).",
    };
  }
  if (["REJECTED", "CANCELLED"].includes(trm.status)) {
    return { ok: false, error: "Terminasi ini sudah selesai." };
  }

  // Perangkat yang terlanjur ditarik tidak bisa "dikembalikan" hanya dengan
  // membatalkan surat — barangnya sudah berpindah tangan secara fisik.
  const movedItems = trm.recovery?.items.filter((i) => i.status !== "RECOVERY_PENDING") ?? [];
  if (movedItems.length) {
    return {
      ok: false,
      error: `Tidak bisa dibatalkan: ${movedItems.length} perangkat sudah ditarik/diterima. Selesaikan penarikannya lebih dulu.`,
    };
  }

  await db.$transaction(async (tx) => {
    if (trm.recovery) {
      for (const item of trm.recovery.items) {
        await tx.serializedDevice.update({
          where: { id: item.deviceId },
          data: { status: "INSTALLED" },
        });
        await tx.deviceMovement.create({
          data: {
            deviceId: item.deviceId,
            action: "RECOVERY_CANCELLED",
            fromNote: "Menunggu penarikan",
            toNote: "Kembali terpasang — terminasi dibatalkan",
            byUserId: user.id,
            note: reason.trim(),
          },
        });
      }
      await tx.deviceRecoveryItem.deleteMany({ where: { recoveryId: trm.recovery.id } });
      await tx.deviceRecoveryIssue.delete({ where: { id: trm.recovery.id } });
      await tx.workOrder.update({
        where: { id: trm.recovery.workOrderId },
        data: { status: "CANCELLED", resultNotes: `Terminasi dibatalkan: ${reason.trim()}` },
      });
    }
    await tx.customerTermination.update({
      where: { id },
      data: { status: "CANCELLED", cancelReason: reason.trim() },
    });
  });

  await logAudit({
    userId: user.id,
    action: "TERMINATION_CANCEL",
    module: "termination",
    entityType: "CustomerTermination",
    entityId: id,
    description: `${trm.terminationNumber} dibatalkan. Alasan: ${reason.trim()}`,
  });
  return { ok: true, id };
}

/**
 * Menjadikan terminasi berlaku: langganan berhenti dilayani.
 *
 * Dipisahkan dari persetujuan karena keduanya memang beda waktu — pelanggan
 * tetap dilayani sampai tanggal berlaku meskipun terminasinya sudah disetujui.
 * Dipanggil manual dari UI, dan otomatis oleh worker (Fase 32).
 *
 * Catatan: pelepasan port ODP TIDAK terjadi di sini. Port hanya dilepas
 * setelah pemutusan fisik dikonfirmasi teknisi (§13.5) — kalau tidak, port
 * bisa dijual ke pelanggan lain padahal kabelnya masih tersambung.
 */
export async function makeTerminationEffective(
  user: CurrentUser,
  id: string,
  opts?: { force?: boolean }
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.TERMINATION_APPROVE)) {
    return { ok: false, error: "Anda tidak memiliki izin memberlakukan terminasi." };
  }
  const trm = await db.customerTermination.findUnique({
    where: { id },
    include: { subscription: { select: { id: true, serviceNumber: true } } },
  });
  if (!trm) return { ok: false, error: "Terminasi tidak ditemukan." };
  if (trm.status !== "APPROVED") {
    return { ok: false, error: "Hanya terminasi yang sudah disetujui dapat diberlakukan." };
  }
  const now = new Date();
  if (!opts?.force && trm.effectiveDate > now) {
    return {
      ok: false,
      error: `Belum mencapai tanggal berlaku (${trm.effectiveDate.toLocaleDateString("id-ID")}).`,
    };
  }

  await db.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: trm.subscriptionId },
      data: { status: "TERMINATED", terminatedAt: now },
    });
    await tx.customerTermination.update({
      where: { id },
      data: { status: "EFFECTIVE", effectiveAt: now },
    });
  });

  await logAudit({
    userId: user.id,
    action: "TERMINATION_EFFECTIVE",
    module: "termination",
    entityType: "CustomerTermination",
    entityId: id,
    description: `${trm.terminationNumber} berlaku — ${trm.subscription.serviceNumber} berstatus TERMINATED`,
  });
  return { ok: true, id };
}

/**
 * Memberlakukan terminasi yang tanggal berlakunya sudah tiba (Fase 32).
 *
 * Dipanggil worker, tanpa user. Yang dikerjakan sengaja hanya hal yang sudah
 * DIPUTUSKAN manusia sebelumnya: terminasi ini sudah lolos approval, dan
 * satu-satunya yang ditunggu adalah lewatnya tanggal. Tidak ada keputusan
 * baru yang diambil di sini.
 *
 * Port ODP tetap tidak disentuh — pelepasannya menunggu konfirmasi pemutusan
 * fisik oleh teknisi (§13.5).
 */
export async function applyDueTerminations(): Promise<{
  summary: string;
  applied: number;
  attempted: number;
}> {
  const now = new Date();
  const due = await db.customerTermination.findMany({
    where: { status: "APPROVED", effectiveDate: { lte: now } },
    select: {
      id: true,
      terminationNumber: true,
      subscriptionId: true,
      subscription: { select: { serviceNumber: true } },
    },
  });
  if (!due.length) return { summary: "0 terminasi jatuh tempo", applied: 0, attempted: 0 };

  let applied = 0;
  const failures: string[] = [];
  for (const trm of due) {
    try {
      await db.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: trm.subscriptionId },
          data: { status: "TERMINATED", terminatedAt: now },
        });
        await tx.customerTermination.update({
          where: { id: trm.id },
          data: { status: "EFFECTIVE", effectiveAt: now },
        });
      });
      await logAudit({
        userId: null,
        action: "TERMINATION_EFFECTIVE",
        module: "termination",
        entityType: "CustomerTermination",
        entityId: trm.id,
        description: `${trm.terminationNumber} berlaku otomatis — ${trm.subscription.serviceNumber} berstatus TERMINATED`,
      });
      applied++;
    } catch (e) {
      failures.push(`${trm.terminationNumber}: ${(e as Error).message}`);
    }
  }

  const summary =
    `${applied}/${due.length} terminasi diberlakukan` +
    (failures.length ? ` · gagal: ${failures.join("; ").slice(0, 200)}` : "");
  // Penegakan "gagal total bukan SUCCESS" dilakukan pemanggilnya di
  // scheduler — di sinilah kalau ditaruh akan lahir impor melingkar
  // scheduler → termination → scheduler.
  return { summary, applied, attempted: due.length };
}
