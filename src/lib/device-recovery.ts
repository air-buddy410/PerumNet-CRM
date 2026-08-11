import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { notifyUsers, notifyPermission } from "@/lib/notify";
import { releasePort } from "@/lib/ftth";
import {
  createDraftTransaction,
  postTransaction,
  cancelDraftTransaction,
} from "@/lib/inventory";
import {
  PERMISSIONS,
  RECOVERY_ATTEMPT_RESULTS,
  INSPECTION_CHECKLIST,
} from "@/lib/constants";
import { notReturnedBlocker, slaPhase, coordinateRejection } from "@/lib/recovery";
import { saveAttachment } from "@/lib/files";
import type { CurrentUser } from "@/lib/rbac";

// ── Mesin Penarikan Perangkat (Fase 30, PRD §13) ────────────────
//
// Alur lapangan: OPEN → ASSIGNED → IN_PROGRESS → PARTIAL/RECOVERED
//
// Aturan yang ditegakkan DI SINI:
//  - Setiap kunjungan ke pelanggan tercatat sebagai attempt, berhasil maupun
//    tidak. Ini yang kelak menjadi dasar sah/tidaknya vonis "tidak kembali".
//  - Serial yang ditemukan di lapangan dicatat apa adanya. Bila berbeda dari
//    snapshot, catatan penjelasan WAJIB — perangkat tertukar adalah masalah
//    yang harus terlihat, bukan yang diam-diam disamakan.
//  - Port ODP HANYA dilepas setelah pemutusan fisik dikonfirmasi. Melepas
//    port lebih awal berarti port bisa dijual ke pelanggan lain padahal
//    kabelnya masih tersambung ke rumah lama.
//  - Perangkat yang sudah diambil berpindah ke custody teknisi dengan status
//    RETURN_IN_TRANSIT — bukan langsung masuk stok gudang. Stok hanya berubah
//    lewat transaksi yang diposting (Fase 31).

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

/// Klien di dalam transaksi Prisma — dipakai agar pencatatan hasil inspeksi
/// bisa menumpang transaksi yang sama dengan perubahan saldo stok.
type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export interface PickupLine {
  itemId: string;
  actualSerial: string;
  actualMac?: string;
  mismatchNote?: string;
}

/**
 * Menjelaskan ketidakcocokan antara perangkat di lapangan dan catatan.
 * Mengembalikan null bila keduanya cocok.
 *
 * MAC hanya dibandingkan bila teknisi benar-benar mengisinya — memaksa
 * keterangan hanya karena kolom opsional dikosongkan akan membuat orang
 * mengisi asal supaya formnya lolos.
 */
function describeMismatch(
  item: { snapshotSerial: string; snapshotMac: string | null },
  line: PickupLine
): string | null {
  const serial = line.actualSerial.trim();
  const mac = line.actualMac?.trim();
  if (serial !== item.snapshotSerial) {
    return `Serial ${serial} berbeda dari catatan (${item.snapshotSerial})`;
  }
  if (mac && item.snapshotMac && mac.toLowerCase() !== item.snapshotMac.toLowerCase()) {
    return `MAC ${mac} berbeda dari catatan (${item.snapshotMac})`;
  }
  return null;
}

export async function assignRecovery(
  user: CurrentUser,
  recoveryId: string,
  technicianId: string,
  scheduledAt: Date | null
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.RECOVERY_ASSIGN)) {
    return { ok: false, error: "Anda tidak memiliki izin menugaskan penarikan." };
  }
  const dri = await db.deviceRecoveryIssue.findUnique({
    where: { id: recoveryId },
    include: { workOrder: { select: { id: true, woNumber: true } } },
  });
  if (!dri) return { ok: false, error: "Penarikan tidak ditemukan." };
  if (!["OPEN", "ASSIGNED"].includes(dri.status)) {
    return { ok: false, error: "Penarikan ini sudah berjalan dan tidak dapat ditugaskan ulang." };
  }
  const tech = await db.user.findUnique({
    where: { id: technicianId },
    select: { id: true, name: true, isActive: true },
  });
  if (!tech?.isActive) return { ok: false, error: "Teknisi tidak valid atau nonaktif." };

  await db.$transaction(async (tx) => {
    await tx.deviceRecoveryIssue.update({
      where: { id: recoveryId },
      data: { assigneeId: technicianId, scheduledAt, status: "ASSIGNED" },
    });
    await tx.workOrder.update({
      where: { id: dri.workOrderId },
      data: { technicianId, scheduledAt, status: "ASSIGNED" },
    });
  });

  await logAudit({
    userId: user.id,
    action: "RECOVERY_ASSIGN",
    module: "device_recovery",
    entityType: "DeviceRecoveryIssue",
    entityId: recoveryId,
    description: `${dri.recoveryNumber} ditugaskan ke ${tech.name}`,
  });
  await notifyUsers([technicianId], {
    type: "RECOVERY_ASSIGNED",
    title: `Penarikan perangkat: ${dri.recoveryNumber}`,
    body: `Anda ditugaskan menarik perangkat (${dri.workOrder.woNumber}).`,
    link: `/inventory/device-recoveries/${recoveryId}`,
    module: "device_recovery",
  });
  return { ok: true, id: recoveryId };
}

/**
 * Mencatat satu kunjungan penarikan — berhasil maupun gagal.
 *
 * Kunjungan gagal justru yang paling penting dicatat: §13.10 menuntut
 * minimal sekian percobaan sebelum perangkat boleh divonis tidak kembali.
 * Tanpa catatan ini, vonis tersebut tidak punya dasar.
 */
