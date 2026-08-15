// ── Penerjemahan kosakata LibreNMS (Fase 70) ────────────────────
//
// Lapisan MURNI: nilai dari LibreNMS masuk, kosakata CRM keluar. Tidak
// menyentuh jaringan maupun basis data, jadi seluruh pemetaannya bisa diuji
// tanpa LibreNMS hidup — dan itu penting, sebab pemetaan yang salah tidak
// membuat apa pun error; ia hanya diam-diam melabeli OLT sebagai router.

/** Bentuk satu perangkat dari `GET /api/v0/devices`. Hanya yang kita pakai. */
export interface LibreDevice {
  device_id: number;
  hostname: string;
  sysName?: string | null;
  os?: string | null;
  hardware?: string | null;
  version?: string | null;
  serial?: string | null;
  /** 1 = hidup, 0 = mati. LibreNMS mengirimnya sebagai angka maupun teks. */
  status?: number | string | null;
  uptime?: number | string | null;
  disabled?: number | boolean | null;
  ignore?: number | boolean | null;
}

/**
 * `os` LibreNMS menjadi `NetworkDevice.deviceType`.
 *
 * Dipetakan dari `os`, bukan dari `hardware`: `hardware` kosong pada lima dari
 * enam perangkat kita, sedangkan `os` selalu terisi karena LibreNMS
 * menurunkannya dari sysObjectID saat penemuan.
 *
 * `parks-switch` diperlakukan sebagai OLT dan itu memang terlihat aneh.
 * Penyebabnya: firmware HSGQ menyamar sebagai perangkat Parks, sehingga
 * LibreNMS salah mengenalinya. Yang membetulkan tebakan itu adalah sysName,
 * yang pada kedua unit tertulis "olt".
 */
export function deviceTypeFromOs(os: string | null | undefined, sysName?: string | null): string {
  const o = (os ?? "").trim().toLowerCase();
  const s = (sysName ?? "").trim().toLowerCase();
  if (o === "routeros") return "ROUTER";
  if (o === "zxa10" || o.startsWith("zxa")) return "OLT";
  // sysName lebih dipercaya daripada os yang salah kenal.
  if (s.includes("olt")) return "OLT";
  if (o.includes("switch")) return "ACCESS_SWITCH";
  if (o === "linux" || o === "generic") return "SERVER";
  return "OTHER";
}

/**
 * `os` menjadi merek perangkat.
 *
 * Ini MEREK, bukan pemasok — `Supplier` yang menyimpan dari siapa barangnya
 * dibeli. Keduanya sengaja terpisah; lihat catatan pada model Supplier.
 */
export function vendorFromOs(os: string | null | undefined, sysName?: string | null): string | null {
  const o = (os ?? "").trim().toLowerCase();
  const s = (sysName ?? "").trim().toLowerCase();
  if (o === "routeros") return "MikroTik";
  if (o.startsWith("zxa")) return "ZTE";
  // Sama seperti di atas: HSGQ terbaca sebagai Parks oleh LibreNMS.
  if (o === "parks-switch" && s.includes("olt")) return "HSGQ";
  if (o === "parks-switch") return "Parks";
  return null;
}

/**
 * Nama host yang layak ditampilkan.
 *
 * LibreNMS memakai alamat IP sebagai `hostname` bila penemuan dilakukan lewat
 * IP, sementara `sysName` membawa nama yang benar-benar diberikan operator.
 * Tetapi tiga OLT ZTE kita sama-sama bernama "zxan" bawaan pabrik, jadi
 * memakai sysName begitu saja melahirkan tiga perangkat bernama sama yang
 * tidak bisa dibedakan siapa pun.
 *
 * Karena itu: sysName dipakai HANYA bila ia bukan nama bawaan yang berulang.
 * Sisanya memakai IP, yang setidaknya unik dan bisa dicari.
 */
const NAMA_PABRIK = new Set(["zxan", "olt", "switch", "localhost", "device"]);

