// ── Menerapkan identitas pelanggan ke basis data (Fase 80) ──────
//
// Aturan bacanya ada di `customer-identity-import.ts` dan sudah diuji tanpa
// basis data. Di sini hanya yang butuh melihat isi tabel.
//
// SATU HAL YANG MEMBENTUK BERKAS INI: melengkapi, bukan menimpa.
//
// Nilai yang sudah ada di CRM TIDAK diganti, kecuali telepon yang berisi "-"
// — itu bukan nilai, itu ketiadaan yang menyamar. Alasannya: sejak Fase 74
// orang sudah bisa menyunting NIK dan telepon dari formulir, dan impor yang
// menimpa akan menghapus koreksi yang dikerjakan orang dengan tangan tanpa
// ada yang tahu.

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { bersihkanSemua, type IdentitasMasuk } from "@/lib/customer-identity-import";

export interface BarisIdentitas {
  serviceNumber: string;
  nama: string;
  /** Bidang yang akan terisi. Kosong berarti tidak ada yang berubah. */
  isi: string[];
  status: "SIAP" | "LEWAT" | "TOLAK";
  pesan: string;
}

export interface HasilIdentitas {
  baris: BarisIdentitas[];
  masalah: { serviceNumber: string; pesan: string }[];
  ringkas: { siap: number; lewat: number; tolak: number };
  /** Berapa pelanggan akan mendapat tiap bidang. */
  perBidang: Record<string, number>;
}

/** Telepon yang artinya "tidak ada" meski kolomnya terisi. */
const TELEPON_KOSONG = new Set(["", "-", "--", "0"]);

export async function periksaIdentitas(rows: IdentitasMasuk[]): Promise<HasilIdentitas> {
  const { bersih, masalah } = bersihkanSemua(rows);

  const subs = await db.subscription.findMany({
    select: {
      serviceNumber: true,
      customer: {
        select: {
          id: true, name: true, phone: true, email: true,
          identityNumber: true, birthDate: true, latitude: true, longitude: true,
        },
      },
    },
  });
  const perNomor = new Map(subs.map((s) => [s.serviceNumber.replace(/\s+/g, "").toUpperCase(), s.customer]));

  // NIK yang SUDAH dipakai pelanggan lain di basis data. Kolomnya unik;
  // menabraknya menghasilkan galat Prisma mentah alih-alih kalimat.
  const nikAda = new Map(
    (await db.customer.findMany({
      where: { identityNumber: { not: null } },
      select: { id: true, identityNumber: true, name: true },
    })).map((c) => [c.identityNumber!, c])
  );

  const baris: BarisIdentitas[] = [];
  const perBidang: Record<string, number> = { telepon: 0, nik: 0, "tanggal lahir": 0, email: 0, koordinat: 0 };
  const nikDipakai = new Set<string>();

  for (const b of bersih) {
    const kunci = b.serviceNumber.replace(/\s+/g, "").toUpperCase();
    const c = perNomor.get(kunci);
    if (!c) {
      baris.push({
        serviceNumber: b.serviceNumber, nama: "", isi: [], status: "TOLAK",
        pesan: `Nomor layanan ${b.serviceNumber} tidak ada di CRM.`,
      });
      continue;
    }

    const isi: string[] = [];
    // Telepon: hanya diisi bila yang tersimpan memang kosong atau "-".
    if (b.phone && TELEPON_KOSONG.has((c.phone ?? "").trim())) isi.push("telepon");
    if (b.email && !c.email) isi.push("email");
    if (b.birthDate && !c.birthDate) isi.push("tanggal lahir");
    if (b.latitude !== null && b.longitude !== null && (c.latitude === null || c.longitude === null)) {
      isi.push("koordinat");
    }
    if (b.identityNumber && !c.identityNumber) {
      const pemilik = nikAda.get(b.identityNumber);
      if (pemilik && pemilik.id !== c.id) {
        masalah.push({
          serviceNumber: b.serviceNumber,
          pesan: `NIK ${b.identityNumber} sudah dipakai ${pemilik.name} — tidak disimpan.`,
        });
      } else if (nikDipakai.has(b.identityNumber)) {
        masalah.push({
          serviceNumber: b.serviceNumber,
          pesan: `NIK ${b.identityNumber} sudah diberikan ke pelanggan lain dalam berkas yang sama.`,
        });
      } else {
        nikDipakai.add(b.identityNumber);
        isi.push("NIK");
      }
    }

    for (const f of isi) perBidang[f === "NIK" ? "nik" : f] = (perBidang[f === "NIK" ? "nik" : f] ?? 0) + 1;

    baris.push({
      serviceNumber: b.serviceNumber,
      nama: c.name,
      isi,
      status: isi.length ? "SIAP" : "LEWAT",
      pesan: isi.length ? `Akan diisi: ${isi.join(", ")}.` : "Seluruh bidangnya sudah terisi.",
    });
  }

  return {
    baris,
    masalah,
    ringkas: {
      siap: baris.filter((x) => x.status === "SIAP").length,
      lewat: baris.filter((x) => x.status === "LEWAT").length,
      tolak: baris.filter((x) => x.status === "TOLAK").length,
    },
    perBidang,
  };
}

/**
 * Menerapkan yang berstatus SIAP.
 *
 * Hanya bidang yang KOSONG yang diisi — `undefined` pada Prisma berarti jangan
 * sentuh, dan itu yang menjaga koreksi manual tetap hidup.
 */
export async function terapkanIdentitas(rows: IdentitasMasuk[], userId: string): Promise<HasilIdentitas> {
  const rencana = await periksaIdentitas(rows);
  const { bersih } = bersihkanSemua(rows);
  const siap = new Map(rencana.baris.filter((b) => b.status === "SIAP").map((b) => [b.serviceNumber, b.isi]));

  const subs = await db.subscription.findMany({ select: { serviceNumber: true, customerId: true } });
  const perNomor = new Map(subs.map((s) => [s.serviceNumber.replace(/\s+/g, "").toUpperCase(), s.customerId]));

  let diubah = 0;
  for (const b of bersih) {
    const isi = siap.get(b.serviceNumber);
    if (!isi || isi.length === 0) continue;
    const customerId = perNomor.get(b.serviceNumber.replace(/\s+/g, "").toUpperCase());
    if (!customerId) continue;

    await db.customer.update({
      where: { id: customerId },
      data: {
        phone: isi.includes("telepon") ? b.phone! : undefined,
        email: isi.includes("email") ? b.email! : undefined,
        birthDate: isi.includes("tanggal lahir") ? b.birthDate! : undefined,
        identityNumber: isi.includes("NIK") ? b.identityNumber! : undefined,
        latitude: isi.includes("koordinat") ? b.latitude! : undefined,
        longitude: isi.includes("koordinat") ? b.longitude! : undefined,
      },
    });
    diubah++;
  }

  await logAudit({
    userId,
    action: "CUSTOMER_IDENTITY_IMPORT",
    module: "customers",
    entityType: "Customer",
    description:
      `Melengkapi identitas pelanggan dari sistem lama: ${diubah} pelanggan diubah — ` +
      Object.entries(rencana.perBidang).map(([k, v]) => `${k} ${v}`).join(", ") +
      `; ${rencana.ringkas.tolak} ditolak, ${rencana.masalah.length} bermasalah.`,
  });

  return rencana;
}
