import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { submitApprovalRequest } from "@/lib/approval";
import { PERMISSIONS, TX_PREFIX, statusLabel } from "@/lib/constants";
import { nextDocumentNumber, highestSuffix } from "@/lib/documents";
import type { CurrentUser } from "@/lib/rbac";

// ── Inventory Engine ────────────────────────────────────────────
// Aturan yang ditegakkan DI SINI, bukan di UI (PRD §7, §15–16, §21, §53):
//  - Saldo stock & custody HANYA berubah di postTransaction / reverseTransaction
//    / postOpname. Tidak ada jalur edit langsung.
//  - Transaksi POSTED immutable — koreksi membuat transaksi reversal baru.
//  - Stock dan custody tidak boleh negatif.
//  - Serial number unik; perangkat punya satu lokasi & satu custodian aktif.
//  - Pengeluaran barang wajib tujuan + custodian (PIC) — PRD §16.2.
//  - Lost/Damaged wajib alasan + approval (PRD §16.5): perangkat masuk
//    UNDER_INSPECTION sampai approval selesai, lalu difinalisasi.
//  - Variance opname wajib alasan + approval Supervisor → Owner (PRD §21).
//
// Fase 16 (PRD-WAREHOUSE-ENHANCEMENT F1/F2/F4):
//  - Saldo berdimensi: onHand / reserved / damaged / inTransit.
//    available = onHand − reserved, SELALU dihitung, tidak pernah disimpan.
//  - Draft STOCK_ISSUE & STOCK_TRANSFER MERESERVASI stock di gudang asal, jadi
//    dua draft tidak bisa menjanjikan unit yang sama. Reservasi dilepas saat
//    draft dibatalkan, dan dikonversi menjadi pengeluaran saat diposting.
//  - Nomor dokumen diambil dari DocumentSequence (atomik), bukan count()+1.

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** Tipe transaksi yang menahan stock gudang asal selama masih berstatus draft. */
const RESERVING_TYPES = new Set(["STOCK_ISSUE", "STOCK_TRANSFER"]);

async function nextTxNumber(prisma: TxClient, type: string): Promise<string> {
  const code = TX_PREFIX[type] ?? "TX";
  return nextDocumentNumber(prisma, {
    docType: code,
    period: "MONTHLY",
    // Transaksi yang dibuat sebelum sistem sequence ada tetap dihormati.
    backfill: async (periodKey) => {
      const rows = await prisma.stockTransaction.findMany({
        where: { txNumber: { startsWith: `${code}-${periodKey}-` } },
        select: { txNumber: true },
      });
      return highestSuffix(rows.map((r) => r.txNumber));
    },
  });
}

export interface DraftLineInput {
  itemId: string;
  qty: number;
  serialNumbers?: string[]; // GR item serialized
  deviceIds?: string[]; // issue/return/transfer item serialized
}

interface DraftHeader {
  warehouseFromId?: string;
  warehouseToId?: string;
  custodianId?: string;
  workOrderId?: string;
  projectId?: string;
  purpose: string;
  referenceNote?: string;
  notes?: string;
}

// Validasi & normalisasi baris draft → rows siap simpan.
async function buildLines(
  type: string,
  lines: DraftLineInput[]
): Promise<
  | { ok: true; rows: { itemId: string; qty: number; deviceId?: string; snInput?: string }[] }
  | { ok: false; error: string }
> {
  if (!lines.length) return { ok: false, error: "Minimal satu baris item." };
  const rows: { itemId: string; qty: number; deviceId?: string; snInput?: string }[] = [];

  for (const line of lines) {
    const item = await db.item.findUnique({ where: { id: line.itemId } });
    if (!item || !item.isActive) return { ok: false, error: "Item tidak valid." };

    if (item.trackingType === "SERIALIZED") {
      if (type === "GOODS_RECEIPT") {
        const sns = (line.serialNumbers ?? []).map((s) => s.trim()).filter(Boolean);
        if (sns.length === 0 || sns.length !== line.qty) {
          return {
            ok: false,
            error: `Item ${item.name}: jumlah SN (${sns.length}) harus sama dengan qty (${line.qty}).`,
          };
        }
        const dupInInput = sns.filter((s, i) => sns.indexOf(s) !== i);
        if (dupInInput.length) {
          return { ok: false, error: `SN duplikat di input: ${dupInInput[0]}` };
        }
        const existing = await db.serializedDevice.findFirst({
          where: { serialNumber: { in: sns } },
        });
        if (existing) {
          return {
            ok: false,
            error: `SN "${existing.serialNumber}" sudah terdaftar (duplikasi ditolak — PRD §16.1).`,
          };
        }
        // Cegah juga SN yang sedang menunggu di draft GR lain.
        const pendingDraft = await db.stockTransactionLine.findFirst({
          where: { snInput: { in: sns }, tx: { status: "DRAFT" } },
          include: { tx: true },
        });
        if (pendingDraft) {
          return {
            ok: false,
            error: `SN "${pendingDraft.snInput}" sudah ada di draft ${pendingDraft.tx.txNumber}.`,
          };
        }
        for (const sn of sns) rows.push({ itemId: item.id, qty: 1, snInput: sn });
      } else {
        const deviceIds = (line.deviceIds ?? []).filter(Boolean);
        if (!deviceIds.length) {
          return { ok: false, error: `Item ${item.name}: pilih perangkat (SN).` };
        }
        for (const deviceId of deviceIds) rows.push({ itemId: item.id, qty: 1, deviceId });
      }
    } else {
      if (line.qty <= 0) return { ok: false, error: `Item ${item.name}: qty harus > 0.` };
      rows.push({ itemId: item.id, qty: line.qty });
    }
  }
  return { ok: true, rows };
}

