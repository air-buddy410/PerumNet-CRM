"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { koordinatDariForm } from "@/lib/noc-site";
import { simpanKredensial, hapusKredensial, pakaiKredensial, tandaiTerbukti } from "@/lib/kredensial-perangkat-service";
import { jalankanPerintahMultiPort, OltTelnetError } from "@/lib/olt-telnet";
import {
  PERMISSIONS,
  SITE_TYPES,
  NET_DEVICE_TYPES,
  LINK_MEDIA,
  CRITICALITY,
} from "@/lib/constants";

// CRUD master network inventory (site, perangkat, link) — PRD §28.

const siteSchema = z.object({
  id: z.string().optional(),
  siteCode: z.string().min(2).regex(/^[A-Za-z0-9_-]+$/, "Kode hanya huruf/angka/strip"),
  name: z.string().min(2, "Nama minimal 2 karakter"),
  type: z.enum(SITE_TYPES.map(([v]) => v) as [string, ...string[]]),
  address: z.string().optional(),
  areaId: z.string().optional(),
  picId: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "PLANNED"]),
  powerSource: z.string().optional(),
  backupPower: z.string().optional(),
  upstreamProvider: z.string().optional(),
  notes: z.string().optional(),
});

export async function saveSiteAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.NET_INVENTORY_MANAGE);
  const parsed = siteSchema.safeParse({
    ...Object.fromEntries(formData),
    id: formData.get("id") || undefined,
  });
  if (!parsed.success) {
    redirect("/noc/sites?error=" + encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid"));
  }
  const d = parsed.data;
  const siteCode = d.siteCode.toUpperCase();
  const dup = await db.networkSite.findFirst({
    where: { siteCode, ...(d.id ? { id: { not: d.id } } : {}) },
  });
  if (dup) redirect("/noc/sites?error=" + encodeURIComponent(`Kode "${siteCode}" sudah dipakai.`));

  // ── Koordinat (Fase 65) ───────────────────────────────────────
  //
  // Kolomnya sudah ada di skema sejak lama dan dibaca peta, tetapi tidak
  // pernah ada jalur yang MENULISNYA: skema di atas tidak memuatnya, formnya
  // tidak punya inputnya, dan payload di bawah melewatinya. Akibatnya POP dan
  // MINI_POP tidak mungkin muncul di peta — `loadNetworkMap()` menyaring
  // `latitude: { not: null }`, dan tidak ada satu pun yang bisa terisi.
  //
  // Field yang TIDAK DIKIRIM dibiarkan apa adanya; yang dikirim KOSONG berarti
  // sengaja dihapus. Perbedaan itu penting persis seperti pada data pegawai:
  // form lama yang belum punya inputnya tidak boleh menghapus koordinat yang
  // sudah susah payah diambil di lapangan.
  const koordinat = koordinatDariForm(formData);
  if (!koordinat.ok) {
    redirect("/noc/sites?error=" + encodeURIComponent(koordinat.error));
  }

  const data = {
    ...koordinat.data,
    siteCode,
    name: d.name,
    type: d.type,
    address: d.address || null,
    areaId: d.areaId || null,
    picId: d.picId || null,
    status: d.status,
    powerSource: d.powerSource || null,
    backupPower: d.backupPower || null,
    upstreamProvider: d.upstreamProvider || null,
    notes: d.notes || null,
  };
  const site = d.id
    ? await db.networkSite.update({ where: { id: d.id }, data })
    : await db.networkSite.create({ data });
  await logAudit({
    userId: user.id,
    action: d.id ? "SITE_UPDATE" : "SITE_CREATE",
    module: "noc",
    entityType: "NetworkSite",
    entityId: site.id,
    description: `${d.id ? "Mengubah" : "Membuat"} site ${siteCode} — ${d.name}`,
  });
  revalidatePath("/noc/sites");
  redirect("/noc/sites?ok=" + encodeURIComponent("Site tersimpan."));
}

const deviceSchema = z.object({
  id: z.string().optional(),
  hostname: z.string().min(2, "Hostname minimal 2 karakter"),
  deviceType: z.enum(NET_DEVICE_TYPES.map(([v]) => v) as [string, ...string[]]),
  vendor: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  macAddress: z.string().optional(),
  managementIp: z.string().optional(),
  siteId: z.string().min(1, "Pilih site"),
  rack: z.string().optional(),
  uPosition: z.string().optional(),
  firmware: z.string().optional(),
  criticality: z.enum(CRITICALITY),
  status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE", "DOWN"]),
  ownerId: z.string().optional(),
  notes: z.string().optional(),
});