export async function recordAttempt(
  user: CurrentUser,
  recoveryId: string,
  data: { result: string; note?: string; latitude?: number | null; longitude?: number | null }
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.RECOVERY_PICKUP)) {
    return { ok: false, error: "Anda tidak memiliki izin mencatat penarikan." };
  }
  if (!RECOVERY_ATTEMPT_RESULTS.some(([code]) => code === data.result)) {
    return { ok: false, error: "Hasil kunjungan tidak dikenal." };
  }
  const dri = await db.deviceRecoveryIssue.findUnique({ where: { id: recoveryId } });
  if (!dri) return { ok: false, error: "Penarikan tidak ditemukan." };
  if (["COMPLETED", "CLOSED_UNRECOVERED"].includes(dri.status)) {
    return { ok: false, error: "Penarikan ini sudah selesai." };
  }
  if (data.result !== "BERHASIL" && !data.note?.trim()) {
    return { ok: false, error: "Kunjungan yang tidak berhasil wajib disertai keterangan." };
  }
  const badCoordinate = coordinateRejection({
    latitude: data.latitude ?? undefined,
    longitude: data.longitude ?? undefined,
  });
  if (badCoordinate) return { ok: false, error: badCoordinate };

  const attempt = await db.deviceRecoveryAttempt.create({
    data: {
      recoveryId,
      result: data.result,
      note: data.note?.trim() || null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      byUserId: user.id,
    },
  });
  if (dri.status === "ASSIGNED") {
    await db.deviceRecoveryIssue.update({
      where: { id: recoveryId },
      data: { status: "IN_PROGRESS" },
    });
    await db.workOrder.update({
      where: { id: dri.workOrderId },
      data: { status: "IN_PROGRESS" },
    });
  }

  await logAudit({
    userId: user.id,
    action: "RECOVERY_ATTEMPT",
    module: "device_recovery",
    entityType: "DeviceRecoveryIssue",
    entityId: recoveryId,
    description: `${dri.recoveryNumber}: kunjungan ${data.result}${data.note ? ` — ${data.note}` : ""}`,
  });
  return { ok: true, id: attempt.id };
}

/**
 * Mencatat perangkat yang benar-benar berhasil diambil.
 *
 * Boleh sebagian: pelanggan kadang hanya menyerahkan sebagian perangkat.
 * Yang belum terambil tetap RECOVERY_PENDING dan menunggu kunjungan
 * berikutnya, sehingga tidak ada yang "hilang" dari pantauan.
 */
