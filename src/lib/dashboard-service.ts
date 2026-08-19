// ── Ringkasan dashboard per divisi (Fase 93) ────────────────────
//
// Dashboard lama menampilkan empat angka: User Aktif, Role, Approval Pending,
// dan Aktivitas Audit Hari Ini. Dua di antaranya tidak pernah berubah, dan
// `ApprovalRequest` di produksi berisi NOL baris — jadi kartu "Approval
// Pending" beserta kedua panel di bawahnya selalu kosong. Yang dilihat orang
// tiap pagi adalah layar yang benar tetapi tidak memberi tahu apa pun.
//
// Berkas ini mengumpulkan angka yang SUDAH ADA di basis data dan
// mengelompokkannya menurut divisi yang memakainya. Tidak ada tabel baru,
// tidak ada kolom baru, tidak ada tulisan ke basis data — seluruhnya `count`
// dan `groupBy`.
//
// ## Kenapa "kosong" dibedakan jadi dua
//
// Sebagian besar modul CRM berisi nol baris. Menampilkannya sebagai "0" saja
// menyesatkan, karena nol itu punya DUA sebab yang berlawanan:
//
//   - Finance nol karena CRM sengaja tidak menagih. Operasional masih di
//     ALUS, dan lima pekerjaan terjadwal dimatikan supaya pelanggan tidak
//     diperlakukan oleh dua sistem sekaligus. Ini keadaan yang DIINGINKAN.
//   - Helpdesk nol karena memang belum ada yang memakainya.
//
// Angka yang sama, arti yang berbeda. Kalau dashboard menampilkan keduanya
// sebagai "0", orang akan menyimpulkan CRM-nya rusak — atau lebih buruk,
// menyalakan penagihan untuk "memperbaiki" angka itu. Maka tiap divisi
// membawa `keadaan` dan `catatan`, dan layar wajib menampilkannya.
//
// Lihat `docs/MODE-BACA-SAJA.md` dan `docs/AUDIT-FUNGSI-CRM.md`.

import { db } from "@/lib/db";

/** Kenapa sebuah divisi tidak punya angka — nol yang mana. */
export type KeadaanDivisi =
  /** Ada data produksi yang sungguhan dipakai. */
  | "BERISI"
  /** Fungsinya ada dan matang, tapi SENGAJA tidak dijalankan (mode baca-saja). */
  | "SENGAJA-KOSONG"
  /** Fungsinya ada, belum ada yang mengisi. Bukan kerusakan. */
  | "BELUM-DIPAKAI";

/** Nada dipakai untuk pewarnaan saja — ia tidak pernah memutuskan apa pun. */
export type NadaMetrik = "netral" | "perhatian" | "bahaya";

export interface MetrikDivisi {
  label: string;
  nilai: number;
  /** Pembanding, bila angkanya hanya berarti sebagai bagian dari sesuatu. */
  dari?: number;
  satuan?: string;
  href?: string;
  nada: NadaMetrik;
}

export interface RingkasanDivisi {
  kode: string;
  nama: string;
  pegawai: number;
  keadaan: KeadaanDivisi;
  /** Kalimat yang menjelaskan keadaan di atas. Selalu ada, selalu ditampilkan. */
  catatan: string;
  metrik: MetrikDivisi[];
}

/**
 * Angka NOC yang berdiri sendiri di kepala dashboard.
 *
 * NOC dipisahkan bukan karena divisinya lebih penting, melainkan karena hanya
 * angka-angka ini yang BERUBAH tiap menit. Sisanya bergerak dalam hitungan
 * hari. Menaruh keduanya dalam satu deret membuat yang berubah tenggelam.
 */
export interface SorotanNoc {
  sesiOnline: number;
  sesiTotal: number;
  /** Sesi PPPoE yang tidak cocok dengan langganan mana pun. */
  sesiYatim: number;
  langgananAktif: number;
  langgananIsolir: number;
  alarmTerbuka: number;
  alarmKritis: number;
  probeDown: number;
  probeAktif: number;
  perangkat: number;
  perangkatTidakAktif: number;
  odpTotal: number;
  odpBerkoordinat: number;
  portTerpakai: number;
  portKapasitas: number;
  /** Kapan penarikan PPPoE terakhir berhasil. Null = belum pernah. */
  penarikanTerakhir: Date | null;
}