export async function saveNetDeviceAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.NET_INVENTORY_MANAGE);
  const parsed = deviceSchema.safeParse({
    ...Object.fromEntries(formData),
    id: formData.get("id") || undefined,
  });
  if (!parsed.success) {
    redirect("/noc/devices?error=" + encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid"));
  }
  const d = parsed.data;
  const dup = await db.networkDevice.findFirst({
    where: { hostname: d.hostname, ...(d.id ? { id: { not: d.id } } : {}) },
  });
  if (dup) redirect("/noc/devices?error=" + encodeURIComponent(`Hostname "${d.hostname}" sudah dipakai.`));

  const data = {
    hostname: d.hostname,
    deviceType: d.deviceType,
    vendor: d.vendor || null,
    model: d.model || null,
    serialNumber: d.serialNumber || null,
    macAddress: d.macAddress || null,
    managementIp: d.managementIp || null,
    siteId: d.siteId,
    rack: d.rack || null,
    uPosition: d.uPosition || null,
    firmware: d.firmware || null,
    criticality: d.criticality,
    status: d.status,
    ownerId: d.ownerId || null,
    notes: d.notes || null,
  };
  const device = d.id
    ? await db.networkDevice.update({ where: { id: d.id }, data })
    : await db.networkDevice.create({ data });
  await logAudit({
    userId: user.id,
    action: d.id ? "NETDEV_UPDATE" : "NETDEV_CREATE",
    module: "noc",
    entityType: "NetworkDevice",
    entityId: device.id,
    description: `${d.id ? "Mengubah" : "Membuat"} perangkat jaringan ${d.hostname}`,
  });
  revalidatePath("/noc/devices");
  redirect("/noc/devices?ok=" + encodeURIComponent("Perangkat tersimpan."));
}

const linkSchema = z.object({
  id: z.string().optional(),
  linkCode: z.string().min(2).regex(/^[A-Za-z0-9_-]+$/, "Kode hanya huruf/angka/strip"),
  name: z.string().optional(),
  siteAId: z.string().min(1, "Pilih site asal"),
  siteBId: z.string().min(1, "Pilih site tujuan"),
  media: z.enum(LINK_MEDIA),
  capacity: z.string().optional(),
  provider: z.string().optional(),
  circuitId: z.string().optional(),
  isPrimary: z.string().optional(),
  status: z.enum(["ACTIVE", "DEGRADED", "DOWN", "INACTIVE"]),
  notes: z.string().optional(),
});

export async function saveLinkAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.NET_INVENTORY_MANAGE);
  const parsed = linkSchema.safeParse({
    ...Object.fromEntries(formData),
    id: formData.get("id") || undefined,
  });
  if (!parsed.success) {
    redirect("/noc/links?error=" + encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid"));
  }
  const d = parsed.data;
  if (d.siteAId === d.siteBId) {
    redirect("/noc/links?error=" + encodeURIComponent("Site asal dan tujuan tidak boleh sama."));
  }
  const linkCode = d.linkCode.toUpperCase();
  const dup = await db.networkLink.findFirst({
    where: { linkCode, ...(d.id ? { id: { not: d.id } } : {}) },
  });
  if (dup) redirect("/noc/links?error=" + encodeURIComponent(`Kode "${linkCode}" sudah dipakai.`));

  const data = {
    linkCode,
    name: d.name || null,
    siteAId: d.siteAId,
    siteBId: d.siteBId,
    media: d.media,
    capacity: d.capacity || null,
    provider: d.provider || null,
    circuitId: d.circuitId || null,
    isPrimary: d.isPrimary === "on",
    status: d.status,
    notes: d.notes || null,
  };
  const link = d.id
    ? await db.networkLink.update({ where: { id: d.id }, data })
    : await db.networkLink.create({ data });
  await logAudit({
    userId: user.id,
    action: d.id ? "LINK_UPDATE" : "LINK_CREATE",
    module: "noc",
    entityType: "NetworkLink",
    entityId: link.id,
    description: `${d.id ? "Mengubah" : "Membuat"} link ${linkCode}`,
  });
  revalidatePath("/noc/links");
  redirect("/noc/links?ok=" + encodeURIComponent("Link tersimpan."));
}

// ── Fase 91: kredensial perangkat dari layar, bukan dari berkas ──

