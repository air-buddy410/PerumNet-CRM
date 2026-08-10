import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { OLT_VENDORS, ODP_PORT_STATUSES } from "@/lib/constants";
import type { CurrentUser } from "@/lib/rbac";

// ── FTTH Port Management Engine (DESIGN-PHASE-8 §7, gap G10/G21) ─
// Aturan yang ditegakkan DI SINI, bukan di UI:
//  - portUsed adalah TURUNAN: selalu direkap dari OdpPort berstatus USED,
//    tidak pernah diedit langsung. (Perbaikan atas sistem lama yang
//    menyimpan port_used sebagai angka lepas.)
//  - Setiap port punya nomor; alokasi menautkan port ↔ langganan sehingga
//    penelusuran gangguan per port menjadi mungkin.
//  - Satu langganan hanya menempati satu port (dijaga unique di skema +
//    dicek engine agar pesannya jelas).
//  - Kapasitas tidak boleh diciutkan di bawah port yang sedang terpakai.
//  - Kredensial OLT TIDAK plaintext — credentialRef = NAMA env var
//    (rule 31, sama seperti registry integrasi Fase 7).
//  - ODP kaskade: parent tidak boleh membentuk siklus.

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

const ENV_VAR_RE = /^[A-Z][A-Z0-9_]*$/;

function isValidCode(list: readonly (readonly [string, string])[], code: string): boolean {
  return list.some(([c]) => c === code);
}

// ── OLT (spesialisasi NetworkDevice) ────────────────────────────

export async function saveOltDevice(
  user: CurrentUser,
  data: {
    id?: string;
    networkDeviceId: string;
    vendor: string;
    model?: string;
    managementIp: string;
    telnetPort?: number | null;
    snmpPort?: number | null;
    credentialRef?: string | null;
    notes?: string;
  }
): Promise<Result> {
  if (!isValidCode(OLT_VENDORS, data.vendor)) {
    return { ok: false, error: "Vendor OLT tidak dikenal." };
  }
  const device = await db.networkDevice.findUnique({ where: { id: data.networkDeviceId } });
  if (!device) return { ok: false, error: "Perangkat jaringan tidak ditemukan." };
  if (device.deviceType !== "OLT") {
    return { ok: false, error: `Perangkat ${device.hostname} bukan bertipe OLT.` };
  }
  if (!data.managementIp?.trim()) return { ok: false, error: "Management IP wajib diisi." };
  for (const [label, port] of [["Telnet", data.telnetPort], ["SNMP", data.snmpPort]] as const) {
    if (port !== undefined && port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      return { ok: false, error: `Port ${label} harus 1–65535.` };
    }
  }
  // Rule 31: kolom ini hanya menampung NAMA env var, bukan password.
  const credentialRef = data.credentialRef?.trim() || null;
  if (credentialRef && !ENV_VAR_RE.test(credentialRef)) {
    return {
      ok: false,
      error:
        "Credential ref harus berupa NAMA environment variable (mis. OLT_ZTE_PESAGI_PASSWORD) — jangan tempel password di sini.",
    };
  }
  const dup = await db.oltDevice.findFirst({
    where: { networkDeviceId: data.networkDeviceId, ...(data.id ? { id: { not: data.id } } : {}) },
  });
  if (dup) return { ok: false, error: `Perangkat ${device.hostname} sudah terdaftar sebagai OLT.` };

  const payload = {
    networkDeviceId: data.networkDeviceId,
    vendor: data.vendor,
    model: data.model || null,
    managementIp: data.managementIp.trim(),
    telnetPort: data.telnetPort ?? null,
    snmpPort: data.snmpPort ?? null,
    credentialRef,
    notes: data.notes || null,
  };
  const olt = data.id
    ? await db.oltDevice.update({ where: { id: data.id }, data: payload })
    : await db.oltDevice.create({ data: payload });
  await logAudit({
    userId: user.id,
    action: data.id ? "OLT_UPDATE" : "OLT_CREATE",
    module: "noc",
    entityType: "OltDevice",
    entityId: olt.id,
    description: `${data.id ? "Mengubah" : "Mendaftarkan"} OLT ${device.hostname} (${data.vendor})`,
  });
  return { ok: true, id: olt.id };
}

