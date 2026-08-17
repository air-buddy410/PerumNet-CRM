/**
 * Fase 89 — memindahkan kredensial OLT dari env var ke brankas basis data.
 *
 * Dijalankan SEKALI di produksi, setelah `DEVICE_CRED_KEY` terpasang dan tabel
 * `DeviceCredential` sudah dibuat:
 *
 *   docker compose run --rm tools npx tsx scripts/_pindah-kredensial-ke-brankas.ts
 *
 * Tambahkan `--tulis` untuk benar-benar menyimpan. Tanpa itu ia hanya melapor —
 * sengaja, supaya bisa dilihat dulu apa yang akan terjadi sebelum terjadi.
 *
 * YANG TIDAK DILAKUKAN SKRIP INI:
 *
 * - Tidak menghapus satu pun baris dari `.env`. Env var tetap jadi cadangan,
 *   dan brankas dibaca lebih dulu — jadi setelah skrip ini jalan, perangkatnya
 *   sudah memakai brankas sementara berkasnya masih utuh. Hapus barisnya
 *   belakangan, satu per satu, setelah tombol uji di layar menjawab hijau.
 * - Tidak menimpa kredensial yang sudah ada di brankas. Kalau NOC sudah
 *   mengisinya dari layar, isian NOC yang menang — dia lebih baru dan lebih
 *   mungkin benar daripada berkas yang mungkin sudah basi.
 * - Tidak menyentuh perangkat sama sekali. Tidak ada login, tidak ada perintah.
 */
import { db } from "@/lib/db";
import { segel, kunciSiap, PORT_BAWAAN } from "@/lib/rahasia-perangkat";

const TULIS = process.argv.includes("--tulis");

async function main() {
  if (!kunciSiap()) {
    console.error(
      "DEVICE_CRED_KEY belum terpasang atau panjangnya salah. Tanpa kunci tidak ada\n" +
        "yang bisa disegel, dan menyimpan sandi mentah bukan pilihan. Pasang dulu."
    );
    process.exit(1);
  }

  const olts = await db.oltDevice.findMany({
    select: {
      id: true,
      credentialRef: true,
      telnetPort: true,
      networkDeviceId: true,
      networkDevice: { select: { hostname: true } },
    },
  });

  // Siapa yang tercatat sebagai pengubah. Skrip bukan orang, jadi dipakai akun
  // admin — dan kalau tidak ada, berhenti daripada menebak.
  const admin = await db.user.findFirst({
    where: { level: "ADMIN" },
    select: { id: true, username: true },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) {
    console.error("Tidak ada akun ADMIN untuk dicatat sebagai pengubah. Berhenti.");
    process.exit(1);
  }

  console.log(`Mode          : ${TULIS ? "TULIS" : "lapor saja (tambahkan --tulis)"}`);
  console.log(`Dicatat sebagai: ${admin.username}`);
  console.log(`OLT terdaftar : ${olts.length}\n`);

  let pindah = 0;
  let lewat = 0;

  for (const olt of olts) {
    const nama = olt.networkDevice.hostname;
    const ref = olt.credentialRef?.trim();

    if (!ref || ref === "LIBRENMS_API_TOKEN") {
      console.log(`  –  ${nama}: tidak punya credentialRef sendiri, dilewati`);
      lewat++;
      continue;
    }

    const sudah = await db.deviceCredential.findUnique({
      where: { networkDeviceId: olt.networkDeviceId },
      select: { id: true },
    });
    if (sudah) {
      console.log(`  –  ${nama}: sudah ada di brankas, TIDAK ditimpa`);
      lewat++;
      continue;
    }

    const raw = process.env[ref];
    if (!raw) {
      console.log(`  !  ${nama}: ${ref} tidak terisi di proses ini, dilewati`);
      lewat++;
      continue;
    }

    // Format lamanya "user:password". Sandi yang mengandung titik dua tetap
    // utuh karena hanya titik dua PERTAMA yang memisahkan — di brankas nanti
    // keduanya jadi kolom sendiri dan masalah ini hilang selamanya.
    const pisah = raw.indexOf(":");
    if (pisah < 1) {
      console.log(`  !  ${nama}: isi ${ref} bukan bentuk "user:password", dilewati`);
      lewat++;
      continue;
    }
    const user = raw.slice(0, pisah);
    const sandi = raw.slice(pisah + 1);
    if (!sandi) {
      console.log(`  !  ${nama}: sandi di ${ref} kosong, dilewati`);
      lewat++;
      continue;
    }

    const port = olt.telnetPort ?? PORT_BAWAAN.TELNET;
    if (!TULIS) {
      console.log(`  →  ${nama}: akan dipindah dari ${ref} (pengguna "${user}", port ${port})`);
      pindah++;
      continue;
    }

    const disegel = segel(sandi);
    await db.deviceCredential.create({
      data: {
        networkDeviceId: olt.networkDeviceId,
        protocol: "TELNET",
        port,
        username: user,
        secretCipher: disegel.cipher,
        secretIv: disegel.iv,
        secretTag: disegel.tag,
        notes: `Dipindah otomatis dari env var ${ref}.`,
        updatedById: admin.id,
      },
    });
    console.log(`  ✓  ${nama}: dipindah dari ${ref} (pengguna "${user}", port ${port})`);
    pindah++;
  }

  console.log(`\n${pindah} dipindah, ${lewat} dilewati.`);
  if (pindah > 0 && !TULIS) {
    console.log("Belum ada yang ditulis. Ulangi dengan --tulis kalau daftar di atas benar.");
  }
  if (pindah > 0 && TULIS) {
    console.log(
      "\nBaris OLT_*_CRED di .env JANGAN dihapus sekarang. Biarkan sebagai cadangan\n" +
        "sampai tombol uji di layar tiap perangkat menjawab hijau, baru hapus satu per satu."
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
