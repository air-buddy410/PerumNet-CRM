// ── Membangun lapisan OLT dan port PON (Fase 81) ────────────────
//
// Lapisan MURNI. Tidak menyentuh basis data.
//
// Rantai POP → MS → ODP → pelanggan yang diminta sejak awal punya satu mata
// rantai yang belum pernah ada isinya: `OltDevice` dan `PonPort` keduanya nol
// baris, dan tidak satu pun ODP menunjuk port PON. Peta jaringan karena itu
// hanya bisa menggambar ODP dan pelanggan.
//
// Dua sumber dipakai, dan keduanya sudah ada:
//
//  1. Daftar OLT sistem lama — nama, vendor, tipe, IP, port telnet & SNMP.
//     Community SNMP-nya TIDAK diambil: `OltDevice.credentialRef` memang
//     menyimpan nama env var, bukan rahasianya, dan itu aturan yang berlaku
//     di seluruh aplikasi ini.
//
//  2. Port PON yang sudah tersinkron dari LibreNMS — 80 baris `NetworkPort`
//     bergolongan PON.

export interface OltMasuk {
  /** Nama di sistem lama, mis. `HSGQ-102-SerayaTengah`. */
  nama: string;
  vendor: string;
  model: string;
  managementIp: string;
  telnetPort?: string;
  snmpPort?: string;
}

export interface OltBersih {
  nama: string;
  vendor: string;
  model: string | null;
  managementIp: string;
  telnetPort: number | null;
  snmpPort: number | null;
  /** Kode site yang tersirat dari namanya, mis. `102` → Seraya. */
  kodeVlan: string | null;
  /** Nama lokasi yang tersirat, mis. `SerayaTengah`. */
  lokasi: string | null;
}

/** Vendor yang dikenali; sisanya dibiarkan apa adanya, huruf besar. */
const VENDOR = new Set(["ZTE", "HUAWEI", "CDATA", "HSGQ", "FIBERHOME", "VSOL", "HIOSO"]);

function angka(v: string | undefined): number | null {
  const n = Number((v ?? "").trim());
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : null;
}

/**
 * Membaca nama OLT sistem lama.
 *
 * Bentuknya `VENDOR-MODEL-VLAN-LOKASI`, mis. `ZTE-C600-104-Abang` atau
 * `HSGQ-102-SerayaTengah`. Angka di tengah adalah VLAN wilayah — 100 Kecicang,
 * 102 Seraya, 104 Abang — dan itu penanda site yang paling bisa dipercaya di
 * seluruh sistem mereka, sebab ia ikut tertulis di nama paket, nomor
 * pelanggan, dan deskripsi site.
 */
export function bacaNamaOlt(nama: string): { vlan: string | null; lokasi: string | null } {
  // Bagian model OPSIONAL: `ZTE-C600-104-Abang` memuatnya, `HSGQ-102-Kecicang`
  // tidak. Keduanya nama sungguhan dari sistem yang sama.
  const m = /^[A-Za-z]+(?:-[A-Za-z][A-Za-z0-9-]*)?-(\d{3})-(.+)$/.exec(nama.trim());
  if (!m) return { vlan: null, lokasi: null };
  return { vlan: m[1], lokasi: m[2].trim() };
}

export function bersihkanOlt(m: OltMasuk): { bersih: OltBersih; masalah: string[] } {
  const masalah: string[] = [];
  const vendor = (m.vendor ?? "").trim().toUpperCase();
  if (vendor && !VENDOR.has(vendor)) {
    masalah.push(`Vendor "${m.vendor}" tidak dikenal — disimpan apa adanya.`);
  }
  const ip = (m.managementIp ?? "").trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) masalah.push(`IP "${m.managementIp}" tidak berbentuk alamat.`);

  const { vlan, lokasi } = bacaNamaOlt(m.nama);
  return {
    bersih: {
      nama: m.nama.trim(),
      vendor: vendor || "LAINNYA",
      model: (m.model ?? "").trim() || null,
      managementIp: ip,
      telnetPort: angka(m.telnetPort),
      snmpPort: angka(m.snmpPort),
      kodeVlan: vlan,
      lokasi,
    },
    masalah,
  };
}