export async function pickupDevices(
  user: CurrentUser,
  recoveryId: string,
  lines: PickupLine[]
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.RECOVERY_PICKUP)) {
    return { ok: false, error: "Anda tidak memiliki izin mencatat penarikan." };
  }
  if (!lines.length) return { ok: false, error: "Pilih minimal satu perangkat." };

  const dri = await db.deviceRecoveryIssue.findUnique({
    where: { id: recoveryId },
    include: { items: true, workOrder: { select: { id: true, technicianId: true, woNumber: true } } },
  });
  if (!dri) return { ok: false, error: "Penarikan tidak ditemukan." };
  if (["COMPLETED", "CLOSED_UNRECOVERED"].includes(dri.status)) {
    return { ok: false, error: "Penarikan ini sudah selesai." };
  }
  const custodianId = dri.assigneeId ?? dri.workOrder.technicianId;
  if (!custodianId) {
    return { ok: false, error: "Penarikan belum memiliki teknisi — tugaskan lebih dulu." };
  }

  // Validasi seluruh baris SEBELUM menulis apa pun: setengah tersimpan di
  // sini berarti sebagian perangkat tercatat ditarik dan sebagian tidak,
  // tanpa ada yang tahu batasnya di mana.
  const prepared: { item: (typeof dri.items)[number]; line: PickupLine }[] = [];
  for (const line of lines) {
    const item = dri.items.find((i) => i.id === line.itemId);
    if (!item) return { ok: false, error: "Baris perangkat tidak dikenal." };
    if (item.status !== "RECOVERY_PENDING") {
      return { ok: false, error: `${item.snapshotSerial} sudah tidak berstatus menunggu penarikan.` };
    }
    const actual = line.actualSerial?.trim();
    if (!actual) {
      return { ok: false, error: `Serial yang ditemukan untuk ${item.snapshotSerial} wajib diisi.` };
    }
    // Serial DAN MAC sama-sama dibandingkan (§9.2 FR-PICK-005). MAC yang
    // berbeda dengan serial yang cocok tetap berarti ada yang tidak beres —
    // casing bisa saja dipindah, atau catatannya yang salah sejak awal.
    const mismatch = describeMismatch(item, line);
    if (mismatch && !line.mismatchNote?.trim()) {
      return { ok: false, error: `${mismatch} — keterangan wajib diisi.` };
    }
    prepared.push({ item, line });
  }

  try {
    await db.$transaction(async (tx) => {
      for (const { item, line } of prepared) {
        // Status diperiksa ULANG di dalam UPDATE, bukan hanya saat validasi
        // di atas. Dua teknisi yang menyimpan bersamaan sama-sama membaca
        // RECOVERY_PENDING; yang membedakan hanya siapa yang benar-benar
        // berhasil mengubahnya. Pola bersyarat ini sama dengan penguncian
        // tugas di worker Fase 27.
        const claimed = await tx.deviceRecoveryItem.updateMany({
          where: { id: item.id, status: "RECOVERY_PENDING" },
          data: {
            status: "PICKED_UP",
            actualSerial: line.actualSerial.trim(),
            actualMac: line.actualMac?.trim() || null,
            mismatchNote: line.mismatchNote?.trim() || null,
            pickedUpAt: new Date(),
          },
        });
        if (claimed.count === 0) {
          throw new Error(
            `${item.snapshotSerial} baru saja dicatat oleh proses lain — muat ulang halaman.`
          );
        }
        await tx.serializedDevice.update({
          where: { id: item.deviceId },
          data: {
            status: "RETURN_IN_TRANSIT",
            custodianId,
            subscriptionId: null,
            customerId: null,
            warehouseId: null,
          },
        });
        await tx.deviceMovement.create({
          data: {
            deviceId: item.deviceId,
            action: "RECOVERY_PICKED_UP",
            fromNote: "Terpasang di pelanggan",
            toNote: "Dibawa teknisi — perjalanan pulang",
            workOrderId: dri.workOrderId,
            byUserId: user.id,
            note: line.mismatchNote?.trim() || null,
          },
        });
      }

      // Sisa dihitung dari kondisi TERKINI di dalam transaksi, bukan dari
      // data yang dibaca sebelum transaksi dimulai — kalau tidak, penarikan
      // paralel bisa menyimpulkan "masih ada sisa" padahal sudah habis.
      const stillPending = await tx.deviceRecoveryItem.count({
        where: { recoveryId, status: "RECOVERY_PENDING" },
      });
      await tx.deviceRecoveryIssue.update({
        where: { id: recoveryId },
        data: { status: stillPending > 0 ? "PARTIAL" : "RECOVERED" },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Penarikan gagal disimpan." };
  }

  const mismatches = prepared.filter((p) => describeMismatch(p.item, p.line) !== null);
  await logAudit({
    userId: user.id,
    action: "RECOVERY_PICKUP",
    module: "device_recovery",
    entityType: "DeviceRecoveryIssue",
    entityId: recoveryId,
    description: `${dri.recoveryNumber}: ${prepared.length} perangkat diambil${mismatches.length ? `, ${mismatches.length} serial tidak cocok` : ""}`,
    metadata: {
      mismatches: mismatches.map((m) => ({
        expectedSerial: m.item.snapshotSerial,
        foundSerial: m.line.actualSerial.trim(),
        expectedMac: m.item.snapshotMac,
        foundMac: m.line.actualMac?.trim() || null,
        note: m.line.mismatchNote,
      })),
    },
  });
  await notifyPermission(PERMISSIONS.RECOVERY_RECEIVE, {
    type: "RECOVERY_INBOUND",
    title: `Perangkat dalam perjalanan: ${dri.recoveryNumber}`,
    body: `${prepared.length} perangkat ditarik dan menunggu penerimaan gudang.`,
    link: `/inventory/device-recoveries/${recoveryId}`,
    module: "device_recovery",
  });
  return { ok: true, id: recoveryId };
}

/**
 * Konfirmasi pemutusan fisik di lokasi pelanggan, lalu melepas port ODP.
 *
 * Ini gerbang §13.5. Port dilepas HANYA lewat jalur ini — bukan saat
 * terminasi disetujui, bukan saat langganan berstatus TERMINATED. Selama
 * kabel masih terpasang, portnya belum boleh dianggap kosong.
 */
export async function confirmPhysicalDisconnect(
  user: CurrentUser,
  recoveryId: string
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.RECOVERY_PICKUP)) {
    return { ok: false, error: "Anda tidak memiliki izin mengonfirmasi pemutusan fisik." };
  }
  const dri = await db.deviceRecoveryIssue.findUnique({
    where: { id: recoveryId },
    include: {
      termination: {
        select: { terminationNumber: true, subscriptionId: true, status: true },
      },
    },
  });
  if (!dri) return { ok: false, error: "Penarikan tidak ditemukan." };
  if (dri.physicalDisconnectedAt) {
    return { ok: false, error: "Pemutusan fisik sudah dikonfirmasi sebelumnya." };
  }

  const port = await db.odpPort.findUnique({
    where: { subscriptionId: dri.termination.subscriptionId },
    select: { id: true },
  });

  await db.deviceRecoveryIssue.update({
    where: { id: recoveryId },
    data: { physicalDisconnectedAt: new Date(), physicalDisconnectedById: user.id },
  });

  let portNote = "tidak ada port ODP terpetakan";
  if (port) {
    const released = await releasePort(
      user,
      port.id,
      `Dilepas otomatis — pemutusan fisik ${dri.recoveryNumber}`
    );
    portNote = released.ok ? "port ODP dilepas" : `port ODP GAGAL dilepas: ${released.error}`;
  }

  await logAudit({
    userId: user.id,
    action: "RECOVERY_PHYSICAL_DISCONNECT",
    module: "device_recovery",
    entityType: "DeviceRecoveryIssue",
    entityId: recoveryId,
    description: `${dri.recoveryNumber}: pemutusan fisik dikonfirmasi — ${portNote}`,
  });
  return { ok: true, id: recoveryId };
}

// ── Penerimaan Gudang & Inspeksi (Fase 31, PRD §13.6–13.8) ──────
//
// Dua langkah yang sengaja dipisah:
//  1. TERIMA — barang sampai di gudang dan masuk KARANTINA. Saldo stok TIDAK
//     bertambah sedikit pun. Perangkat bekas pakai belum tentu layak, dan
//     barang yang belum diperiksa tidak boleh bisa dialokasikan ke pelanggan.
//  2. INSPEKSI — barulah keputusan menentukan ke mana barang itu pergi, dan
//     hanya di sinilah saldo berubah, lewat transaksi yang diposting.

export async function receiveDevices(
  user: CurrentUser,
  recoveryId: string,
  itemIds: string[]
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.RECOVERY_RECEIVE)) {
    return { ok: false, error: "Anda tidak memiliki izin menerima perangkat." };
  }
  if (!itemIds.length) return { ok: false, error: "Pilih minimal satu perangkat." };

  const dri = await db.deviceRecoveryIssue.findUnique({
    where: { id: recoveryId },
    include: { items: true },
  });
  if (!dri) return { ok: false, error: "Penarikan tidak ditemukan." };

  const targets = dri.items.filter((i) => itemIds.includes(i.id));
  if (targets.length !== itemIds.length) {
    return { ok: false, error: "Ada baris perangkat yang tidak dikenal." };
  }
  const notPicked = targets.find((i) => i.status !== "PICKED_UP");
  if (notPicked) {
    return {
      ok: false,
      error: `${notPicked.snapshotSerial} belum ditarik dari pelanggan.`,
    };
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    for (const item of targets) {
      await tx.deviceRecoveryItem.update({
        where: { id: item.id },
        data: { status: "RECEIVED", receivedAt: now, receivedById: user.id },
      });
      // Custodian TIDAK dilepas di sini: barang baru resmi berpindah ke gudang
      // saat transaksi pengembalian diposting pada langkah inspeksi. Sampai
      // saat itu, tanggung jawabnya masih melekat pada teknisi.
      await tx.serializedDevice.update({
        where: { id: item.deviceId },
        data: { status: "QUARANTINED" },
      });
      await tx.deviceMovement.create({
        data: {
          deviceId: item.deviceId,
          action: "RECOVERY_RECEIVED",
          fromNote: "Dibawa teknisi",
          toNote: `Karantina gudang (${dri.recoveryNumber})`,
          byUserId: user.id,
        },
      });
    }
    const allReceived = dri.items.every(
      (i) => targets.some((t) => t.id === i.id) || ["RECEIVED", "INSPECTED", "NOT_RETURNED"].includes(i.status)
    );
    if (allReceived) {
      await tx.deviceRecoveryIssue.update({
        where: { id: recoveryId },
        data: { status: "INSPECTION" },
      });
    }
  });

  await logAudit({
    userId: user.id,
    action: "RECOVERY_RECEIVE",
    module: "device_recovery",
    entityType: "DeviceRecoveryIssue",
    entityId: recoveryId,
    description: `${dri.recoveryNumber}: ${targets.length} perangkat masuk karantina — belum menambah stok tersedia`,
  });
  await notifyPermission(PERMISSIONS.RECOVERY_INSPECT, {
    type: "RECOVERY_INSPECTION_DUE",
    title: `Menunggu inspeksi: ${dri.recoveryNumber}`,
    body: `${targets.length} perangkat di karantina menunggu pemeriksaan.`,
    link: `/inventory/device-recoveries/${recoveryId}`,
    module: "device_recovery",
  });
  return { ok: true, id: recoveryId };
}