// Port PON pada OLT — padanan "Dist Group" sistem lama (mis. 1/2/1).
export async function savePonPort(
  user: CurrentUser,
  data: { oltId: string; slot: number; port: number; label?: string }
): Promise<Result> {
  if (!Number.isInteger(data.slot) || data.slot < 0 || data.slot > 64) {
    return { ok: false, error: "Slot harus 0–64." };
  }
  if (!Number.isInteger(data.port) || data.port < 0 || data.port > 128) {
    return { ok: false, error: "Port harus 0–128." };
  }
  const olt = await db.oltDevice.findUnique({
    where: { id: data.oltId },
    include: { networkDevice: true },
  });
  if (!olt) return { ok: false, error: "OLT tidak ditemukan." };
  const dup = await db.ponPort.findFirst({
    where: { oltId: data.oltId, slot: data.slot, port: data.port },
  });
  if (dup) return { ok: false, error: `PON ${data.slot}/${data.port} sudah terdaftar di OLT ini.` };

  const label = data.label?.trim() || `${olt.networkDevice.hostname} 1/${data.slot}/${data.port}`;
  const pon = await db.ponPort.create({
    data: { oltId: data.oltId, slot: data.slot, port: data.port, label },
  });
  await logAudit({
    userId: user.id,
    action: "PON_PORT_CREATE",
    module: "noc",
    entityType: "PonPort",
    entityId: pon.id,
    description: `Menambah PON ${label}`,
  });
  return { ok: true, id: pon.id };
}

// ── ODP + port (inti perbaikan §7) ──────────────────────────────

// Rekap portUsed dari kenyataan — dipanggil setiap kali port berubah.
async function recalcPortUsed(odpId: string): Promise<number> {
  const used = await db.odpPort.count({ where: { odpId, status: "USED" } });
  await db.odp.update({ where: { id: odpId }, data: { portUsed: used } });
  return used;
}

// Sinkronkan baris OdpPort agar sama dengan kapasitas.
async function syncPorts(odpId: string, capacity: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const ports = await db.odpPort.findMany({ where: { odpId }, orderBy: { portNumber: "asc" } });
  if (capacity < ports.length) {
    // Menciutkan: port yang dibuang tidak boleh sedang dipakai/rusak.
    const removable = ports.filter((p) => p.portNumber > capacity);
    const occupied = removable.filter((p) => p.status !== "FREE");
    if (occupied.length > 0) {
      return {
        ok: false,
        error: `Kapasitas tidak bisa diciutkan: port ${occupied.map((p) => p.portNumber).join(", ")} masih terpakai/tercatat.`,
      };
    }
    await db.odpPort.deleteMany({ where: { odpId, portNumber: { gt: capacity } } });
  } else if (capacity > ports.length) {
    const existing = new Set(ports.map((p) => p.portNumber));
    const toCreate = [];
    for (let n = 1; n <= capacity; n++) {
      if (!existing.has(n)) toCreate.push({ odpId, portNumber: n });
    }
    if (toCreate.length) await db.odpPort.createMany({ data: toCreate });
  }
  return { ok: true };
}