/**
 * Kembali ke layar kredensial sambil membawa hasilnya.
 *
 * Pola `redirect` yang sama dengan aksi NOC lain: hasil disampaikan lewat
 * query, bukan nilai balik, supaya `<form action={...}>` biasa cukup dan
 * halaman tidak perlu jadi komponen klien hanya untuk menampilkan satu pesan.
 */
function kembaliKeKredensial(deviceId: string, hasil: { ok: boolean; pesan: string }): never {
  const q = new URLSearchParams(hasil.ok ? { ok: hasil.pesan } : { error: hasil.pesan });
  redirect(`/noc/devices/${deviceId}/kredensial?${q.toString()}`);
}

/**
 * Menyimpan kredensial telnet/SSH sebuah perangkat.
 *
 * Sandinya disegel sebelum menyentuh basis data. Tidak ada env var yang perlu
 * ditambah — NOC mengisinya sendiri, IT cukup memasang satu kunci utama sekali.
 */
export async function simpanKredensialPerangkatAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.NET_INVENTORY_MANAGE);
  const networkDeviceId = String(formData.get("networkDeviceId") ?? "");
  if (!networkDeviceId) redirect("/noc/devices?error=Perangkat+tidak+disebutkan.");

  const portRaw = String(formData.get("port") ?? "").trim();
  const hasil = await simpanKredensial(
    networkDeviceId,
    {
      protokol: String(formData.get("protokol") ?? "TELNET"),
      port: portRaw ? Number(portRaw) : null,
      username: String(formData.get("username") ?? ""),
      sandi: String(formData.get("sandi") ?? ""),
    },
    user.id
  );
  revalidatePath(`/noc/devices/${networkDeviceId}/kredensial`);
  kembaliKeKredensial(networkDeviceId, {
    ok: hasil.ok,
    pesan: hasil.ok ? "Kredensial tersimpan tersegel." : hasil.error,
  });
}

/** Menghapus kredensial perangkat dari brankas. */
export async function hapusKredensialPerangkatAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.NET_INVENTORY_MANAGE);
  const networkDeviceId = String(formData.get("networkDeviceId") ?? "");
  if (!networkDeviceId) redirect("/noc/devices?error=Perangkat+tidak+disebutkan.");

  await hapusKredensial(networkDeviceId, user.id);
  revalidatePath(`/noc/devices/${networkDeviceId}/kredensial`);
  kembaliKeKredensial(networkDeviceId, { ok: true, pesan: "Kredensial dihapus dari brankas." });
}

/**
 * Menguji kredensial dengan MASUK saja — tanpa menjalankan perintah apa pun.
 *
 * Sampai di prompt sudah membuktikan kredensialnya benar, dan itu menghapus
 * seluruh kelas galat "perintah tidak dikenal" dari jalur diagnosis. Sekaligus
 * menjaga dinding baca-saja: tidak ada satu perintah pun yang dikirim.
 */
export async function ujiKredensialPerangkatAction(formData: FormData): Promise<void> {
  await requirePermission(PERMISSIONS.NET_INVENTORY_MANAGE);
  const networkDeviceId = String(formData.get("networkDeviceId") ?? "");
  if (!networkDeviceId) redirect("/noc/devices?error=Perangkat+tidak+disebutkan.");

  const perangkat = await db.networkDevice.findUnique({
    where: { id: networkDeviceId },
    select: { hostname: true },
  });
  if (!perangkat) redirect("/noc/devices?error=Perangkat+tidak+ditemukan.");

  let kred;
  try {
    kred = await pakaiKredensial(networkDeviceId);
  } catch (e) {
    kembaliKeKredensial(networkDeviceId, { ok: false, pesan: (e as Error).message });
  }
  if (kred.protokol !== "TELNET") {
    kembaliKeKredensial(networkDeviceId, {
      ok: false,
      pesan: "Uji otomatis baru tersedia untuk TELNET. SSH menyusul.",
    });
  }

  let hasil: { ok: boolean; pesan: string };
  try {
    await jalankanPerintahMultiPort(
      { host: perangkat.hostname, user: kred.user, password: kred.password },
      [kred.port, 23],
      []
    );
    await tandaiTerbukti(networkDeviceId);
    hasil = { ok: true, pesan: `Masuk berhasil sebagai "${kred.user}".` };
  } catch (e) {
    hasil = { ok: false, pesan: e instanceof OltTelnetError ? e.message : String(e) };
  }
  revalidatePath(`/noc/devices/${networkDeviceId}/kredensial`);
  kembaliKeKredensial(networkDeviceId, hasil);
}