/// Pemetaan keputusan inspeksi → akibatnya di inventory.
/// `condition` adalah kondisi yang dikirim ke transaksi STOCK_RETURN; `null`
/// berarti barang tidak masuk gudang sama sekali.
const DECISION_EFFECT: Record<
  string,
  { condition: string | null; finalStatus: string; finalCondition: string; label: string }
> = {
  // Satu-satunya jalan kembali ke stok tersedia — dan selalu sebagai SECOND,
  // tidak pernah kembali menjadi barang baru (§13.8).
  LAYAK_DIGUNAKAN: {
    condition: "GOOD",
    finalStatus: "AVAILABLE",
    finalCondition: "SECOND",
    label: "masuk stok tersedia sebagai barang SECOND",
  },
  PERLU_PERBAIKAN: {
    condition: "RMA",
    finalStatus: "RMA",
    finalCondition: "DAMAGED",
    label: "dikirim ke jalur perbaikan/RMA",
  },
  RUSAK: {
    condition: "DAMAGED",
    finalStatus: "DAMAGED",
    finalCondition: "DAMAGED",
    label: "tercatat rusak",
  },
  SCRAP: {
    condition: null,
    finalStatus: "SCRAPPED",
    finalCondition: "DAMAGED",
    label: "dimusnahkan",
  },
};

/**
 * Inspeksi satu perangkat dan penetapan keputusan akhirnya.
 *
 * Keputusan SCRAP butuh izin tersendiri (`device_recovery.dispose`) karena
 * memusnahkan aset adalah keputusan yang tidak bisa ditarik kembali.
 */
