import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/constants";
import type { CurrentUser } from "@/lib/rbac";

// ── Slot Peruntukan Stock (Fase 20, F9) ─────────────────────────
// Stock di gudang bisa dialokasikan ke slot peruntukan (instalasi,
// maintenance, proyek, emergency, dst). Aturan yang ditegakkan di sini:
//
//  - UNALLOC bukan baris data, melainkan TURUNAN: sisa yang belum
//    dialokasikan = onHand − seluruh alokasi bernama. Dengan begitu alokasi
//    tidak pernah bisa menyimpang dari saldo gudang.
//  - Total alokasi satu item dalam satu gudang tidak boleh melebihi onHand.
//  - Ledger slot append-only — koreksi berupa mutasi baru, bukan edit.
//  - Perpindahan di atas ambang kebijakan butuh izin khusus.
//  - Slot hanya bisa dinonaktifkan bila seluruh alokasinya nol.

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

export interface SlotAvailability {
  onHand: number;
  allocated: number;
  unallocated: number;
}

/** Ringkasan alokasi satu item di satu gudang. */
export async function slotAvailability(
  warehouseId: string,
  itemId: string
): Promise<SlotAvailability> {
  const [level, allocations] = await Promise.all([
    db.stockLevel.findUnique({ where: { itemId_warehouseId: { itemId, warehouseId } } }),
    db.slotAllocation.findMany({
      where: { itemId, slot: { warehouseId } },
      select: { qty: true },
    }),
  ]);
  const onHand = level?.onHand ?? 0;
  const allocated = allocations.reduce((sum, a) => sum + a.qty, 0);
  return { onHand, allocated, unallocated: onHand - allocated };
}

async function activeThreshold(): Promise<number | null> {
  const policy = await db.slotTransferPolicy.findFirst({ where: { isActive: true } });
  return policy?.maxQty ?? null;
}

/**
 * Memindahkan alokasi. `fromSlotId` null berarti mengambil dari sisa yang
 * belum dialokasikan; `toSlotId` null berarti mengembalikannya ke sana.
 */
