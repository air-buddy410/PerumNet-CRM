import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/constants";
import { safeInternalHref } from "@/lib/internal-link";
import type { CurrentUser } from "@/lib/rbac";

// ── Pencarian entity (Fase 34, PRD Frontend §8 & §13) ───────────
//
// Read-only, dan setiap jenis entity dipagari izin melihat modulnya. Yang
// tidak dipegang user TIDAK ikut dicari sama sekali — bukan dicari lalu
// hasilnya disembunyikan. Bedanya penting: pencarian yang mengembalikan
// "tidak ada hasil" untuk sesuatu yang sebenarnya ada tetap membocorkan
// keberadaannya lewat waktu tanggap dan lewat pencocokan kata kunci.
//
// Hasilnya selalu bertautan internal yang sudah divalidasi.

export interface SearchResult {
  id: string;
  type: string;
  module: string;
  title: string;
  subtitle: string | null;
  href: string;
}

/** Batas per jenis entity, dan batas keseluruhan yang dikembalikan. */
export const SEARCH_LIMIT_PER_TYPE = 5;
export const SEARCH_LIMIT_TOTAL = 20;
const MIN_QUERY_LENGTH = 2;

/**
 * Pencarian akan sangat mahal bila kata kuncinya terlalu pendek — "a" cocok
 * dengan hampir semua baris di setiap tabel. Ambang ini menjaga biaya, dan
 * frontend sudah menampilkan empty state untuk query pendek.
 */
export function isSearchable(query: string): boolean {
  return query.trim().length >= MIN_QUERY_LENGTH;
}

function push(list: SearchResult[], r: Omit<SearchResult, "href"> & { href: string }) {
  const href = safeInternalHref(r.href);
  if (href) list.push({ ...r, href });
}

export async function searchEntities(
  user: CurrentUser,
  rawQuery: string,
  limitTotal: number = SEARCH_LIMIT_TOTAL
): Promise<SearchResult[]> {
  const q = rawQuery.trim();
  if (!isSearchable(q)) return [];

  const can = (p: string) => user.permissions.has(p);
  const take = SEARCH_LIMIT_PER_TYPE;
  const contains = { contains: q, mode: "insensitive" as const };
  const results: SearchResult[] = [];

  // Setiap blok dijalankan HANYA bila izinnya ada.
  if (can(PERMISSIONS.CUSTOMERS_VIEW)) {
    const rows = await db.customer.findMany({
      where: { OR: [{ name: contains }, { customerNumber: contains }, { phone: contains }] },
      select: { id: true, name: true, customerNumber: true, phone: true },
      take,
      orderBy: { name: "asc" },
    });
    for (const c of rows) {
      push(results, {
        id: c.id,
        type: "customer",
        module: "CRM",
        title: c.name,
        subtitle: `${c.customerNumber} · ${c.phone}`,
        href: `/crm/customers/${c.id}`,
      });
    }
  }

  if (can(PERMISSIONS.SUBSCRIPTIONS_VIEW)) {
    const rows = await db.subscription.findMany({
      where: { OR: [{ serviceNumber: contains }, { pppoeUsername: contains }] },
      select: { id: true, serviceNumber: true, pppoeUsername: true, customer: { select: { name: true } } },
      take,
      orderBy: { serviceNumber: "asc" },
    });
    for (const s of rows) {
      push(results, {
        id: s.id,
        type: "subscription",
        module: "CRM",
        title: s.serviceNumber,
        subtitle: `${s.customer.name}${s.pppoeUsername ? ` · ${s.pppoeUsername}` : ""}`,
        href: `/crm/subscriptions/${s.id}`,
      });
    }
  }

  if (can(PERMISSIONS.INVENTORY_VIEW)) {
    const rows = await db.serializedDevice.findMany({
      where: { OR: [{ serialNumber: contains }, { macAddress: contains }] },
      select: { id: true, serialNumber: true, macAddress: true, status: true, item: { select: { name: true } } },
      take,
      orderBy: { serialNumber: "asc" },
    });
    for (const d of rows) {
      push(results, {
        id: d.id,
        type: "device",
        module: "Inventory",
        title: d.serialNumber,
        subtitle: `${d.item.name}${d.macAddress ? ` · ${d.macAddress}` : ""}`,
        href: `/inventory/devices/${d.id}`,
      });
    }
  }

  if (can(PERMISSIONS.CTICKETS_VIEW)) {
    const rows = await db.customerTicket.findMany({
      where: { OR: [{ ticketNumber: contains }, { title: contains }] },
      select: { id: true, ticketNumber: true, title: true, status: true },
      take,
      orderBy: { createdAt: "desc" },
    });
    for (const t of rows) {
      push(results, {
        id: t.id,
        type: "ticket",
        module: "Helpdesk",
        title: t.ticketNumber,
        subtitle: t.title,
        href: `/helpdesk/tickets/${t.id}`,
      });
    }
  }

  if (can(PERMISSIONS.BILLING_VIEW)) {
    const rows = await db.invoice.findMany({
      where: { invoiceNumber: contains },
      select: { id: true, invoiceNumber: true, status: true, customer: { select: { name: true } } },
      take,
      orderBy: { issuedAt: "desc" },
    });
    for (const i of rows) {
      push(results, {
        id: i.id,
        type: "invoice",
        module: "Billing",
        title: i.invoiceNumber,
        subtitle: `${i.customer.name} · ${i.status}`,
        href: `/billing/invoices/${i.id}`,
      });
    }
  }

  if (can(PERMISSIONS.WORK_ORDERS_VIEW)) {
    const rows = await db.workOrder.findMany({
      where: { woNumber: contains },
      select: { id: true, woNumber: true, type: true, status: true },
      take,
      orderBy: { createdAt: "desc" },
    });
    for (const w of rows) {
      push(results, {
        id: w.id,
        type: "work_order",
        module: "Operasional",
        title: w.woNumber,
        subtitle: `${w.type} · ${w.status}`,
        href: `/operations/work-orders/${w.id}`,
      });
    }
  }

  if (can(PERMISSIONS.TERMINATION_VIEW)) {
    const rows = await db.customerTermination.findMany({
      where: { terminationNumber: contains },
      select: { id: true, terminationNumber: true, status: true, customer: { select: { name: true } } },
      take,
      orderBy: { createdAt: "desc" },
    });
    for (const t of rows) {
      push(results, {
        id: t.id,
        type: "termination",
        module: "CRM",
        title: t.terminationNumber,
        subtitle: `${t.customer.name} · ${t.status}`,
        href: `/crm/terminations/${t.id}`,
      });
    }
  }

  return results.slice(0, limitTotal);
}