export async function inspectDevice(
  user: CurrentUser,
  itemId: string,
  data: { checklist: Record<string, boolean>; decision: string; note: string }
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.RECOVERY_INSPECT)) {
    return { ok: false, error: "Anda tidak memiliki izin melakukan inspeksi." };
  }
  const effect = DECISION_EFFECT[data.decision];
  if (!effect) return { ok: false, error: "Keputusan inspeksi tidak dikenal." };
  if (data.decision === "SCRAP" && !user.permissions.has(PERMISSIONS.RECOVERY_DISPOSE)) {
    return { ok: false, error: "Keputusan scrap memerlukan izin device_recovery.dispose." };
  }
  if (!data.note?.trim()) {
    return { ok: false, error: "Catatan inspeksi wajib diisi." };
  }
  // §9.4 FR-INSP-001: checklist wajib diselesaikan. Yang bisa ditegakkan di
  // sini adalah KELENGKAPANNYA — setiap butir harus ada dalam catatan, dan
  // tidak boleh ada butir asing yang diselundupkan. Membedakan "dijawab
  // tidak" dari "belum dijawab" butuh kendali ya/tidak di form, bukan kotak
  // centang; selama masih kotak centang, keduanya sama-sama terkirim false.
  const known = INSPECTION_CHECKLIST.map(([key]) => key as string);
  const submitted = Object.keys(data.checklist ?? {});
  const missing = known.filter((k) => !(k in (data.checklist ?? {})));
  if (missing.length) {
    return { ok: false, error: `Butir checklist belum lengkap: ${missing.join(", ")}.` };
  }
  const unknown = submitted.filter((k) => !known.includes(k));
  if (unknown.length) {
    return { ok: false, error: `Butir checklist tidak dikenal: ${unknown.join(", ")}.` };
  }
  // §9.4 FR-INSP-002 — keputusan final wajib berbukti foto. Keputusan yang
  // menentukan nasib sebuah aset tidak boleh hanya berupa pilihan di layar
  // yang tidak bisa ditinjau ulang siapa pun.
  const photos = await db.attachment.count({
    where: { entityType: "DeviceInspectionPhoto", entityId: itemId },
  });
  if (photos === 0) {
    return {
      ok: false,
      error: "Unggah minimal satu foto hasil pemeriksaan sebelum menyimpan keputusan.",
    };
  }

  const item = await db.deviceRecoveryItem.findUnique({
    where: { id: itemId },
    include: {
      inspection: true,
      device: { include: { item: { select: { id: true, name: true } } } },
      recovery: { select: { id: true, recoveryNumber: true, warehouseToId: true, items: true } },
    },
  });
  if (!item) return { ok: false, error: "Baris perangkat tidak ditemukan." };
  if (item.status !== "RECEIVED") {
    return { ok: false, error: "Perangkat belum diterima di gudang atau sudah diinspeksi." };
  }
  if (item.inspection) return { ok: false, error: "Perangkat ini sudah diinspeksi." };
  const custodianId = item.device.custodianId;
  if (effect.condition && !custodianId) {
    return {
      ok: false,
      error: "Perangkat tidak memiliki custodian — rantai serah terimanya terputus.",
    };
  }

  // Seluruh akibat inspeksi ditulis dalam SATU transaksi bersama perubahan
  // saldo. Dua hal bergantung padanya:
  //
  //  1. Gagal di tengah tidak boleh menyisakan stok yang sudah bertambah
  //     tanpa catatan inspeksi. Kalau itu terjadi, perangkat mentok: sudah
  //     dilepas dari custody teknisi, jadi percobaan ulang ditolak, padahal
  //     stoknya terlanjur terhitung.
  //  2. `DeviceInspection.itemId` unik, dan penulisannya berada di dalam
  //     transaksi yang sama. Dua inspektur yang menekan tombol bersamaan
  //     karena itu tidak bisa sama-sama lolos: yang kedua melanggar unique
  //     constraint dan SELURUH transaksinya — termasuk penambahan stok —
  //     ikut dibatalkan. Satu perangkat tidak akan pernah terhitung dua kali.
  const writeOutcome = async (prisma: TxClient, txId: string | null) => {
    // Sengaja dituliskan paling awal: inilah penjaga balapannya.
    await prisma.deviceInspection.create({
      data: {
        itemId,
        checklist: data.checklist as unknown as object,
        decision: data.decision,
        note: data.note.trim(),
        inspectorId: user.id,
      },
    });
    await prisma.deviceRecoveryItem.update({
      where: { id: itemId },
      data: { status: "INSPECTED", finalDecision: data.decision },
    });
    // Status & kondisi akhir ditimpa setelah mesin stok selesai: transaksi
    // pengembalian hanya mengenal GOOD/DAMAGED, sedangkan modul ini punya
    // kosakata sendiri (SECOND, RMA, SCRAPPED) yang harus menang.
    await prisma.serializedDevice.update({
      where: { id: item.deviceId },
      data: {
        status: effect.finalStatus,
        condition: effect.finalCondition,
        ...(effect.condition ? {} : { custodianId: null, warehouseId: null }),
      },
    });
    await prisma.deviceMovement.create({
      data: {
        deviceId: item.deviceId,
        action: "RECOVERY_INSPECTED",
        fromNote: "Karantina",
        toNote: effect.label,
        txId,
        byUserId: user.id,
        note: data.note.trim(),
      },
    });
  };

  let txId: string | null = null;
  if (effect.condition) {
    // Barang yang masuk gudang HARUS lewat transaksi yang diposting, bukan
    // tulis saldo langsung — aturan inti modul inventory sejak Fase 3.
    const draft = await createDraftTransaction(
      user,
      "STOCK_RETURN",
      {
        warehouseToId: item.recovery.warehouseToId,
        custodianId: custodianId!,
        purpose: `Hasil penarikan ${item.recovery.recoveryNumber} — ${data.decision}`,
        referenceNote: item.recovery.recoveryNumber,
      },
      [{ itemId: item.device.itemId, qty: 1, deviceIds: [item.deviceId], condition: effect.condition }]
    );
    if (!draft.ok) return draft;
    const posted = await postTransaction(user, draft.id, {
      afterPost: async (prisma, tx) => {
        await writeOutcome(prisma, tx.id);
      },
    });
    if (!posted.ok) {
      // Draft yang gagal diposting tidak boleh menumpuk setiap kali dicoba
      // ulang. Pembatalannya lewat jalur resmi, bukan hapus paksa.
      await cancelDraftTransaction(user, draft.id);
      return posted;
    }
    txId = draft.id;
  } else {
    // SCRAP tidak menyentuh saldo — tidak ada barang yang masuk gudang.
    await db.$transaction(async (tx) => writeOutcome(tx, null));
  }

  await logAudit({
    userId: user.id,
    action: "RECOVERY_INSPECT",
    module: "device_recovery",
    entityType: "DeviceRecoveryItem",
    entityId: itemId,
    description: `${item.device.serialNumber}: ${data.decision} — ${effect.label}`,
    metadata: { checklist: data.checklist, txId },
  });

  await closeRecoveryIfDone(user, item.recovery.id);
  return { ok: true, id: itemId };
}

