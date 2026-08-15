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