export function hostnameOf(d: LibreDevice): string {
  const sys = (d.sysName ?? "").trim();
  if (sys && !NAMA_PABRIK.has(sys.toLowerCase())) return sys.toUpperCase();
  return d.hostname.trim().toUpperCase();
}

/** `status` LibreNMS boleh berupa angka maupun teks; keduanya diterima. */
export function isUp(status: number | string | null | undefined): boolean {
  if (status === null || status === undefined || status === "") return false;
  const n = Number(status);
  return Number.isFinite(n) ? n === 1 : String(status).trim().toLowerCase() === "up";
}

/** Detik uptime menjadi kalimat pendek berbahasa Indonesia. */
export function uptimeText(uptime: number | string | null | undefined): string | null {
  const n = Number(uptime);
  if (!Number.isFinite(n) || n <= 0) return null;
  const hari = Math.floor(n / 86_400);
  const jam = Math.floor((n % 86_400) / 3_600);
  if (hari > 0) return `${hari} hari ${jam} jam`;
  const menit = Math.floor((n % 3_600) / 60);
  return `${jam} jam ${menit} menit`;
}

/**
 * Perangkat yang TIDAK boleh ikut disinkron.
 *
 * Perangkat yang dinonaktifkan atau diabaikan di LibreNMS sengaja
 * dikeluarkan dari pemantauan oleh operatornya. Menariknya ke CRM akan
 * memunculkannya kembali di daftar perangkat seakan-akan masih dipantau.
 */
export function shouldSkip(d: LibreDevice): boolean {
  const truthy = (v: number | boolean | null | undefined) => v === 1 || v === true;
  return truthy(d.disabled) || truthy(d.ignore);
}

// ── Port / antarmuka ────────────────────────────────────────────

/** Bentuk satu port dari `GET /api/v0/ports`. Hanya yang kita pakai. */
export interface LibrePort {
  port_id: number;
  device_id: number;
  ifName?: string | null;
  ifAlias?: string | null;
  ifDescr?: string | null;
  ifType?: string | null;
  ifSpeed?: number | string | null;
  ifOperStatus?: string | null;
  ifAdminStatus?: string | null;
}

/**
 * Nama port yang dipakai. `ifName` yang utama, `ifDescr` cadangannya.
 *
 * Port tanpa nama sama sekali dilewati oleh pemanggilnya — bukan diberi nama
 * karangan seperti "port-123", sebab nama semacam itu terlihat sah dan akan
 * dipakai orang untuk merujuk sesuatu yang sebenarnya tidak diketahui.
 */
export function portNameOf(p: LibrePort): string | null {
  const n = (p.ifName ?? "").trim() || (p.ifDescr ?? "").trim();
  return n || null;
}

/**
 * `ifAlias` hanya disimpan bila ia benar-benar membawa keterangan.
 *
 * Sebagian besar perangkat menyalin ifName ke ifAlias ketika operator tidak
 * mengisinya. Menyimpan salinan itu membuat kolom keterangan tampak terisi
 * seluruhnya padahal 818 dari 818 tidak mengatakan apa pun — dan kolom yang
 * selalu terisi berhenti diperhatikan orang.
 */
export function aliasOf(p: LibrePort): string | null {
  const alias = (p.ifAlias ?? "").trim();
  if (!alias) return null;
  const nama = portNameOf(p);
  return nama && alias.toLowerCase() === nama.toLowerCase() ? null : alias;
}

/** ifSpeed LibreNMS boleh angka, teks, atau kosong. */
export function speedBps(v: number | string | null | undefined): bigint | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return BigInt(Math.trunc(n));
}

/**
 * Golongan port dalam bahasa yang bermakna bagi operasional, bukan bagi SNMP.
 *
 * Dipakai untuk menyaring: daftar 818 port tanpa golongan tidak bisa dibaca
 * siapa pun, sebab 690 di antaranya adalah satu baris per ONU pelanggan.
 */