/**
 * Menutup surat penarikan bila seluruh barisnya sudah selesai.
 *
 * "Selesai" berarti sudah diinspeksi ATAU sudah divonis tidak kembali —
 * bukan sekadar sudah diterima, karena barang di karantina masih menunggu
 * keputusan.
 */
export async function closeRecoveryIfDone(user: CurrentUser, recoveryId: string): Promise<void> {
  const dri = await db.deviceRecoveryIssue.findUnique({
    where: { id: recoveryId },
    include: { items: true, workOrder: { select: { id: true, status: true } } },
  });
  if (!dri || ["COMPLETED", "CLOSED_UNRECOVERED"].includes(dri.status)) return;

  const unfinished = dri.items.filter((i) => !["INSPECTED", "NOT_RETURNED"].includes(i.status));
  if (unfinished.length) return;

  const anyRecovered = dri.items.some((i) => i.status === "INSPECTED");
  const finalStatus = anyRecovered ? "COMPLETED" : "CLOSED_UNRECOVERED";

  await db.$transaction(async (tx) => {
    await tx.deviceRecoveryIssue.update({
      where: { id: recoveryId },
      data: { status: finalStatus, completedAt: new Date() },
    });
    if (!["COMPLETED", "CLOSED", "CANCELLED"].includes(dri.workOrder.status)) {
      await tx.workOrder.update({
        where: { id: dri.workOrderId },
        data: { status: "COMPLETED" },
      });
    }
  });
  await logAudit({
    userId: user.id,
    action: "RECOVERY_COMPLETE",
    module: "device_recovery",
    entityType: "DeviceRecoveryIssue",
    entityId: recoveryId,
    description: `${dri.recoveryNumber} ditutup dengan status ${finalStatus}`,
  });
}

// ── SLA & Eskalasi (Fase 32, PRD §13.10, §17) ───────────────────

/**
 * Menyatakan sebuah perangkat tidak kembali.
 *
 * Ini vonis akhir: perangkat ditandai LOST dan kasusnya ditutup. Syaratnya
 * ketat dan diperiksa di sini — SLA terlewat, percobaan cukup, dan izin
 * eskalasi. Nilai bukunya belum dibebankan ke jurnal: PRD §22 Q-001 masih
 * terbuka, jadi angkanya belum boleh ditebak sendiri oleh sistem.
 */
export async function markNotReturned(
  user: CurrentUser,
  itemId: string,
  note: string
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.RECOVERY_ESCALATE)) {
    return { ok: false, error: "Anda tidak memiliki izin eskalasi perangkat tidak kembali." };
  }
  if (!note?.trim()) {
    return { ok: false, error: "Keterangan eskalasi wajib diisi." };
  }
  const item = await db.deviceRecoveryItem.findUnique({
    where: { id: itemId },
    include: {
      device: { select: { id: true, serialNumber: true } },
      recovery: { select: { id: true, recoveryNumber: true, slaDueAt: true } },
    },
  });
  if (!item) return { ok: false, error: "Baris perangkat tidak ditemukan." };
  if (item.status !== "RECOVERY_PENDING") {
    return {
      ok: false,
      error: "Hanya perangkat yang belum tertarik yang bisa dinyatakan tidak kembali.",
    };
  }

  const setting = await db.deviceRecoverySetting.findFirst({ where: { isActive: true } });
  const attempts = await db.deviceRecoveryAttempt.count({
    where: { recoveryId: item.recovery.id },
  });
  const blocker = notReturnedBlocker({
    slaDueAt: item.recovery.slaDueAt,
    attempts,
    minAttempts: setting?.minAttempts ?? 3,
    now: new Date(),
  });
  if (blocker) return { ok: false, error: blocker };

  await db.$transaction(async (tx) => {
    await tx.deviceRecoveryItem.update({
      where: { id: itemId },
      data: {
        status: "NOT_RETURNED",
        finalDecision: "TIDAK_KEMBALI",
        notReturnedNote: note.trim(),
      },
    });
    await tx.serializedDevice.update({
      where: { id: item.deviceId },
      data: { status: "LOST", subscriptionId: null, customerId: null, custodianId: null },
    });
    await tx.deviceMovement.create({
      data: {
        deviceId: item.deviceId,
        action: "RECOVERY_NOT_RETURNED",
        fromNote: "Menunggu penarikan",
        toNote: "Dinyatakan tidak kembali",
        byUserId: user.id,
        note: note.trim(),
      },
    });
  });

  await logAudit({
    userId: user.id,
    action: "RECOVERY_NOT_RETURNED",
    module: "device_recovery",
    entityType: "DeviceRecoveryItem",
    entityId: itemId,
    description: `${item.device.serialNumber} dinyatakan tidak kembali setelah ${attempts} percobaan (${item.recovery.recoveryNumber})`,
  });
  await closeRecoveryIfDone(user, item.recovery.id);
  return { ok: true, id: itemId };
}

/**
 * Menyapu penarikan yang melewati SLA dan memberi tahu yang berwenang.
 *
 * Dipanggil worker Fase 27. Sengaja hanya MEMBERI TAHU, tidak memutuskan
 * apa pun sendiri: menyatakan perangkat hilang adalah keputusan manusia
 * yang butuh izin eskalasi, bukan efek samping sebuah cron.
 */