export async function saveOdp(
  user: CurrentUser,
  data: {
    id?: string;
    code: string;
    siteId?: string | null;
    ponPortId?: string | null;
    parentId?: string | null;
    portCapacity: number;
    opticPowerDbm?: number | null;
    latitude?: number | null;
    longitude?: number | null;
    status?: string;
    notes?: string;
  }
): Promise<Result> {
  const code = data.code.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,30}$/.test(code)) {
    return { ok: false, error: "Kode ODP: huruf/angka/strip, 2–31 karakter." };
  }
  if (!Number.isInteger(data.portCapacity) || data.portCapacity < 1 || data.portCapacity > 256) {
    return { ok: false, error: "Kapasitas port harus 1–256." };
  }
  if (
    data.opticPowerDbm !== undefined && data.opticPowerDbm !== null &&
    (!Number.isFinite(data.opticPowerDbm) || data.opticPowerDbm < -60 || data.opticPowerDbm > 10)
  ) {
    return { ok: false, error: "Optic power harus antara -60 dan +10 dBm." };
  }
  const dup = await db.odp.findFirst({
    where: { code, ...(data.id ? { id: { not: data.id } } : {}) },
  });
  if (dup) return { ok: false, error: `Kode ODP ${code} sudah dipakai.` };

  if (data.parentId) {
    if (data.parentId === data.id) return { ok: false, error: "ODP tidak bisa menjadi induk dirinya sendiri." };
    const parent = await db.odp.findUnique({ where: { id: data.parentId } });
    if (!parent) return { ok: false, error: "ODP induk tidak ditemukan." };
    // Cegah siklus pada kaskade.
    if (data.id) {
      let cursor: string | null = parent.parentId;
      let guard = 0;
      while (cursor && guard++ < 50) {
        if (cursor === data.id) {
          return { ok: false, error: "Kaskade ODP membentuk siklus — periksa induknya." };
        }
        const node: { parentId: string | null } | null = await db.odp.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        });
        cursor = node?.parentId ?? null;
      }
    }
  }
  if (data.ponPortId) {
    const pon = await db.ponPort.findUnique({ where: { id: data.ponPortId } });
    if (!pon) return { ok: false, error: "PON port tidak ditemukan." };
  }

  const payload = {
    code,
    siteId: data.siteId || null,
    ponPortId: data.ponPortId || null,
    parentId: data.parentId || null,
    portCapacity: data.portCapacity,
    opticPowerDbm: data.opticPowerDbm ?? null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    status: data.status ?? "ACTIVE",
    notes: data.notes || null,
  };
  const odp = data.id
    ? await db.odp.update({ where: { id: data.id }, data: payload })
    : await db.odp.create({ data: payload });

  const synced = await syncPorts(odp.id, data.portCapacity);
  if (!synced.ok) {
    // Kembalikan kapasitas ke jumlah port nyata agar data tetap konsisten.
    const actual = await db.odpPort.count({ where: { odpId: odp.id } });
    await db.odp.update({ where: { id: odp.id }, data: { portCapacity: actual } });
    return synced;
  }
  await recalcPortUsed(odp.id);
  await logAudit({
    userId: user.id,
    action: data.id ? "ODP_UPDATE" : "ODP_CREATE",
    module: "noc",
    entityType: "Odp",
    entityId: odp.id,
    description: `${data.id ? "Mengubah" : "Membuat"} ODP ${code} (kapasitas ${data.portCapacity} port)`,
  });
  return { ok: true, id: odp.id };
}

// Alokasi port ke langganan — inti penelusuran per-port.
export async function assignPort(
  user: CurrentUser,
  data: { odpPortId: string; subscriptionId: string; note?: string }
): Promise<Result> {
  const port = await db.odpPort.findUnique({
    where: { id: data.odpPortId },
    include: { odp: true },
  });
  if (!port) return { ok: false, error: "Port tidak ditemukan." };
  if (port.status === "DAMAGED") return { ok: false, error: "Port berstatus rusak — perbaiki dulu." };
  if (port.status === "USED") {
    return { ok: false, error: `Port ${port.odp.code}/${port.portNumber} sudah terpakai.` };
  }
  const sub = await db.subscription.findUnique({
    where: { id: data.subscriptionId },
    include: { customer: true, odpPort: { include: { odp: true } } },
  });
  if (!sub) return { ok: false, error: "Langganan tidak ditemukan." };
  if (sub.status === "TERMINATED") return { ok: false, error: "Langganan sudah terminasi." };
  if (sub.odpPort) {
    return {
      ok: false,
      error: `Langganan ini sudah menempati port ${sub.odpPort.odp.code}/${sub.odpPort.portNumber} — lepas dulu.`,
    };
  }
  await db.odpPort.update({
    where: { id: data.odpPortId },
    data: { subscriptionId: data.subscriptionId, status: "USED", note: data.note || null },
  });
  const used = await recalcPortUsed(port.odpId);
  await logAudit({
    userId: user.id,
    action: "ODP_PORT_ASSIGN",
    module: "noc",
    entityType: "OdpPort",
    entityId: port.id,
    description: `Port ${port.odp.code}/${port.portNumber} → ${sub.serviceNumber} (${sub.customer.name}); terpakai ${used}/${port.odp.portCapacity}`,
  });
  return { ok: true, id: port.id };
}

