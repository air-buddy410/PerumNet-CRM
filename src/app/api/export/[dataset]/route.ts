import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { toCsv, csvResponse, type CsvColumn } from "@/lib/export-csv";

// ── Export CSV terpusat (gap G22) ───────────────────────────────
// Satu route untuk semua daftar, dengan registry per dataset. Alasannya:
// izin dan batas baris ditegakkan DI SATU TEMPAT, sehingga menambah dataset
// baru tidak bisa diam-diam melewatkan pemeriksaan izin.
//
// Batas baris disengaja: ekspor tanpa batas pada tabel yang tumbuh adalah cara
// mudah menjatuhkan server. Bila terpotong, itu DILAPORKAN di nama berkas —
// diam-diam memotong data lebih berbahaya daripada menolak.

const MAX_ROWS = 20_000;

interface Dataset {
  permission: string;
  filename: string;
  run: () => Promise<{ rows: unknown[]; columns: CsvColumn<never>[] }>;
}

const DATASETS: Record<string, Dataset> = {
  terminations: {
    permission: PERMISSIONS.TERMINATION_VIEW,
    filename: "terminasi-pelanggan",
    run: async () => {
      const rows = await db.customerTermination.findMany({
        include: {
          customer: true,
          subscription: true,
          warehouseTo: true,
          recovery: { select: { recoveryNumber: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
        take: MAX_ROWS,
      });
      type Row = (typeof rows)[number];
      return {
        rows,
        columns: [
          { header: "Nomor", value: (r: Row) => r.terminationNumber },
          { header: "Pelanggan", value: (r: Row) => r.customer.name },
          { header: "Layanan", value: (r: Row) => r.subscription.serviceNumber },
          { header: "Kategori", value: (r: Row) => r.reasonCategory },
          { header: "Alasan", value: (r: Row) => r.reason },
          { header: "Tanggal Berlaku", value: (r: Row) => r.effectiveDate },
          { header: "Status", value: (r: Row) => r.status },
          { header: "Gudang Penerima", value: (r: Row) => r.warehouseTo.name },
          { header: "Nomor Penarikan", value: (r: Row) => r.recovery?.recoveryNumber ?? "" },
          { header: "Status Penarikan", value: (r: Row) => r.recovery?.status ?? "" },
          { header: "Dibuat", value: (r: Row) => r.createdAt },
        ] as CsvColumn<never>[],
      };
    },
  },

  "device-recoveries": {
    permission: PERMISSIONS.INVENTORY_VIEW,
    filename: "penarikan-perangkat",
    run: async () => {
      // Satu baris per PERANGKAT, bukan per surat: pertanyaan yang biasanya
      // diajukan ke data ini adalah "unit mana yang belum kembali", dan itu
      // tidak terjawab oleh rekap per dokumen.
      const rows = await db.deviceRecoveryItem.findMany({
        include: {
          device: { include: { item: true } },
          inspection: true,
          recovery: {
            include: {
              assignee: true,
              termination: { include: { customer: true, subscription: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: MAX_ROWS,
      });
      type Row = (typeof rows)[number];
      return {
        rows,
        columns: [
          { header: "Nomor Penarikan", value: (r: Row) => r.recovery.recoveryNumber },
          { header: "Terminasi", value: (r: Row) => r.recovery.termination.terminationNumber },
          { header: "Pelanggan", value: (r: Row) => r.recovery.termination.customer.name },
          { header: "Layanan", value: (r: Row) => r.recovery.termination.subscription.serviceNumber },
          { header: "Teknisi", value: (r: Row) => r.recovery.assignee?.name ?? "" },
          { header: "Serial (catatan)", value: (r: Row) => r.snapshotSerial },
          { header: "Serial (lapangan)", value: (r: Row) => r.actualSerial ?? "" },
          { header: "Serial Cocok", value: (r: Row) => (!r.actualSerial ? "" : r.actualSerial === r.snapshotSerial ? "YA" : "TIDAK") },
          { header: "Item", value: (r: Row) => r.snapshotItemName },
          { header: "Status", value: (r: Row) => r.status },
          { header: "Keputusan", value: (r: Row) => r.finalDecision ?? "" },
          { header: "Batas SLA", value: (r: Row) => r.recovery.slaDueAt },
          { header: "Diambil", value: (r: Row) => r.pickedUpAt },
          { header: "Diterima", value: (r: Row) => r.receivedAt },
          { header: "Diinspeksi", value: (r: Row) => r.inspection?.inspectedAt ?? null },
        ] as CsvColumn<never>[],
      };
    },
  },

  stock: {
    permission: PERMISSIONS.INVENTORY_VIEW,
    filename: "posisi-stock",
    run: async () => {
      const rows = await db.stockLevel.findMany({
        include: { item: true, warehouse: true },
        orderBy: [{ warehouse: { code: "asc" } }, { item: { code: "asc" } }],
        take: MAX_ROWS,
      });
      type Row = (typeof rows)[number];
      return {
        rows,
        columns: [
          { header: "Gudang", value: (r: Row) => r.warehouse.code },
          { header: "Kode Item", value: (r: Row) => r.item.code },
          { header: "Nama Item", value: (r: Row) => r.item.name },
          { header: "Satuan", value: (r: Row) => r.item.unit },
          { header: "Fisik", value: (r: Row) => r.onHand },
          { header: "Ditahan", value: (r: Row) => r.reserved },
          { header: "Tersedia", value: (r: Row) => r.onHand - r.reserved },
          { header: "Rusak", value: (r: Row) => r.damaged },
          { header: "Perjalanan", value: (r: Row) => r.inTransit },
          { header: "Minimum", value: (r: Row) => r.item.minStock },
        ] as CsvColumn<never>[],
      };
    },
  },

  invoices: {
    permission: PERMISSIONS.BILLING_VIEW,
    filename: "invoice",
    run: async () => {
      const rows = await db.invoice.findMany({
        include: { customer: true, subscription: true },
        orderBy: { issuedAt: "desc" },
        take: MAX_ROWS,
      });
      type Row = (typeof rows)[number];
      return {
        rows,
        columns: [
          { header: "No Invoice", value: (r: Row) => r.invoiceNumber },
          { header: "Tanggal", value: (r: Row) => r.issuedAt },
          { header: "Jatuh Tempo", value: (r: Row) => r.dueAt },
          { header: "Periode", value: (r: Row) => r.period },
          { header: "Pelanggan", value: (r: Row) => r.customer.name },
          { header: "No Pelanggan", value: (r: Row) => r.customer.customerNumber },
          { header: "Layanan", value: (r: Row) => r.subscription?.serviceNumber ?? null },
          { header: "Subtotal", value: (r: Row) => r.subtotal },
          { header: "PPN %", value: (r: Row) => r.taxPercent },
          { header: "PPN", value: (r: Row) => r.taxAmount },
          { header: "Total", value: (r: Row) => r.totalAmount },
          { header: "Dibayar", value: (r: Row) => r.paidAmount },
          { header: "Status", value: (r: Row) => r.status },
        ] as CsvColumn<never>[],
      };
    },
  },

  payments: {
    permission: PERMISSIONS.BILLING_VIEW,
    filename: "pembayaran",
    run: async () => {
      const rows = await db.payment.findMany({
        include: { customer: true, receivedBy: true, merchant: true },
        orderBy: { paidAt: "desc" },
        take: MAX_ROWS,
      });
      type Row = (typeof rows)[number];
      return {
        rows,
        columns: [
          { header: "No Pembayaran", value: (r: Row) => r.paymentNumber },
          { header: "Tanggal", value: (r: Row) => r.paidAt },
          { header: "Pelanggan", value: (r: Row) => r.customer.name },
          { header: "Metode", value: (r: Row) => r.method },
          { header: "Merchant", value: (r: Row) => r.merchant?.name ?? null },
          { header: "Diterima Oleh", value: (r: Row) => r.receivedBy?.name ?? null },
          { header: "Nominal", value: (r: Row) => r.amount },
          { header: "Biaya", value: (r: Row) => r.feeAmount },
          { header: "Netto", value: (r: Row) => r.netAmount },
          { header: "Status", value: (r: Row) => r.status },
        ] as CsvColumn<never>[],
      };
    },
  },

  customers: {
    permission: PERMISSIONS.CUSTOMERS_VIEW,
    filename: "pelanggan",
    run: async () => {
      const rows = await db.customer.findMany({
        include: { area: true, subscriptions: { include: { package: true } } },
        orderBy: { customerNumber: "asc" },
        take: MAX_ROWS,
      });
      type Row = (typeof rows)[number];
      return {
        rows,
        columns: [
          { header: "No Pelanggan", value: (r: Row) => r.customerNumber },
          { header: "Nama", value: (r: Row) => r.name },
          { header: "Telepon", value: (r: Row) => r.phone },
          { header: "Alamat", value: (r: Row) => r.address },
          { header: "Area", value: (r: Row) => r.area?.name ?? null },
          { header: "Status", value: (r: Row) => r.status },
          { header: "Jumlah Langganan", value: (r: Row) => r.subscriptions.length },
          {
            header: "Paket",
            value: (r: Row) => r.subscriptions.map((s) => s.package.name).join(" | "),
          },
        ] as CsvColumn<never>[],
      };
    },
  },

  tickets: {
    permission: PERMISSIONS.CTICKETS_VIEW,
    filename: "tiket-pelanggan",
    run: async () => {
      const rows = await db.customerTicket.findMany({
        include: { customer: true, category: true, assignee: true },
        orderBy: { createdAt: "desc" },
        take: MAX_ROWS,
      });
      type Row = (typeof rows)[number];
      return {
        rows,
        columns: [
          { header: "No Tiket", value: (r: Row) => r.ticketNumber },
          { header: "Dibuat", value: (r: Row) => r.createdAt },
          { header: "Pelanggan", value: (r: Row) => r.customer.name },
          { header: "Kategori", value: (r: Row) => r.category.name },
          { header: "Judul", value: (r: Row) => r.title },
          { header: "Status", value: (r: Row) => r.status },
          { header: "Prioritas", value: (r: Row) => r.priority },
          { header: "Petugas", value: (r: Row) => r.assignee?.name ?? null },
          { header: "Selesai", value: (r: Row) => r.resolvedAt },
          { header: "MTTR (menit)", value: (r: Row) => r.mttrMinutes },
          { header: "SLA Terlampaui", value: (r: Row) => (r.slaBreached ? "YA" : "TIDAK") },
        ] as CsvColumn<never>[],
      };
    },
  },

  pppoe: {
    permission: PERMISSIONS.NOC_VIEW,
    filename: "sesi-pppoe",
    run: async () => {
      const rows = await db.pppoeSession.findMany({
        include: {
          router: { include: { networkDevice: true } },
          subscription: { include: { customer: true } },
        },
        orderBy: [{ status: "asc" }, { username: "asc" }],
        take: MAX_ROWS,
      });
      type Row = (typeof rows)[number];
      return {
        rows,
        columns: [
          { header: "Username", value: (r: Row) => r.username },
          { header: "Pelanggan", value: (r: Row) => r.subscription?.customer.name ?? null },
          { header: "Layanan", value: (r: Row) => r.subscription?.serviceNumber ?? null },
          { header: "Router", value: (r: Row) => r.router.networkDevice.hostname },
          { header: "Status", value: (r: Row) => r.status },
          { header: "IP", value: (r: Row) => r.address },
          { header: "MAC", value: (r: Row) => r.callerId },
          { header: "Terakhir Online", value: (r: Row) => r.lastSeenAt },
        ] as CsvColumn<never>[],
      };
    },
  },

  odp: {
    permission: PERMISSIONS.NOC_VIEW,
    filename: "odp",
    run: async () => {
      const rows = await db.odp.findMany({
        include: { site: true, ponPort: true, parent: true, ports: true },
        orderBy: { code: "asc" },
        take: MAX_ROWS,
      });
      type Row = (typeof rows)[number];
      return {
        rows,
        columns: [
          { header: "Kode ODP", value: (r: Row) => r.code },
          { header: "Site", value: (r: Row) => r.site?.name ?? null },
          { header: "PON", value: (r: Row) => r.ponPort?.label ?? null },
          { header: "ODP Induk", value: (r: Row) => r.parent?.code ?? null },
          { header: "Kapasitas", value: (r: Row) => r.portCapacity },
          {
            header: "Terpakai",
            value: (r: Row) => r.ports.filter((p) => p.status === "USED").length,
          },
          { header: "Optic (dBm)", value: (r: Row) => r.opticPowerDbm },
          { header: "Lintang", value: (r: Row) => r.latitude },
          { header: "Bujur", value: (r: Row) => r.longitude },
          { header: "Status", value: (r: Row) => r.status },
        ] as CsvColumn<never>[],
      };
    },
  },
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ dataset: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Belum login." }, { status: 401 });

  const { dataset } = await params;
  const config = DATASETS[dataset];
  if (!config) {
    return NextResponse.json({ error: "Dataset tidak dikenal." }, { status: 404 });
  }
  if (!user.permissions.has(config.permission)) {
    return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  }

  const { rows, columns } = await config.run();
  const csv = toCsv(rows as never[], columns);
  // Bila menyentuh batas, katakan di nama berkasnya — jangan diam-diam memotong.
  const name =
    rows.length >= MAX_ROWS ? `${config.filename}-TERPOTONG-${MAX_ROWS}` : config.filename;
  return csvResponse(name, csv);
}