// ── Port PON ────────────────────────────────────────────────────

export interface PortMasuk {
  /** Nama port dari LibreNMS. */
  ifName: string;
  /** Urutan port di dalam perangkatnya — `librenmsPortId` menaik. */
  urutan: number;
}

export interface PonBersih {
  slot: number;
  port: number;
  label: string;
  /** Bagaimana slot & port ditentukan; ikut dilaporkan supaya bisa dinilai. */
  asal: "NAMA" | "URUTAN";
}

/**
 * Slot dan nomor port dari nama port.
 *
 * OLT ZTE menamainya `gpon_1/2/13` — rak, slot, port — jadi keduanya terbaca
 * persis. OLT HSGQ tidak: operator mengganti namanya menjadi nama daerah atau
 * master splitter yang disuapinya (`MsPuraPuseh`, `YehKali`), sehingga tidak
 * ada angka sama sekali.
 *
 * Untuk yang begitu, nomor port diambil dari URUTAN port di dalam
 * perangkatnya. Itu bukan tebakan buta: pada `192.168.100.12` dua portnya
 * bernama `PON07` dan `PON08`, dan keduanya memang menempati urutan ketujuh
 * dan kedelapan. Dua port yang menyebut nomornya sendiri membenarkan
 * urutannya.
 */
export function bacaPon(p: PortMasuk): PonBersih {
  const n = p.ifName.trim();
  // Dua penamaan ZTE dipakai di jaringan yang sama: C300 menulis `gpon_1/2/13`,
  // C600 menyisipkan `olt-` menjadi `gpon_olt-1/16/1`. Sisipan itu semula tidak
  // tertangkap, sehingga seluruh port C600 jatuh ke URUTAN dan dua slot fisik
  // (16 dan 17) ditumpuk menjadi slot 1 bernomor 1–32. Labelnya menyimpan
  // kebenarannya, tetapi slot dan portnya salah — dan PIU di berkas ODP
  // menyebut slot yang sebenarnya, jadi tanpa sisipan ini ODP tidak bisa
  // dijodohkan ke port PON-nya sama sekali.
  const zte = /^gpon[_-]?(?:olt[_-])?(\d+)\/(\d+)\/(\d+)$/i.exec(n);
  if (zte) return { slot: Number(zte[2]), port: Number(zte[3]), label: n, asal: "NAMA" };

  const bernomor = /^pon[_\s-]?(\d+)$/i.exec(n);
  if (bernomor) return { slot: 1, port: Number(bernomor[1]), label: n, asal: "NAMA" };

  return { slot: 1, port: p.urutan, label: n, asal: "URUTAN" };
}

/**
 * Menyusun port PON satu perangkat, menolak yang bertabrakan.
 *
 * Dua port yang jatuh pada slot dan nomor yang sama tidak boleh disimpan
 * keduanya — kolomnya unik, dan yang kedua akan gagal dengan galat mentah.
 * Yang bertabrakan dilaporkan, bukan diberi nomor karangan supaya muat.
 */
export function susunPon(ports: PortMasuk[]): { pon: PonBersih[]; masalah: string[] } {
  const pon: PonBersih[] = [];
  const masalah: string[] = [];
  const dipakai = new Map<string, string>();

  for (const p of [...ports].sort((a, b) => a.urutan - b.urutan)) {
    const b = bacaPon(p);
    const k = `${b.slot}/${b.port}`;
    const lama = dipakai.get(k);
    if (lama) {
      masalah.push(`Port ${k} diperebutkan "${lama}" dan "${b.label}" — yang kedua dilewati.`);
      continue;
    }
    dipakai.set(k, b.label);
    pon.push(b);
  }
  return { pon, masalah };
}