/**
 * Menyapu penarikan yang mendekati atau melewati batas SLA (PRD §14).
 *
 * Dipanggil worker Fase 27. Sengaja hanya MEMBERI TAHU, tidak memutuskan
 * apa pun sendiri: menyatakan perangkat hilang adalah keputusan manusia
 * yang butuh izin eskalasi, bukan efek samping sebuah cron.
 *
 * Dua peringatan yang berbeda penerimanya:
 *  - H-1 → teknisi penerima tugas dan koordinator, selagi masih sempat dikejar.
 *  - Lewat batas → pemegang izin eskalasi. Isinya dibedakan lagi berdasarkan
 *    apakah syarat vonis "tidak kembali" sudah lengkap, karena peringatan
 *    yang menyuruh mengeskalasi padahal belum boleh hanya melatih orang
 *    mengabaikannya.
 *
 * Tugas ini berjalan tiap jam, jadi setiap penarikan hanya diberitakan
 * sekali sehari. Tanpa itu, satu penarikan terlambat akan melahirkan 24
 * notifikasi sehari dan seluruh kanal notifikasi berhenti dipercaya.
 */
export async function sweepOverdueRecoveries(): Promise<string> {
  const now = new Date();
  const setting = await db.deviceRecoverySetting.findFirst({ where: { isActive: true } });
  const minAttempts = setting?.minAttempts ?? 3;

  const candidates = await db.deviceRecoveryIssue.findMany({
    where: {
      status: { notIn: ["COMPLETED", "CLOSED_UNRECOVERED"] },
      slaDueAt: { not: null },
    },
    include: {
      items: { where: { status: "RECOVERY_PENDING" }, select: { id: true } },
      _count: { select: { attempts: true } },
    },
  });

  let warned = 0;
  let breached = 0;
  let readyToEscalate = 0;

  for (const dri of candidates) {
    const phase = slaPhase(dri, now);
    if (phase === "OK") continue;
    const link = `/inventory/device-recoveries/${dri.id}`;
    const due = dri.slaDueAt?.toLocaleDateString("id-ID") ?? "-";

    if (phase === "DUE_SOON") {
      warned++;
      if (await notifiedRecently("RECOVERY_SLA_DUE_SOON", link)) continue;
      const audience = dri.assigneeId ? [dri.assigneeId] : [];
      await notifyUsers(audience, {
        type: "RECOVERY_SLA_DUE_SOON",
        title: `Batas penarikan besok: ${dri.recoveryNumber}`,
        body: `${dri.items.length} perangkat belum tertarik; batas SLA ${due}.`,
        link,
        module: "device_recovery",
      });
      await notifyPermission(
        PERMISSIONS.RECOVERY_ASSIGN,
        {
          type: "RECOVERY_SLA_DUE_SOON",
          title: `Batas penarikan besok: ${dri.recoveryNumber}`,
          body: `${dri.items.length} perangkat belum tertarik; batas SLA ${due}.`,
          link,
          module: "device_recovery",
        },
        dri.assigneeId ?? undefined
      );
      continue;
    }

    breached++;
    const canEscalate = dri._count.attempts >= minAttempts;
    if (canEscalate) readyToEscalate++;
    if (await notifiedRecently("RECOVERY_SLA_BREACH", link)) continue;
    await notifyPermission(PERMISSIONS.RECOVERY_ESCALATE, {
      type: "RECOVERY_SLA_BREACH",
      title: `SLA terlewat: ${dri.recoveryNumber}`,
      body: canEscalate
        ? `${dri.items.length} perangkat belum tertarik sejak ${due}. Syarat vonis tidak kembali sudah terpenuhi (${dri._count.attempts} percobaan).`
        : `${dri.items.length} perangkat belum tertarik sejak ${due}. Baru ${dri._count.attempts} dari ${minAttempts} percobaan — belum bisa dieskalasi, perlu kunjungan lagi.`,
      link,
      module: "device_recovery",
    });
  }

  if (!warned && !breached) return "0 penarikan mendekati atau melewati SLA";
  return (
    `${breached} melewati SLA (${readyToEscalate} siap dieskalasi) · ` +
    `${warned} mendekati batas`
  );
}

/**
 * Apakah pemberitahuan serupa sudah dikirim belakangan ini?
 *
 * Dicocokkan pada tipe + tautan, bukan per penerima: yang ingin dicegah
 * adalah pengulangan tiap jam untuk kasus yang sama, bukan pengiriman ke
 * beberapa orang sekaligus.
 */
async function notifiedRecently(type: string, link: string, hours = 24): Promise<boolean> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const existing = await db.notification.findFirst({
    where: { type, link, createdAt: { gte: since } },
    select: { id: true },
  });
  return existing !== null;
}

// ── Bukti Lapangan: foto, tanda tangan, koordinat (Fase 33) ─────
// PRD §9.2 FR-PICK-006 dan §9.4 FR-INSP-002 menuntut bukti tersimpan, dan
// §15 menuntut bukti itu privat. Penyimpanannya memakai mesin lampiran yang
// sudah ada (`saveAttachment` + `/api/files/[id]`) yang sudah dikeraskan:
// validasi MIME + ukuran + extension + magic byte, dan penyajian yang
// memeriksa izin atas entitas induk, bukan sekadar "sudah login".