export function portKind(
  ifType: string | null | undefined,
  ifName?: string | null,
  ifSpeedBps?: bigint | number | null
): string {
  const t = (ifType ?? "").trim().toLowerCase();
  const n = (ifName ?? "").trim().toLowerCase();
  if (t === "gpon" || n.startsWith("gpon")) return "PON";
  if (n.startsWith("onu") || n.startsWith("ont")) return "ONU";
  // `XGE01` — singkatan vendor untuk 10 Gigabit Ethernet. Ini uplink OLT,
  // dan pada perangkat kita keduanya memang melapor 10 Gbps.
  if (/^xge\d*$/.test(n)) return "ETHERNET";
  if (/^pon\d+$/.test(n)) return "PON";
  // Port PON pada OLT HSGQ melapor ifType `other`, sama seperti ONU, sehingga
  // tipenya tidak memisahkan keduanya. Yang memisahkan adalah kecepatan:
  // 2,5 Gbps adalah laju hilir GPON, dan port ONU tidak melaporkan kecepatan
  // sama sekali. Aturan ini yang menyelamatkan 14 port yang oleh operator
  // dinamai menurut daerah atau master splitter yang mereka suapi
  // ("MsPuraPuseh", "YehKali") — tanpa itu semuanya jatuh ke LAIN.
  if (t === "other" && laju25G(ifSpeedBps)) return "PON";
  if (t === "l2vlan" || t === "propvirtual") return "VLAN";
  if (t === "ppp") return "PPP";
  if (t.includes("ethernet")) return "ETHERNET";
  return "LAIN";
}

/**
 * Port tersimpan mana yang sudah tidak dilaporkan LibreNMS lagi?
 *
 * Tabel port adalah SALINAN keadaan LibreNMS, bukan riwayat. ONU yang dicabut
 * harus ikut hilang, kalau tidak ia menumpuk selamanya sebagai baris yang
 * terlihat nyata di layar tetapi menggambarkan perangkat yang sudah tidak ada.
 *
 * Yang dijaga fungsi ini adalah kebalikannya: **daftar laporan yang kosong
 * tidak menghapus apa pun.** LibreNMS yang sedang tersendat mengembalikan nol
 * port, dan tanpa aturan ini satu panggilan yang meleset akan menghapus
 * seluruh port sebuah perangkat sekaligus. Kehilangan diam-diam seperti itu
 * jauh lebih mahal daripada satu baris basi yang tertinggal sebentar.
 */
export function portsToPrune(dilaporkan: number[], tersimpan: number[]): number[] {
  if (dilaporkan.length === 0) return [];
  const ada = new Set(dilaporkan);
  return tersimpan.filter((id) => !ada.has(id));
}

/** Kecepatan berada di sekitar laju hilir GPON (2,488 Gbps)? */
function laju25G(bps: bigint | number | null | undefined): boolean {
  if (bps === null || bps === undefined) return false;
  const n = Number(bps);
  return n >= 2_400_000_000 && n <= 2_600_000_000;
}

/**
 * `ifSpeed` (bit per detik) menjadi satuan yang dibaca orang.
 *
 * Nol dan negatif dikembalikan sebagai null, bukan "0 Kbps": LibreNMS memakai
 * nol untuk "perangkat tidak melaporkan kecepatan", dan itu bukan hal yang
 * sama dengan port yang benar-benar berkecepatan nol.
 */
export function speedText(bps: bigint | number | null | undefined): string | null {
  if (bps === null || bps === undefined) return null;
  const n = Number(bps);
  if (!Number.isFinite(n) || n <= 0) return null;
  const bulatkan = (nilai: number) => String(+nilai.toFixed(1));
  if (n >= 1_000_000_000) return `${bulatkan(n / 1_000_000_000)} Gbps`;
  if (n >= 1_000_000) return `${bulatkan(n / 1_000_000)} Mbps`;
  if (n >= 1_000) return `${bulatkan(n / 1_000)} Kbps`;
  return `${n} bps`;
}