export async function releasePort(user: CurrentUser, odpPortId: string, note?: string): Promise<Result> {
  const port = await db.odpPort.findUnique({
    where: { id: odpPortId },
    include: { odp: true, subscription: true },
  });
  if (!port) return { ok: false, error: "Port tidak ditemukan." };
  if (!port.subscriptionId) return { ok: false, error: "Port ini tidak sedang dipakai langganan." };
  await db.odpPort.update({
    where: { id: odpPortId },
    data: { subscriptionId: null, status: "FREE", note: note || null },
  });
  const used = await recalcPortUsed(port.odpId);
  await logAudit({
    userId: user.id,
    action: "ODP_PORT_RELEASE",
    module: "noc",
    entityType: "OdpPort",
    entityId: port.id,
    description: `Port ${port.odp.code}/${port.portNumber} dilepas dari ${port.subscription?.serviceNumber ?? "-"}; terpakai ${used}/${port.odp.portCapacity}`,
  });
  return { ok: true, id: port.id };
}

// Tandai port rusak / dicadangkan / kembali kosong (tanpa langganan).
export async function setPortStatus(
  user: CurrentUser,
  odpPortId: string,
  status: string,
  note?: string
): Promise<Result> {
  if (!ODP_PORT_STATUSES.includes(status as never)) {
    return { ok: false, error: "Status port tidak dikenal." };
  }
  if (status === "USED") {
    return { ok: false, error: "Status Terpakai hanya lewat alokasi ke langganan." };
  }
  const port = await db.odpPort.findUnique({ where: { id: odpPortId }, include: { odp: true } });
  if (!port) return { ok: false, error: "Port tidak ditemukan." };
  if (port.subscriptionId) {
    return { ok: false, error: "Port masih ditempati langganan — lepas dulu." };
  }
  if (status === "RESERVED" && !note?.trim()) {
    return { ok: false, error: "Port dicadangkan wajib memiliki keterangan." };
  }
  await db.odpPort.update({ where: { id: odpPortId }, data: { status, note: note || null } });
  await recalcPortUsed(port.odpId);
  await logAudit({
    userId: user.id,
    action: "ODP_PORT_STATUS",
    module: "noc",
    entityType: "OdpPort",
    entityId: port.id,
    description: `Port ${port.odp.code}/${port.portNumber} → ${status}${note ? ` (${note})` : ""}`,
  });
  return { ok: true, id: port.id };
}

// Rekonsiliasi seluruh ODP — memastikan portUsed konsisten (§7:
// "portUsed menjadi turunan yang selalu konsisten").
export async function reconcilePortUsage(
  user: CurrentUser | null
): Promise<Result<{ checked: number; fixed: number }>> {
  const odps = await db.odp.findMany({ select: { id: true, code: true, portUsed: true } });
  let fixed = 0;
  for (const odp of odps) {
    const actual = await db.odpPort.count({ where: { odpId: odp.id, status: "USED" } });
    if (actual !== odp.portUsed) {
      await db.odp.update({ where: { id: odp.id }, data: { portUsed: actual } });
      fixed++;
    }
  }
  await logAudit({
    userId: user?.id ?? null,
    action: "ODP_RECONCILE",
    module: "noc",
    entityType: "Odp",
    description: `Rekonsiliasi kapasitas ODP: ${odps.length} diperiksa, ${fixed} dikoreksi`,
  });
  return { ok: true, id: "reconcile", data: { checked: odps.length, fixed } };
}