/**
 * Jenis bukti yang bisa dilampirkan, beserta izin dan jangkar entitasnya.
 *
 * Bukti inspeksi sengaja dijangkarkan pada BARIS PERANGKAT, bukan pada baris
 * inspeksi. Alasannya urutan kerja: §9.4 FR-INSP-002 menuntut foto sudah ada
 * ketika keputusan dibuat, padahal baris inspeksi baru lahir bersama
 * keputusan itu. Menjangkarkannya pada perangkat membuat foto bisa diunggah
 * lebih dulu, dan tetap terbedakan dari foto penarikan karena entityType-nya
 * berbeda.
 */
const EVIDENCE_KINDS = {
  ATTEMPT: {
    entityType: "DeviceRecoveryAttempt",
    permission: PERMISSIONS.RECOVERY_PICKUP,
    anchor: "attempt" as const,
  },
  PICKUP: {
    entityType: "DeviceRecoveryItem",
    permission: PERMISSIONS.RECOVERY_PICKUP,
    anchor: "item" as const,
  },
  INSPECTION: {
    entityType: "DeviceInspectionPhoto",
    permission: PERMISSIONS.RECOVERY_INSPECT,
    anchor: "item" as const,
  },
} as const;

export type EvidenceKind = keyof typeof EVIDENCE_KINDS;

/**
 * Melampirkan foto bukti pada kunjungan, penarikan, atau inspeksi.
 *
 * Keberadaan entitas induk diperiksa lebih dulu: lampiran yatim tidak akan
 * pernah bisa ditampilkan siapa pun, tetapi tetap memakan ruang dan lolos
 * dari pemeriksaan izin yang bersandar pada induknya.
 */
export async function attachRecoveryEvidence(
  user: CurrentUser,
  kind: EvidenceKind,
  entityId: string,
  file: File
): Promise<Result> {
  const spec = EVIDENCE_KINDS[kind];
  if (!spec) return { ok: false, error: "Jenis bukti tidak dikenal." };
  if (!user.permissions.has(spec.permission)) {
    return { ok: false, error: "Anda tidak memiliki izin melampirkan bukti ini." };
  }

  const exists =
    spec.anchor === "attempt"
      ? await db.deviceRecoveryAttempt.findUnique({ where: { id: entityId }, select: { id: true } })
      : await db.deviceRecoveryItem.findUnique({ where: { id: entityId }, select: { id: true } });
  if (!exists) return { ok: false, error: "Data yang mau dilampiri tidak ditemukan." };

  const saved = await saveAttachment(file, spec.entityType, entityId, user.id);
  if (!saved.ok) return saved;

  await logAudit({
    userId: user.id,
    action: "RECOVERY_EVIDENCE_ATTACH",
    module: "device_recovery",
    entityType: spec.entityType,
    entityId,
    description: `Bukti ${kind.toLowerCase()} dilampirkan (${file.name})`,
  });
  return { ok: true, id: saved.id };
}

export async function recoveryEvidence(kind: EvidenceKind, entityId: string) {
  const spec = EVIDENCE_KINDS[kind];
  if (!spec) return [];
  return db.attachment.findMany({
    where: { entityType: spec.entityType, entityId },
    select: { id: true, filename: true, mimeType: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

/// Peran tanda tangan pada dokumen penarikan (§9.2 FR-PICK-006).
export const RECOVERY_SIGNATURE_ROLES = ["CUSTOMER", "TECHNICIAN"] as const;
export const RECOVERY_PICKUP_DOCTYPE = "RECOVERY_PICKUP";

/**
 * Menyimpan tanda tangan serah terima di lokasi pelanggan.
 *
 * Gambar tanda tangannya opsional dan diunggah lebih dulu sebagai lampiran —
 * nama penanda tangan tetap wajib, karena itulah yang bisa dibaca kembali
 * bertahun-tahun kemudian ketika berkas gambarnya sudah tidak terbaca.
 */
export async function signRecoveryPickup(
  user: CurrentUser,
  recoveryId: string,
  role: string,
  signerName: string,
  attachmentId?: string
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.RECOVERY_PICKUP)) {
    return { ok: false, error: "Anda tidak memiliki izin menyimpan tanda tangan." };
  }
  if (!(RECOVERY_SIGNATURE_ROLES as readonly string[]).includes(role)) {
    return { ok: false, error: "Peran tanda tangan tidak dikenal." };
  }
  if (!signerName?.trim()) {
    return { ok: false, error: "Nama penanda tangan wajib diisi." };
  }
  const dri = await db.deviceRecoveryIssue.findUnique({
    where: { id: recoveryId },
    select: { id: true, recoveryNumber: true },
  });
  if (!dri) return { ok: false, error: "Penarikan tidak ditemukan." };

  const signature = await db.documentSignature.upsert({
    where: {
      docType_docId_role: { docType: RECOVERY_PICKUP_DOCTYPE, docId: recoveryId, role },
    },
    update: { signerName: signerName.trim(), signerUserId: user.id, attachmentId: attachmentId ?? null },
    create: {
      docType: RECOVERY_PICKUP_DOCTYPE,
      docId: recoveryId,
      role,
      signerName: signerName.trim(),
      signerUserId: user.id,
      attachmentId: attachmentId ?? null,
    },
  });
  await logAudit({
    userId: user.id,
    action: "RECOVERY_SIGN",
    module: "device_recovery",
    entityType: "DeviceRecoveryIssue",
    entityId: recoveryId,
    description: `${dri.recoveryNumber}: tanda tangan ${role} oleh ${signerName.trim()}`,
  });
  return { ok: true, id: signature.id };
}

export async function recoverySignatures(recoveryId: string) {
  return db.documentSignature.findMany({
    where: { docType: RECOVERY_PICKUP_DOCTYPE, docId: recoveryId },
    include: { attachment: { select: { id: true } } },
    orderBy: { signedAt: "asc" },
  });
}