export async function moveAllocation(
  user: CurrentUser,
  data: {
    warehouseId: string;
    itemId: string;
    fromSlotId?: string | null;
    toSlotId?: string | null;
    qty: number;
    note?: string;
  }
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.STOCK_CREATE)) {
    return { ok: false, error: "Anda tidak memiliki izin mengatur alokasi slot." };
  }
  if (!Number.isInteger(data.qty) || data.qty <= 0) {
    return { ok: false, error: "Jumlah alokasi harus bilangan bulat lebih dari nol." };
  }
  if (!data.fromSlotId && !data.toSlotId) {
    return { ok: false, error: "Pilih slot asal atau slot tujuan." };
  }
  if (data.fromSlotId && data.fromSlotId === data.toSlotId) {
    return { ok: false, error: "Slot asal dan tujuan tidak boleh sama." };
  }

  const threshold = await activeThreshold();
  if (
    threshold !== null &&
    data.qty > threshold &&
    !user.permissions.has(PERMISSIONS.SLOT_APPROVE)
  ) {
    return {
      ok: false,
      error: `Perpindahan ${data.qty} melebihi ambang kebijakan (${threshold}) — butuh persetujuan penanggung jawab slot.`,
    };
  }

  const slotIds = [data.fromSlotId, data.toSlotId].filter(Boolean) as string[];
  const slots = await db.stockSlot.findMany({ where: { id: { in: slotIds } } });
  if (slots.length !== slotIds.length) return { ok: false, error: "Slot tidak ditemukan." };
  for (const slot of slots) {
    if (slot.warehouseId !== data.warehouseId) {
      return { ok: false, error: "Slot berada di gudang lain." };
    }
    if (!slot.isActive) return { ok: false, error: `Slot ${slot.code} nonaktif.` };
  }

  const availability = await slotAvailability(data.warehouseId, data.itemId);

  try {
    await db.$transaction(async (prisma) => {
      // Keluar dari slot asal (atau dari sisa belum teralokasi).
      if (data.fromSlotId) {
        const current = await prisma.slotAllocation.findUnique({
          where: { slotId_itemId: { slotId: data.fromSlotId, itemId: data.itemId } },
        });
        const have = current?.qty ?? 0;
        if (have < data.qty) {
          throw new Error(`Alokasi slot asal hanya ${have}, diminta ${data.qty}.`);
        }
        await prisma.slotAllocation.update({
          where: { slotId_itemId: { slotId: data.fromSlotId, itemId: data.itemId } },
          data: { qty: have - data.qty },
        });
        await prisma.slotLedger.create({
          data: {
            slotId: data.fromSlotId,
            itemId: data.itemId,
            qty: -data.qty,
            reason: data.toSlotId ? "SLOT_TRANSFER" : "RELEASE",
            note: data.note?.trim() || null,
            createdById: user.id,
          },
        });
      } else if (data.qty > availability.unallocated) {
        throw new Error(
          `Sisa belum teralokasi hanya ${availability.unallocated} (fisik ${availability.onHand}, teralokasi ${availability.allocated}).`
        );
      }

      // Masuk ke slot tujuan.
      if (data.toSlotId) {
        const current = await prisma.slotAllocation.findUnique({
          where: { slotId_itemId: { slotId: data.toSlotId, itemId: data.itemId } },
        });
        await prisma.slotAllocation.upsert({
          where: { slotId_itemId: { slotId: data.toSlotId, itemId: data.itemId } },
          update: { qty: (current?.qty ?? 0) + data.qty },
          create: { slotId: data.toSlotId, itemId: data.itemId, qty: data.qty },
        });
        await prisma.slotLedger.create({
          data: {
            slotId: data.toSlotId,
            itemId: data.itemId,
            qty: data.qty,
            reason: data.fromSlotId ? "SLOT_TRANSFER" : "ALLOCATE",
            note: data.note?.trim() || null,
            createdById: user.id,
          },
        });
      }

      // Invarian terakhir: total alokasi tidak boleh melebihi stock fisik.
      const after = await prisma.slotAllocation.findMany({
        where: { itemId: data.itemId, slot: { warehouseId: data.warehouseId } },
        select: { qty: true },
      });
      const total = after.reduce((sum, a) => sum + a.qty, 0);
      if (total > availability.onHand) {
        throw new Error(
          `Total alokasi ${total} melebihi stock fisik ${availability.onHand}.`
        );
      }
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Perpindahan alokasi gagal." };
  }

  await logAudit({
    userId: user.id,
    action: "SLOT_MOVE",
    module: "inventory",
    entityType: "SlotAllocation",
    entityId: data.toSlotId ?? data.fromSlotId ?? "",
    description: `Alokasi ${data.qty} unit ${data.fromSlotId ? "dari slot" : "dari sisa"} → ${data.toSlotId ? "slot" : "sisa"}`,
  });
  return { ok: true, id: data.toSlotId ?? data.fromSlotId ?? "" };
}

export async function deactivateSlot(user: CurrentUser, slotId: string): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.STOCK_CREATE)) {
    return { ok: false, error: "Anda tidak memiliki izin mengubah slot." };
  }
  const slot = await db.stockSlot.findUnique({
    where: { id: slotId },
    include: { type: true, allocations: true },
  });
  if (!slot) return { ok: false, error: "Slot tidak ditemukan." };
  if (slot.type.isSystem) return { ok: false, error: "Slot sistem tidak bisa dinonaktifkan." };
  const remaining = slot.allocations.reduce((sum, a) => sum + a.qty, 0);
  if (remaining > 0) {
    return { ok: false, error: `Slot masih memegang ${remaining} unit — kosongkan dulu.` };
  }

  await db.stockSlot.update({ where: { id: slotId }, data: { isActive: false } });
  await logAudit({
    userId: user.id,
    action: "SLOT_DEACTIVATE",
    module: "inventory",
    entityType: "StockSlot",
    entityId: slotId,
    description: `Menonaktifkan slot ${slot.code}`,
  });
  return { ok: true, id: slotId };
}

// ── Scope gudang per user (Fase 21, F12) ────────────────────────
// Bila seorang user punya minimal satu baris scope, ia hanya boleh menyentuh
// gudang yang terdaftar. Tanpa baris scope, aksesnya tidak dibatasi — sehingga
// fitur ini bisa diaktifkan bertahap per user tanpa mengunci semua orang.

export async function scopedWarehouseIds(userId: string): Promise<string[] | null> {
  const rows = await db.userWarehouseScope.findMany({
    where: { userId },
    select: { warehouseId: true },
  });
  return rows.length ? rows.map((r) => r.warehouseId) : null;
}

export async function assertWarehouseInScope(
  userId: string,
  warehouseIds: (string | null | undefined)[]
): Promise<string | null> {
  const scope = await scopedWarehouseIds(userId);
  if (!scope) return null;
  for (const id of warehouseIds) {
    if (id && !scope.includes(id)) {
      const wh = await db.warehouse.findUnique({ where: { id }, select: { code: true } });
      return `Anda tidak punya akses ke gudang ${wh?.code ?? id}.`;
    }
  }
  return null;
}