// Penelusuran: dari langganan → port → ODP → rantai kaskade → PON → OLT.
export async function tracePath(subscriptionId: string): Promise<{
  serviceNumber: string;
  customerName: string;
  port: { number: number; note: string | null } | null;
  odpChain: { code: string; portUsed: number; portCapacity: number; opticPowerDbm: number | null }[];
  pon: string | null;
  olt: string | null;
} | null> {
  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      customer: true,
      odpPort: { include: { odp: { include: { ponPort: { include: { olt: { include: { networkDevice: true } } } } } } } },
    },
  });
  if (!sub) return null;
  const chain: { code: string; portUsed: number; portCapacity: number; opticPowerDbm: number | null }[] = [];
  let pon: string | null = null;
  let olt: string | null = null;
  if (sub.odpPort) {
    let cursor: string | null = sub.odpPort.odpId;
    let guard = 0;
    while (cursor && guard++ < 20) {
      const node: {
        code: string;
        portUsed: number;
        portCapacity: number;
        opticPowerDbm: number | null;
        parentId: string | null;
        ponPort: { label: string; olt: { networkDevice: { hostname: string } } } | null;
      } | null = await db.odp.findUnique({
        where: { id: cursor },
        include: { ponPort: { include: { olt: { include: { networkDevice: true } } } } },
      });
      if (!node) break;
      chain.push({
        code: node.code,
        portUsed: node.portUsed,
        portCapacity: node.portCapacity,
        opticPowerDbm: node.opticPowerDbm,
      });
      if (node.ponPort) {
        pon = node.ponPort.label;
        olt = node.ponPort.olt.networkDevice.hostname;
      }
      cursor = node.parentId;
    }
  }
  return {
    serviceNumber: sub.serviceNumber,
    customerName: sub.customer.name,
    port: sub.odpPort ? { number: sub.odpPort.portNumber, note: sub.odpPort.note } : null,
    odpChain: chain,
    pon,
    olt,
  };
}

// ── Tools teknis (G21) — murni utilitas, tanpa dampak data ──────

export interface SubnetInfo {
  network: string;
  broadcast: string;
  netmask: string;
  wildcard: string;
  firstHost: string;
  lastHost: string;
  totalHosts: number;
  usableHosts: number;
  prefix: number;
}

function toInt(ip: string): number | null {
  const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function toIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

// IP calculator (padanan tools sistem lama, tapi IPAM kita lebih kuat).
export function calculateSubnet(cidr: string): SubnetInfo | null {
  const m = cidr.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (!m) return null;
  const base = toInt(m[1]);
  const prefix = Number(m[2]);
  if (base === null || prefix < 0 || prefix > 32) return null;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const network = (base & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = 2 ** (32 - prefix);
  const usable = prefix >= 31 ? total : Math.max(0, total - 2);
  return {
    network: toIp(network),
    broadcast: toIp(broadcast),
    netmask: toIp(mask),
    wildcard: toIp(~mask >>> 0),
    firstHost: toIp(prefix >= 31 ? network : network + 1),
    lastHost: toIp(prefix >= 31 ? broadcast : broadcast - 1),
    totalHosts: total,
    usableHosts: usable,
    prefix,
  };
}

// MikroTik burst calculator: rekomendasi burst 2× limit, threshold 75%.
export interface BurstInfo {
  limitAt: number;
  burstLimit: number;
  burstThreshold: number;
  burstTime: number;
  queueString: string;
}

export function calculateBurst(limitMbps: number, burstTimeSec = 8): BurstInfo | null {
  if (!Number.isFinite(limitMbps) || limitMbps <= 0 || limitMbps > 10000) return null;
  if (!Number.isInteger(burstTimeSec) || burstTimeSec < 1 || burstTimeSec > 60) return null;
  const burstLimit = Math.round(limitMbps * 2);
  const burstThreshold = Math.round(limitMbps * 0.75);
  return {
    limitAt: limitMbps,
    burstLimit,
    burstThreshold,
    burstTime: burstTimeSec,
    queueString: `${limitMbps}M/${limitMbps}M ${burstLimit}M/${burstLimit}M ${burstThreshold}M/${burstThreshold}M ${burstTimeSec}/${burstTimeSec}`,
  };
}