export interface RingkasanDashboard {
  sekarang: Date;
  noc: SorotanNoc;
  divisi: RingkasanDivisi[];
}

const nadaRasio = (terpakai: number, total: number): NadaMetrik => {
  if (total <= 0) return "netral";
  const r = terpakai / total;
  if (r >= 0.9) return "bahaya";
  if (r >= 0.75) return "perhatian";
  return "netral";
};

/**
 * Membaca seluruh angka dashboard dalam satu perjalanan.
 *
 * Semuanya `count`/`groupBy` — tidak ada yang menulis. Aman dipanggil dari
 * server component mana pun, termasuk saat CRM berjalan dalam mode baca-saja.
 */
export async function loadRingkasanDashboard(
  sekarang = new Date(),
): Promise<RingkasanDashboard> {
  const awalHariIni = new Date(sekarang);
  awalHariIni.setHours(0, 0, 0, 0);

  const [
    divisiRows,
    langgananPerStatus,
    sesiTotal,
    sesiOnline,
    sesiYatim,
    alarmTerbuka,
    alarmKritis,
    probeAktif,
    probeDown,
    perangkat,
    perangkatTidakAktif,
    odpTotal,
    odpBerkoordinat,
    portAgg,
    penarikanTerakhir,
    pelanggan,
    // Gudang
    item,
    stockLevel,
    stockTransaksi,
    supplier,
    gudang,
    // Keuangan — nol di produksi, dan itu disengaja
    invoice,
    payment,
    jurnal,
    kasTransaksi,
    // Belum dipakai
    tiketPelanggan,
    tiketIt,
    asetIt,
    server,
    lead,
    quotation,
    survey,
    campaign,
    proyek,
    workOrder,
    // Manajemen
    approvalPending,
    auditHariIni,
    penggunaAktif,
  ] = await Promise.all([
    db.division.findMany({
      orderBy: { code: "asc" },
      select: { code: true, name: true, _count: { select: { employees: true } } },
    }),
    db.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
    db.pppoeSession.count(),
    db.pppoeSession.count({ where: { status: "ONLINE" } }),
    db.pppoeSession.count({ where: { subscriptionId: null } }),
    db.networkAlarm.count({ where: { clearedAt: null } }),
    db.networkAlarm.count({ where: { clearedAt: null, severity: "CRITICAL" } }),
    db.probeTarget.count({ where: { isActive: true } }),
    db.probeTarget.count({ where: { isActive: true, lastStatus: "DOWN" } }),
    db.networkDevice.count(),
    db.networkDevice.count({ where: { status: { not: "ACTIVE" } } }),
    db.odp.count(),
    db.odp.count({ where: { latitude: { not: null }, longitude: { not: null } } }),
    db.odp.aggregate({ _sum: { portUsed: true, portCapacity: true } }),
    db.pppoePollRun.findFirst({
      where: { status: "SUCCESS" },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    }),
    db.customer.count(),
    db.item.count(),
    db.stockLevel.count(),
    db.stockTransaction.count(),
    db.supplier.count(),
    db.warehouse.count(),
    db.invoice.count(),
    db.payment.count(),
    db.journalEntry.count(),
    db.cashTransaction.count(),
    db.customerTicket.count(),
    db.itTicket.count(),
    db.itAsset.count(),
    db.server.count(),
    db.lead.count(),
    db.quotation.count(),
    db.survey.count(),
    db.campaign.count(),
    db.project.count(),
    db.workOrder.count(),
    db.approvalRequest.count({ where: { status: "PENDING" } }),
    db.auditLog.count({ where: { createdAt: { gte: awalHariIni } } }),
    db.user.count({ where: { isActive: true } }),
  ]);

  const jumlahStatus = (s: string) =>
    langgananPerStatus.find((r) => r.status === s)?._count._all ?? 0;
  const langgananAktif = jumlahStatus("ACTIVE");
  const langgananIsolir = jumlahStatus("ISOLATED");
  const langgananTotal = langgananPerStatus.reduce((n, r) => n + r._count._all, 0);

  const portTerpakai = portAgg._sum.portUsed ?? 0;
  const portKapasitas = portAgg._sum.portCapacity ?? 0;

  const noc: SorotanNoc = {
    sesiOnline,
    sesiTotal,
    sesiYatim,
    langgananAktif,
    langgananIsolir,
    alarmTerbuka,
    alarmKritis,
    probeDown,
    probeAktif,
    perangkat,
    perangkatTidakAktif,
    odpTotal,
    odpBerkoordinat,
    portTerpakai,
    portKapasitas,
    penarikanTerakhir: penarikanTerakhir?.finishedAt ?? null,
  };

  /**
   * Metrik per kode divisi.
   *
   * Divisi yang tidak disebut di sini tetap muncul di layar — dengan daftar
   * metrik kosong dan keadaan `BELUM-DIPAKAI`. Itu disengaja: divisi yang
   * hilang dari dashboard membuat orang mengira ia tidak ada.
   */
  const perDivisi: Record<string, Omit<RingkasanDivisi, "kode" | "nama" | "pegawai">> = {
    NOC: {
      keadaan: "BERISI",
      catatan: "Satu-satunya bagian CRM yang angkanya berubah tiap menit.",
      metrik: [
        { label: "Perangkat jaringan", nilai: perangkat, href: "/noc/devices", nada: "netral" },
        {
          label: "Alarm terbuka",
          nilai: alarmTerbuka,
          href: "/noc/alarms",
          nada: alarmKritis > 0 ? "bahaya" : alarmTerbuka > 0 ? "perhatian" : "netral",
        },
        {
          label: "Probe DOWN",
          nilai: probeDown,
          dari: probeAktif,
          href: "/noc/probe",
          nada: probeDown > 0 ? "bahaya" : "netral",
        },
        {
          label: "Sesi PPPoE online",
          nilai: sesiOnline,
          dari: sesiTotal,
          href: "/noc/pppoe",
          nada: "netral",
        },
      ],
    },
    NOF: {
      keadaan: "BERISI",
      catatan: "Angka lapangan: sebaran ODP dan keterisian portnya.",
      metrik: [
        { label: "ODP terdaftar", nilai: odpTotal, href: "/noc/ftth", nada: "netral" },
        {
          label: "ODP berkoordinat",
          nilai: odpBerkoordinat,
          dari: odpTotal,
          href: "/noc/map",
          nada: odpBerkoordinat < odpTotal ? "perhatian" : "netral",
        },
        {
          label: "Port terpakai",
          nilai: portTerpakai,
          dari: portKapasitas,
          href: "/noc/ftth",
          nada: nadaRasio(portTerpakai, portKapasitas),
        },
      ],
    },
    OAC: {
      keadaan: "BERISI",
      catatan: "Data pelanggan sudah lengkap; tindakannya masih di ALUS.",
      metrik: [
        { label: "Pelanggan", nilai: pelanggan, href: "/crm/customers", nada: "netral" },
        {
          label: "Langganan aktif",
          nilai: langgananAktif,
          dari: langgananTotal,
          href: "/crm/subscriptions",
          nada: "netral",
        },
        {
          label: "Terisolir",
          nilai: langgananIsolir,
          href: "/crm/subscriptions?status=ISOLATED",
          nada: langgananIsolir > 0 ? "perhatian" : "netral",
        },
      ],
    },
    WH: {
      keadaan: "BERISI",
      catatan: "Katalog dan mutasi stok sudah terisi dari workbook gudang.",
      metrik: [
        { label: "Item katalog", nilai: item, href: "/inventory/items", nada: "netral" },
        { label: "Baris saldo stok", nilai: stockLevel, href: "/inventory/stock", nada: "netral" },
        { label: "Mutasi stok", nilai: stockTransaksi, href: "/inventory/transactions", nada: "netral" },
        { label: "Pemasok", nilai: supplier, href: "/inventory/suppliers", nada: "netral" },
        { label: "Gudang", nilai: gudang, href: "/inventory/warehouses", nada: "netral" },
      ],
    },
    FIN: {
      keadaan: "SENGAJA-KOSONG",
      catatan:
        "CRM tidak menagih. Penagihan masih di ALUS — kalau keduanya berjalan, " +
        "pelanggan menerima tagihan dari dua sistem yang tidak saling tahu.",
      metrik: [
        { label: "Invoice", nilai: invoice, href: "/billing/invoices", nada: "netral" },
        { label: "Pembayaran", nilai: payment, href: "/billing/payments", nada: "netral" },
        { label: "Jurnal", nilai: jurnal, href: "/finance/gl/journal", nada: "netral" },
        { label: "Transaksi kas", nilai: kasTransaksi, href: "/finance/transactions", nada: "netral" },
      ],
    },
    MGT: {
      keadaan: "BERISI",
      catatan: "Jejak perubahan dan persetujuan lintas divisi.",
      metrik: [
        { label: "Pengguna aktif", nilai: penggunaAktif, href: "/settings/users", nada: "netral" },
        {
          label: "Approval menunggu",
          nilai: approvalPending,
          href: "/approvals",
          nada: approvalPending > 0 ? "perhatian" : "netral",
        },
        { label: "Audit hari ini", nilai: auditHariIni, href: "/audit-log", nada: "netral" },
      ],
    },
    CS: {
      keadaan: "BELUM-DIPAKAI",
      catatan: "Helpdesk pelanggan sudah jadi, belum ada tiket yang masuk.",
      metrik: [{ label: "Tiket pelanggan", nilai: tiketPelanggan, href: "/helpdesk/tickets", nada: "netral" }],
    },
    IT: {
      keadaan: "BELUM-DIPAKAI",
      catatan: "Modul IT lengkap, isinya belum dimasukkan.",
      metrik: [
        { label: "Aset IT", nilai: asetIt, href: "/it/assets", nada: "netral" },
        { label: "Tiket IT", nilai: tiketIt, href: "/it/tickets", nada: "netral" },
        { label: "Server", nilai: server, href: "/it/servers", nada: "netral" },
      ],
    },
    SLS: {
      keadaan: "BELUM-DIPAKAI",
      catatan: "Pipeline penjualan belum dipakai; pelanggan masuk lewat impor.",
      metrik: [
        { label: "Lead", nilai: lead, href: "/sales/leads", nada: "netral" },
        { label: "Penawaran", nilai: quotation, href: "/sales/quotations", nada: "netral" },
        { label: "Survei", nilai: survey, href: "/sales/surveys", nada: "netral" },
      ],
    },
    MKT: {
      keadaan: "BELUM-DIPAKAI",
      catatan: "Kampanye belum dibuat.",
      metrik: [{ label: "Kampanye", nilai: campaign, href: "/marketing/campaigns", nada: "netral" }],
    },
    PRJ: {
      keadaan: "BELUM-DIPAKAI",
      catatan: "Proyek belum dicatat di CRM.",
      metrik: [{ label: "Proyek", nilai: proyek, href: "/projects", nada: "netral" }],
    },
    OPS: {
      keadaan: "BELUM-DIPAKAI",
      catatan: "Work order belum dipakai; penugasan lapangan masih di luar CRM.",
      metrik: [{ label: "Work order", nilai: workOrder, href: "/operations/work-orders", nada: "netral" }],
    },
  };

  const divisi: RingkasanDivisi[] = divisiRows.map((d) => {
    const isi = perDivisi[d.code];
    return {
      kode: d.code,
      nama: d.name,
      pegawai: d._count.employees,
      keadaan: isi?.keadaan ?? "BELUM-DIPAKAI",
      catatan: isi?.catatan ?? "Belum ada angka yang dipetakan ke divisi ini.",
      metrik: isi?.metrik ?? [],
    };
  });

  return { sekarang, noc, divisi };
}