export async function createDraftTransaction(
  user: CurrentUser,
  type: string,
  header: DraftHeader,
  lines: DraftLineInput[]
): Promise<Result> {
  if (!header.purpose?.trim()) {
    return { ok: false, error: "Tujuan transaksi wajib diisi (PRD §16.2)." };
  }
  if (type === "GOODS_RECEIPT" && !header.warehouseToId) {
    return { ok: false, error: "Gudang tujuan wajib dipilih." };
  }
  if (type === "STOCK_ISSUE" && (!header.warehouseFromId || !header.custodianId)) {
    return { ok: false, error: "Gudang asal dan teknisi penerima wajib dipilih." };
  }
  if (type === "STOCK_RETURN" && (!header.warehouseToId || !header.custodianId)) {
    return { ok: false, error: "Teknisi pengembali dan gudang tujuan wajib dipilih." };
  }
  if (type === "STOCK_TRANSFER") {
    if (!header.warehouseFromId || !header.warehouseToId) {
      return { ok: false, error: "Gudang asal dan tujuan wajib dipilih." };
    }
    if (header.warehouseFromId === header.warehouseToId) {
      return { ok: false, error: "Gudang asal dan tujuan tidak boleh sama." };
    }
  }

  const built = await buildLines(type, lines);
  if (!built.ok) return built;

  // Nomor dokumen, pembuatan draft, dan reservasi stock harus satu kesatuan:
  // kalau reservasi gagal, draft tidak boleh tertinggal separuh jadi.
  let txId = "";
  let txNumber = "";
  try {
    await db.$transaction(async (prisma) => {
      txNumber = await nextTxNumber(prisma, type);
      const tx = await prisma.stockTransaction.create({
        data: {
          txNumber,
          type,
          warehouseFromId: header.warehouseFromId ?? null,
          warehouseToId: header.warehouseToId ?? null,
          custodianId: header.custodianId ?? null,
          workOrderId: header.workOrderId ?? null,
          projectId: header.projectId ?? null,
          purpose: header.purpose,
          referenceNote: header.referenceNote,
          notes: header.notes,
          createdById: user.id,
          lines: { create: built.rows },
        },
        include: { lines: { include: { item: { select: { name: true } } } } },
      });
      txId = tx.id;

      if (RESERVING_TYPES.has(type) && header.warehouseFromId) {
        const err = await applyReservation(prisma, header.warehouseFromId, tx.lines, 1, tx.id);
        if (err) throw new Error(err);
      }
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal membuat draft transaksi." };
  }

  await logAudit({
    userId: user.id,
    action: "TX_CREATE",
    module: "inventory",
    entityType: "StockTransaction",
    entityId: txId,
    description: `Membuat draft ${txNumber} (${statusLabel(type)})${
      RESERVING_TYPES.has(type) ? " — stock direservasi" : ""
    }`,
  });
  return { ok: true, id: txId };
}

interface BalanceDelta {
  onHand?: number;
  reserved?: number;
  damaged?: number;
  inTransit?: number;
}

// Satu-satunya penulis saldo. Menegakkan seluruh invarian di satu tempat:
// tidak ada dimensi yang boleh negatif, dan reservasi tidak boleh melebihi fisik.
async function adjustBalance(
  prisma: TxClient,
  itemId: string,
  warehouseId: string,
  delta: BalanceDelta,
  itemName: string
): Promise<string | null> {
  const level = await prisma.stockLevel.findUnique({
    where: { itemId_warehouseId: { itemId, warehouseId } },
  });
  const current = {
    onHand: level?.onHand ?? 0,
    reserved: level?.reserved ?? 0,
    damaged: level?.damaged ?? 0,
    inTransit: level?.inTransit ?? 0,
  };
  const next = {
    onHand: current.onHand + (delta.onHand ?? 0),
    reserved: current.reserved + (delta.reserved ?? 0),
    damaged: current.damaged + (delta.damaged ?? 0),
    inTransit: current.inTransit + (delta.inTransit ?? 0),
  };

  if (next.onHand < 0) {
    return `Stock "${itemName}" tidak mencukupi (fisik ${current.onHand}, butuh ${-(delta.onHand ?? 0)}). Stock negatif ditolak.`;
  }
  if (next.reserved < 0) {
    return `Reservasi "${itemName}" tidak konsisten — pelepasan melebihi yang ditahan.`;
  }
  if (next.damaged < 0 || next.inTransit < 0) {
    return `Saldo "${itemName}" tidak konsisten (damaged/in-transit negatif).`;
  }
  if (next.reserved > next.onHand) {
    return `Reservasi "${itemName}" melebihi stock fisik (fisik ${next.onHand}, ditahan ${next.reserved}).`;
  }

  await prisma.stockLevel.upsert({
    where: { itemId_warehouseId: { itemId, warehouseId } },
    update: next,
    create: { itemId, warehouseId, ...next },
  });
  return null;
}

// Perubahan fisik murni (penerimaan, pengembalian, penyesuaian opname).
async function adjustLevel(
  prisma: TxClient,
  itemId: string,
  warehouseId: string,
  delta: number,
  itemName: string
): Promise<string | null> {
  return adjustBalance(prisma, itemId, warehouseId, { onHand: delta }, itemName);
}

// Pengeluaran barang: fisik berkurang DAN reservasinya dilepas bersamaan,
// sehingga invarian reserved ≤ onHand tetap terjaga di setiap titik.
async function consumeReserved(
  prisma: TxClient,
  itemId: string,
  warehouseId: string,
  qty: number,
  itemName: string
): Promise<string | null> {
  return adjustBalance(
    prisma,
    itemId,
    warehouseId,
    { onHand: -qty, reserved: -qty },
    itemName
  );
}

type ReservationLine = { itemId: string; qty: number; deviceId?: string | null; item: { name: string } };

// Menahan (sign +1) atau melepas (sign -1) stock untuk draft.
async function applyReservation(
  prisma: TxClient,
  warehouseId: string,
  lines: ReservationLine[],
  sign: 1 | -1,
  excludeTxId?: string
): Promise<string | null> {
  for (const line of lines) {
    if (sign === 1) {
      const level = await prisma.stockLevel.findUnique({
        where: { itemId_warehouseId: { itemId: line.itemId, warehouseId } },
      });
      const onHand = level?.onHand ?? 0;
      const reserved = level?.reserved ?? 0;
      const available = onHand - reserved;
      if (line.qty > available) {
        return `Stock "${line.item.name}" tidak mencukupi: tersedia ${available} (fisik ${onHand}, ditahan draft lain ${reserved}), diminta ${line.qty}.`;
      }
      // Perangkat serial tidak boleh ditahan oleh dua draft sekaligus.
      if (line.deviceId) {
        const clash = await prisma.stockTransactionLine.findFirst({
          where: {
            deviceId: line.deviceId,
            tx: { status: "DRAFT", ...(excludeTxId ? { id: { not: excludeTxId } } : {}) },
          },
          include: { tx: { select: { txNumber: true } } },
        });
        if (clash) {
          return `Perangkat pada baris "${line.item.name}" sudah ditahan draft ${clash.tx.txNumber}.`;
        }
      }
    }
    const err = await adjustBalance(
      prisma,
      line.itemId,
      warehouseId,
      { reserved: sign * line.qty },
      line.item.name
    );
    if (err) return err;
  }
  return null;
}

async function adjustCustody(
  prisma: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  custodianId: string,
  itemId: string,
  delta: number,
  itemName: string
): Promise<string | null> {
  const level = await prisma.custodyLevel.findUnique({
    where: { custodianId_itemId: { custodianId, itemId } },
  });
  const next = (level?.qty ?? 0) + delta;
  if (next < 0) {
    return `Custody "${itemName}" teknisi tidak mencukupi (sisa ${level?.qty ?? 0}).`;
  }
  await prisma.custodyLevel.upsert({
    where: { custodianId_itemId: { custodianId, itemId } },
    update: { qty: next },
    create: { custodianId, itemId, qty: next },
  });
  return null;
}

// ── Posting: satu-satunya jalur perubahan saldo ─────────────────

export async function postTransaction(
  user: CurrentUser,
  txId: string
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.STOCK_POST)) {
    return { ok: false, error: "Anda tidak memiliki izin posting transaksi stock." };
  }
  const tx = await db.stockTransaction.findUnique({
    where: { id: txId },
    include: { lines: { include: { item: true, device: true } } },
  });
  if (!tx) return { ok: false, error: "Transaksi tidak ditemukan." };
  if (tx.status !== "DRAFT") {
    return { ok: false, error: "Hanya draft yang bisa diposting. Transaksi posted immutable." };
  }

  try {
    await db.$transaction(async (prisma) => {
      for (const line of tx.lines) {
        const isSerialized = line.item.trackingType === "SERIALIZED";

        if (tx.type === "GOODS_RECEIPT") {
          if (isSerialized) {
            const sn = line.snInput?.trim();
            if (!sn) throw new Error("SN kosong pada baris serialized.");
            const dup = await prisma.serializedDevice.findUnique({
              where: { serialNumber: sn },
            });
            if (dup) throw new Error(`SN "${sn}" sudah terdaftar.`);
            const device = await prisma.serializedDevice.create({
              data: {
                serialNumber: sn,
                itemId: line.itemId,
                status: "AVAILABLE",
                warehouseId: tx.warehouseToId!,
              },
            });
            await prisma.stockTransactionLine.update({
              where: { id: line.id },
              data: { deviceId: device.id },
            });
            await prisma.deviceMovement.create({
              data: {
                deviceId: device.id,
                action: "RECEIVED",
                toNote: `Gudang (${tx.txNumber})`,
                txId: tx.id,
                byUserId: user.id,
              },
            });
          }
          const err = await adjustLevel(prisma, line.itemId, tx.warehouseToId!, line.qty, line.item.name);
          if (err) throw new Error(err);
        } else if (tx.type === "STOCK_ISSUE") {
          if (isSerialized) {
            const device = await prisma.serializedDevice.findUnique({
              where: { id: line.deviceId! },
            });
            if (!device || device.status !== "AVAILABLE" || device.warehouseId !== tx.warehouseFromId) {
              throw new Error(
                `Perangkat ${device?.serialNumber ?? "?"} tidak tersedia di gudang asal.`
              );
            }
            await prisma.serializedDevice.update({
              where: { id: device.id },
              data: { status: "IN_CUSTODY", warehouseId: null, custodianId: tx.custodianId },
            });
            await prisma.deviceMovement.create({
              data: {
                deviceId: device.id,
                action: "ISSUED",
                fromNote: "Gudang",
                toNote: `Custody teknisi (${tx.txNumber})`,
                txId: tx.id,
                workOrderId: tx.workOrderId,
                byUserId: user.id,
              },
            });
          } else {
            const errC = await adjustCustody(prisma, tx.custodianId!, line.itemId, line.qty, line.item.name);
            if (errC) throw new Error(errC);
          }
          // Fisik berkurang sekaligus melepas reservasi yang dibuat saat draft.
          const err = await consumeReserved(prisma, line.itemId, tx.warehouseFromId!, line.qty, line.item.name);
          if (err) throw new Error(err);
        } else if (tx.type === "STOCK_RETURN") {
          if (isSerialized) {
            const device = await prisma.serializedDevice.findUnique({
              where: { id: line.deviceId! },
            });
            if (!device || device.status !== "IN_CUSTODY" || device.custodianId !== tx.custodianId) {
              throw new Error(
                `Perangkat ${device?.serialNumber ?? "?"} tidak berada dalam custody teknisi tersebut.`
              );
            }
            await prisma.serializedDevice.update({
              where: { id: device.id },
              data: { status: "AVAILABLE", warehouseId: tx.warehouseToId, custodianId: null },
            });
            await prisma.deviceMovement.create({
              data: {
                deviceId: device.id,
                action: "RETURNED",
                fromNote: "Custody teknisi",
                toNote: `Gudang (${tx.txNumber})`,
                txId: tx.id,
                workOrderId: tx.workOrderId,
                byUserId: user.id,
              },
            });
          } else {
            const errC = await adjustCustody(prisma, tx.custodianId!, line.itemId, -line.qty, line.item.name);
            if (errC) throw new Error(errC);
          }
          const err = await adjustLevel(prisma, line.itemId, tx.warehouseToId!, line.qty, line.item.name);
          if (err) throw new Error(err);
        } else if (tx.type === "STOCK_TRANSFER") {
          if (isSerialized) {
            const device = await prisma.serializedDevice.findUnique({
              where: { id: line.deviceId! },
            });
            if (!device || device.status !== "AVAILABLE" || device.warehouseId !== tx.warehouseFromId) {
              throw new Error(
                `Perangkat ${device?.serialNumber ?? "?"} tidak tersedia di gudang asal.`
              );
            }
            await prisma.serializedDevice.update({
              where: { id: device.id },
              data: { warehouseId: tx.warehouseToId },
            });
            await prisma.deviceMovement.create({
              data: {
                deviceId: device.id,
                action: "TRANSFERRED",
                fromNote: "Gudang asal",
                toNote: `Gudang tujuan (${tx.txNumber})`,
                txId: tx.id,
                byUserId: user.id,
              },
            });
          }
          const errFrom = await consumeReserved(prisma, line.itemId, tx.warehouseFromId!, line.qty, line.item.name);
          if (errFrom) throw new Error(errFrom);
          const errTo = await adjustLevel(prisma, line.itemId, tx.warehouseToId!, line.qty, line.item.name);
          if (errTo) throw new Error(errTo);
        } else if (tx.type === "STOCK_ADJUSTMENT") {
          // qty bertanda (delta) — hanya dibuat sistem via opname.
          const err = await adjustLevel(prisma, line.itemId, tx.warehouseToId!, line.qty, line.item.name);
          if (err) throw new Error(err);
        } else {
          throw new Error("Tipe transaksi tidak dikenal.");
        }
      }

      await prisma.stockTransaction.update({
        where: { id: tx.id },
        data: { status: "POSTED", postedById: user.id, postedAt: new Date() },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Posting gagal." };
  }

  await logAudit({
    userId: user.id,
    action: "TX_POST",
    module: "inventory",
    entityType: "StockTransaction",
    entityId: tx.id,
    description: `Posting ${tx.txNumber} (${statusLabel(tx.type)})`,
  });
  return { ok: true, id: tx.id };
}

export async function cancelDraftTransaction(
  user: CurrentUser,
  txId: string
): Promise<Result> {
  const tx = await db.stockTransaction.findUnique({
    where: { id: txId },
    include: { lines: { include: { item: { select: { name: true } } } } },
  });
  if (!tx) return { ok: false, error: "Transaksi tidak ditemukan." };
  if (tx.status !== "DRAFT") {
    return { ok: false, error: "Hanya draft yang bisa dibatalkan." };
  }
  try {
    await db.$transaction(async (prisma) => {
      // Reservasi wajib dilepas agar stock kembali tersedia untuk draft lain.
      if (RESERVING_TYPES.has(tx.type) && tx.warehouseFromId) {
        const err = await applyReservation(prisma, tx.warehouseFromId, tx.lines, -1);
        if (err) throw new Error(err);
      }
      await prisma.stockTransaction.update({
        where: { id: txId },
        data: { status: "CANCELLED" },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Pembatalan draft gagal." };
  }
  await logAudit({
    userId: user.id,
    action: "TX_CANCEL",
    module: "inventory",
    entityType: "StockTransaction",
    entityId: txId,
    description: `Membatalkan draft ${tx.txNumber}`,
  });
  return { ok: true, id: txId };
}

// Reversal: transaksi koreksi baru; transaksi asal tetap tercatat (PRD §7.2).
export async function reverseTransaction(
  user: CurrentUser,
  txId: string,
  reason: string
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.STOCK_REVERSE)) {
    return { ok: false, error: "Anda tidak memiliki izin reversal." };
  }
  if (!reason?.trim()) {
    return { ok: false, error: "Alasan reversal wajib diisi." };
  }
  const tx = await db.stockTransaction.findUnique({
    where: { id: txId },
    include: { lines: { include: { item: true, device: true } } },
  });
  if (!tx) return { ok: false, error: "Transaksi tidak ditemukan." };
  if (tx.status !== "POSTED") return { ok: false, error: "Hanya transaksi posted yang bisa di-reverse." };
  if (tx.reversedById) return { ok: false, error: "Transaksi ini sudah pernah di-reverse." };
  if (tx.reversalOfId) return { ok: false, error: "Transaksi reversal tidak bisa di-reverse lagi." };

  let revId = "";
  let revNumber = "";
  try {
    await db.$transaction(async (prisma) => {
      revNumber = await nextTxNumber(prisma, tx.type);
      const rev = await prisma.stockTransaction.create({
        data: {
          txNumber: revNumber,
          type: tx.type,
          status: "POSTED",
          warehouseFromId: tx.warehouseFromId,
          warehouseToId: tx.warehouseToId,
          custodianId: tx.custodianId,
          workOrderId: tx.workOrderId,
          projectId: tx.projectId,
          purpose: `Reversal ${tx.txNumber}: ${reason}`,
          createdById: user.id,
          postedById: user.id,
          postedAt: new Date(),
          reversalOfId: tx.id,
          lines: {
            create: tx.lines.map((l) => ({
              itemId: l.itemId,
              qty: l.qty,
              deviceId: l.deviceId,
            })),
          },
        },
      });
      revId = rev.id;

      for (const line of tx.lines) {
        const isSerialized = line.item.trackingType === "SERIALIZED";
        const dev = line.deviceId
          ? await prisma.serializedDevice.findUnique({ where: { id: line.deviceId } })
          : null;

        if (tx.type === "GOODS_RECEIPT") {
          if (isSerialized) {
            if (!dev || dev.status !== "AVAILABLE" || dev.warehouseId !== tx.warehouseToId) {
              throw new Error(
                `Perangkat ${dev?.serialNumber ?? "?"} sudah berpindah — reversal GR tidak dapat dilakukan.`
              );
            }
            await prisma.serializedDevice.update({
              where: { id: dev.id },
              data: { status: "SCRAPPED", warehouseId: null, notes: `Reversal ${tx.txNumber}: ${reason}` },
            });
            await prisma.deviceMovement.create({
              data: { deviceId: dev.id, action: "REVERSED", txId: rev.id, byUserId: user.id, note: reason },
            });
          }
          const err = await adjustLevel(prisma, line.itemId, tx.warehouseToId!, -line.qty, line.item.name);
          if (err) throw new Error(err);
        } else if (tx.type === "STOCK_ISSUE") {
          if (isSerialized) {
            if (!dev || dev.status !== "IN_CUSTODY" || dev.custodianId !== tx.custodianId) {
              throw new Error(
                `Perangkat ${dev?.serialNumber ?? "?"} tidak lagi dalam custody — reversal tidak dapat dilakukan.`
              );
            }
            await prisma.serializedDevice.update({
              where: { id: dev.id },
              data: { status: "AVAILABLE", warehouseId: tx.warehouseFromId, custodianId: null },
            });
            await prisma.deviceMovement.create({
              data: { deviceId: dev.id, action: "REVERSED", txId: rev.id, byUserId: user.id, note: reason },
            });
          } else {
            const errC = await adjustCustody(prisma, tx.custodianId!, line.itemId, -line.qty, line.item.name);
            if (errC) throw new Error(errC);
          }
          const err = await adjustLevel(prisma, line.itemId, tx.warehouseFromId!, line.qty, line.item.name);
          if (err) throw new Error(err);
        } else if (tx.type === "STOCK_RETURN") {
          if (isSerialized) {
            if (!dev || dev.status !== "AVAILABLE" || dev.warehouseId !== tx.warehouseToId) {
              throw new Error(`Perangkat ${dev?.serialNumber ?? "?"} sudah berpindah — reversal gagal.`);
            }
            await prisma.serializedDevice.update({
              where: { id: dev.id },
              data: { status: "IN_CUSTODY", warehouseId: null, custodianId: tx.custodianId },
            });
            await prisma.deviceMovement.create({
              data: { deviceId: dev.id, action: "REVERSED", txId: rev.id, byUserId: user.id, note: reason },
            });
          } else {
            const errC = await adjustCustody(prisma, tx.custodianId!, line.itemId, line.qty, line.item.name);
            if (errC) throw new Error(errC);
          }
          const err = await adjustLevel(prisma, line.itemId, tx.warehouseToId!, -line.qty, line.item.name);
          if (err) throw new Error(err);
        } else if (tx.type === "STOCK_TRANSFER") {
          if (isSerialized) {
            if (!dev || dev.status !== "AVAILABLE" || dev.warehouseId !== tx.warehouseToId) {
              throw new Error(`Perangkat ${dev?.serialNumber ?? "?"} sudah berpindah — reversal gagal.`);
            }
            await prisma.serializedDevice.update({
              where: { id: dev.id },
              data: { warehouseId: tx.warehouseFromId },
            });
            await prisma.deviceMovement.create({
              data: { deviceId: dev.id, action: "REVERSED", txId: rev.id, byUserId: user.id, note: reason },
            });
          }
          const errTo = await adjustLevel(prisma, line.itemId, tx.warehouseToId!, -line.qty, line.item.name);
          if (errTo) throw new Error(errTo);
          const errFrom = await adjustLevel(prisma, line.itemId, tx.warehouseFromId!, line.qty, line.item.name);
          if (errFrom) throw new Error(errFrom);
        } else if (tx.type === "STOCK_ADJUSTMENT") {
          const err = await adjustLevel(prisma, line.itemId, tx.warehouseToId!, -line.qty, line.item.name);
          if (err) throw new Error(err);
        }
      }

      await prisma.stockTransaction.update({
        where: { id: tx.id },
        data: { reversedById: rev.id },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Reversal gagal." };
  }

  await logAudit({
    userId: user.id,
    action: "TX_REVERSE",
    module: "inventory",
    entityType: "StockTransaction",
    entityId: txId,
    description: `Reversal ${tx.txNumber} → ${revNumber}`,
    metadata: { reason },
  });
  return { ok: true, id: revId };
}

// ── Write-off perangkat (Lost/Damaged — PRD §16.5) ──────────────

export async function requestDeviceWriteoff(
  user: CurrentUser,
  deviceId: string,
  target: "LOST" | "DAMAGED",
  chronology: string
): Promise<Result> {
  if (!chronology?.trim()) {
    return { ok: false, error: "Kronologi kejadian wajib diisi (PRD §16.5)." };
  }
  const device = await db.serializedDevice.findUnique({
    where: { id: deviceId },
    include: { item: true },
  });
  if (!device) return { ok: false, error: "Perangkat tidak ditemukan." };
  if (!["AVAILABLE", "IN_CUSTODY", "INSTALLED"].includes(device.status)) {
    return { ok: false, error: `Perangkat berstatus ${statusLabel(device.status)} — tidak bisa diajukan write-off.` };
  }

  const approval = await submitApprovalRequest({
    user,
    module: "device_writeoff",
    title: `Write-off ${statusLabel(target)}: ${device.item.name} SN ${device.serialNumber}`,
    description: chronology,
    entityType: "SerializedDevice",
    entityId: device.id,
  });
  if (!approval.ok) return approval;

  await db.serializedDevice.update({
    where: { id: deviceId },
    data: {
      status: "UNDER_INSPECTION",
      notes: `Pengajuan ${target}: ${chronology}`,
    },
  });
  await db.deviceMovement.create({
    data: {
      deviceId,
      action: "WRITEOFF_REQUESTED",
      note: `${target}: ${chronology}`,
      byUserId: user.id,
    },
  });
  await logAudit({
    userId: user.id,
    action: "DEVICE_WRITEOFF_REQUEST",
    module: "inventory",
    entityType: "SerializedDevice",
    entityId: deviceId,
    description: `Mengajukan write-off ${statusLabel(target)} untuk SN ${device.serialNumber}`,
    metadata: { target, chronology },
  });
  return { ok: true, id: deviceId };
}

export async function finalizeDeviceWriteoff(
  user: CurrentUser,
  deviceId: string,
  target: "LOST" | "DAMAGED"
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.DEVICES_WRITEOFF)) {
    return { ok: false, error: "Anda tidak memiliki izin write-off." };
  }
  const device = await db.serializedDevice.findUnique({
    where: { id: deviceId },
    include: { item: true },
  });
  if (!device) return { ok: false, error: "Perangkat tidak ditemukan." };
  if (device.status !== "UNDER_INSPECTION") {
    return { ok: false, error: "Perangkat tidak dalam proses inspeksi write-off." };
  }
  const approval = await db.approvalRequest.findFirst({
    where: { entityType: "SerializedDevice", entityId: deviceId, module: "device_writeoff" },
    orderBy: { createdAt: "desc" },
  });
  if (!approval || approval.status !== "APPROVED") {
    return {
      ok: false,
      error: approval
        ? `Approval write-off masih ${statusLabel(approval.status)}.`
        : "Belum ada pengajuan approval write-off.",
    };
  }

  try {
    await db.$transaction(async (prisma) => {
      // Kurangi stock bila perangkat tercatat di gudang.
      if (device.warehouseId) {
        const err = await adjustLevel(prisma, device.itemId, device.warehouseId, -1, device.item.name);
        if (err) throw new Error(err);
      }
      await prisma.serializedDevice.update({
        where: { id: deviceId },
        data: { status: target, warehouseId: null, custodianId: null },
      });
      await prisma.deviceMovement.create({
        data: {
          deviceId,
          action: "WRITTEN_OFF",
          note: `Status final: ${statusLabel(target)} (approval ${approval.requestNumber})`,
          byUserId: user.id,
        },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Finalisasi gagal." };
  }

  await logAudit({
    userId: user.id,
    action: "DEVICE_WRITEOFF_FINAL",
    module: "inventory",
    entityType: "SerializedDevice",
    entityId: deviceId,
    description: `Write-off final SN ${device.serialNumber} → ${statusLabel(target)}`,
  });
  return { ok: true, id: deviceId };
}

// ── Stock Opname (PRD §21) ──────────────────────────────────────
// Hanya item BULK; rekonsiliasi perangkat serialized dilakukan per unit
// melalui write-off / transaksi, bukan lewat opname kuantitas.

export async function createOpnameSession(
  user: CurrentUser,
  warehouseId: string,
  notes?: string
): Promise<Result> {
  const warehouse = await db.warehouse.findUnique({ where: { id: warehouseId } });
  if (!warehouse) return { ok: false, error: "Gudang tidak ditemukan." };
  const open = await db.opnameSession.findFirst({
    where: { warehouseId, status: { in: ["OPEN", "WAITING_APPROVAL"] } },
  });
  if (open) {
    return { ok: false, error: `Masih ada sesi opname berjalan (${open.opnameNumber}).` };
  }
  const items = await db.item.findMany({
    where: { isActive: true, trackingType: "BULK" },
  });
  if (!items.length) return { ok: false, error: "Belum ada item bulk aktif." };

  const levels = await db.stockLevel.findMany({ where: { warehouseId } });
  // Opname menghitung stock FISIK; reservasi tidak mengurangi yang harus ada di rak.
  const levelMap = new Map(levels.map((l) => [l.itemId, l.onHand]));

  const opnameNumber = await nextDocumentNumber(db, {
    docType: "OPN",
    period: "MONTHLY",
    backfill: async (periodKey) => {
      const rows = await db.opnameSession.findMany({
        where: { opnameNumber: { startsWith: `OPN-${periodKey}-` } },
        select: { opnameNumber: true },
      });
      return highestSuffix(rows.map((r) => r.opnameNumber));
    },
  });
  const session = await db.opnameSession.create({
    data: {
      opnameNumber,
      warehouseId,
      notes,
      createdById: user.id,
      lines: {
        create: items.map((item) => ({
          itemId: item.id,
          systemQty: levelMap.get(item.id) ?? 0,
        })),
      },
    },
  });
  await logAudit({
    userId: user.id,
    action: "OPNAME_CREATE",
    module: "inventory",
    entityType: "OpnameSession",
    entityId: session.id,
    description: `Membuka sesi opname ${session.opnameNumber} (${warehouse.name})`,
  });
  return { ok: true, id: session.id };
}

export async function saveOpnameCounts(
  user: CurrentUser,
  sessionId: string,
  counts: { lineId: string; countedQty: number; reason?: string }[]
): Promise<Result> {
  const session = await db.opnameSession.findUnique({
    where: { id: sessionId },
    include: { lines: true },
  });
  if (!session) return { ok: false, error: "Sesi tidak ditemukan." };
  if (session.status !== "OPEN") return { ok: false, error: "Sesi sudah tidak terbuka." };

  for (const c of counts) {
    const line = session.lines.find((l) => l.id === c.lineId);
    if (!line) continue;
    if (c.countedQty < 0) return { ok: false, error: "Qty hitung tidak boleh negatif." };
    const variance = c.countedQty - line.systemQty;
    if (variance !== 0 && !c.reason?.trim()) {
      return {
        ok: false,
        error: `Variance pada salah satu item (${variance > 0 ? "+" : ""}${variance}) wajib disertai alasan (PRD §21).`,
      };
    }
    await db.opnameLine.update({
      where: { id: c.lineId },
      data: { countedQty: c.countedQty, reason: c.reason?.trim() || null },
    });
  }
  return { ok: true, id: sessionId };
}

export async function submitOpname(
  user: CurrentUser,
  sessionId: string
): Promise<Result<{ message: string }>> {
  const session = await db.opnameSession.findUnique({
    where: { id: sessionId },
    include: { lines: { include: { item: true } }, warehouse: true },
  });
  if (!session) return { ok: false, error: "Sesi tidak ditemukan." };
  if (session.status !== "OPEN") return { ok: false, error: "Sesi sudah diproses." };

  const uncounted = session.lines.filter((l) => l.countedQty === null);
  if (uncounted.length) {
    return {
      ok: false,
      error: `${uncounted.length} item belum dihitung. Lengkapi seluruh baris (cut-off penuh).`,
    };
  }
  const variances = session.lines.filter((l) => (l.countedQty ?? 0) !== l.systemQty);

  if (!variances.length) {
    await db.opnameSession.update({
      where: { id: sessionId },
      data: { status: "POSTED", postedAt: new Date() },
    });
    await logAudit({
      userId: user.id,
      action: "OPNAME_POST",
      module: "inventory",
      entityType: "OpnameSession",
      entityId: sessionId,
      description: `Opname ${session.opnameNumber} selesai tanpa variance`,
    });
    return { ok: true, id: sessionId, data: { message: "Tidak ada variance — sesi selesai." } };
  }

  const summary = variances
    .map((l) => `${l.item.name}: sistem ${l.systemQty} → fisik ${l.countedQty}`)
    .join("; ");
  const approval = await submitApprovalRequest({
    user,
    module: "stock_opname",
    title: `Adjustment opname ${session.opnameNumber} (${session.warehouse.name})`,
    description: summary,
    entityType: "OpnameSession",
    entityId: sessionId,
  });
  if (!approval.ok) return approval;

  await db.opnameSession.update({
    where: { id: sessionId },
    data: { status: "WAITING_APPROVAL", approvalRequestId: approval.id },
  });
  await logAudit({
    userId: user.id,
    action: "OPNAME_SUBMIT",
    module: "inventory",
    entityType: "OpnameSession",
    entityId: sessionId,
    description: `Mengajukan adjustment opname ${session.opnameNumber} (${variances.length} variance)`,
  });
  return {
    ok: true,
    id: sessionId,
    data: { message: "Variance ditemukan — pengajuan approval adjustment dibuat." },
  };
}

export async function postOpname(
  user: CurrentUser,
  sessionId: string
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.STOCK_POST)) {
    return { ok: false, error: "Anda tidak memiliki izin posting." };
  }
  const session = await db.opnameSession.findUnique({
    where: { id: sessionId },
    include: { lines: true, warehouse: true },
  });
  if (!session) return { ok: false, error: "Sesi tidak ditemukan." };
  if (session.status !== "WAITING_APPROVAL") {
    return { ok: false, error: "Sesi tidak menunggu posting." };
  }
  const approval = session.approvalRequestId
    ? await db.approvalRequest.findUnique({ where: { id: session.approvalRequestId } })
    : null;
  if (!approval || approval.status !== "APPROVED") {
    return {
      ok: false,
      error: approval
        ? `Approval masih ${statusLabel(approval.status)}.`
        : "Approval tidak ditemukan.",
    };
  }

  const deltas = session.lines
    .filter((l) => (l.countedQty ?? 0) !== l.systemQty)
    .map((l) => ({ itemId: l.itemId, qty: (l.countedQty ?? 0) - l.systemQty }));

  let txNumber = "";
  try {
    await db.$transaction(async (prisma) => {
      txNumber = await nextTxNumber(prisma, "STOCK_ADJUSTMENT");
      const adjTx = await prisma.stockTransaction.create({
        data: {
          txNumber,
          type: "STOCK_ADJUSTMENT",
          status: "POSTED",
          warehouseToId: session.warehouseId,
          purpose: `Adjustment opname ${session.opnameNumber}`,
          createdById: user.id,
          postedById: user.id,
          postedAt: new Date(),
          lines: { create: deltas },
        },
      });
      for (const d of deltas) {
        const item = await prisma.item.findUnique({ where: { id: d.itemId } });
        const err = await adjustLevel(prisma, d.itemId, session.warehouseId, d.qty, item?.name ?? "?");
        if (err) throw new Error(err);
      }
      await prisma.opnameSession.update({
        where: { id: sessionId },
        data: { status: "POSTED", postedAt: new Date(), adjustmentTxId: adjTx.id },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Posting adjustment gagal." };
  }

  await logAudit({
    userId: user.id,
    action: "OPNAME_POST",
    module: "inventory",
    entityType: "OpnameSession",
    entityId: sessionId,
    description: `Posting adjustment opname ${session.opnameNumber} (${txNumber})`,
  });
  return { ok: true, id: sessionId };
}

// ── Rekonsiliasi saldo (PRD-WAREHOUSE-ENHANCEMENT F1) ────────────
// Menghitung ulang saldo dari transaksi dan membandingkannya dengan StockLevel.
// SENGAJA hanya melaporkan, tidak memperbaiki: saldo tidak boleh diubah di luar
// transaksi berposting. Selisih apa pun berarti ada bug yang harus dicari
// sumbernya, bukan ditutup dengan menulis ulang angkanya.

export interface BalanceDiscrepancy {
  itemId: string;
  itemName: string;
  warehouseId: string;
  warehouseCode: string;
  field: "onHand" | "reserved";
  stored: number;
  expected: number;
}

export async function reconcileStockLevels(): Promise<BalanceDiscrepancy[]> {
  const [transactions, levels, warehouses, items] = await Promise.all([
    db.stockTransaction.findMany({
      where: { status: { in: ["DRAFT", "POSTED"] } },
      include: { lines: true },
    }),
    db.stockLevel.findMany(),
    db.warehouse.findMany({ select: { id: true, code: true } }),
    db.item.findMany({ select: { id: true, name: true } }),
  ]);

  const onHand = new Map<string, number>();
  const reserved = new Map<string, number>();
  const bump = (map: Map<string, number>, itemId: string, warehouseId: string, delta: number) => {
    const key = `${itemId}::${warehouseId}`;
    map.set(key, (map.get(key) ?? 0) + delta);
  };

  for (const tx of transactions) {
    for (const line of tx.lines) {
      if (tx.status === "DRAFT") {
        if (RESERVING_TYPES.has(tx.type) && tx.warehouseFromId) {
          bump(reserved, line.itemId, tx.warehouseFromId, line.qty);
        }
        continue;
      }
      switch (tx.type) {
        case "GOODS_RECEIPT":
        case "STOCK_RETURN":
        case "STOCK_ADJUSTMENT":
          if (tx.warehouseToId) bump(onHand, line.itemId, tx.warehouseToId, line.qty);
          break;
        case "STOCK_ISSUE":
          if (tx.warehouseFromId) bump(onHand, line.itemId, tx.warehouseFromId, -line.qty);
          break;
        case "STOCK_TRANSFER":
          if (tx.warehouseFromId) bump(onHand, line.itemId, tx.warehouseFromId, -line.qty);
          if (tx.warehouseToId) bump(onHand, line.itemId, tx.warehouseToId, line.qty);
          break;
      }
    }
  }

  const itemName = new Map(items.map((i) => [i.id, i.name]));
  const warehouseCode = new Map(warehouses.map((w) => [w.id, w.code]));
  const out: BalanceDiscrepancy[] = [];

  const seen = new Set<string>();
  for (const level of levels) {
    const key = `${level.itemId}::${level.warehouseId}`;
    seen.add(key);
    const base = {
      itemId: level.itemId,
      itemName: itemName.get(level.itemId) ?? "?",
      warehouseId: level.warehouseId,
      warehouseCode: warehouseCode.get(level.warehouseId) ?? "?",
    };
    const expectedOnHand = onHand.get(key) ?? 0;
    const expectedReserved = reserved.get(key) ?? 0;
    if (level.onHand !== expectedOnHand) {
      out.push({ ...base, field: "onHand", stored: level.onHand, expected: expectedOnHand });
    }
    if (level.reserved !== expectedReserved) {
      out.push({ ...base, field: "reserved", stored: level.reserved, expected: expectedReserved });
    }
  }

  // Kombinasi yang punya transaksi tapi belum punya baris saldo sama sekali.
  for (const [key, expected] of [...onHand, ...reserved]) {
    if (expected === 0 || seen.has(key)) continue;
    const [itemId, warehouseId] = key.split("::");
    out.push({
      itemId,
      itemName: itemName.get(itemId) ?? "?",
      warehouseId,
      warehouseCode: warehouseCode.get(warehouseId) ?? "?",
      field: onHand.has(key) ? "onHand" : "reserved",
      stored: 0,
      expected,
    });
  }

  return out;
}
