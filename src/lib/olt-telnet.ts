// ── Menyambung ke konsol OLT lewat telnet (Fase 88b) ────────────
//
// Kredensial dibaca dari environment lewat NAMA env var yang disimpan di
// `OltDevice.credentialRef` — pola Fase 13, sama seperti MikroTik. Nilainya
// tidak pernah menyentuh basis data, cadangan, maupun log.
//
// DUA HAL YANG DIJAGA KETAT DI SINI:
//
//  1. **Password tidak pernah muncul di pesan galat.** Galat telnet biasanya
//     mengutip apa yang barusan dikirim; kalau yang barusan dikirim adalah
//     password, ia mendarat di log dan tinggal di sana selamanya.
//
//  2. **Sesi selalu ditutup.** OLT membatasi jumlah sesi konsol yang boleh
//     hidup bersamaan — biasanya lima. Sesi yang bocor karena galat akan
//     menumpuk sampai teknisi sungguhan tidak bisa masuk ke perangkatnya
//     sendiri, dan sebabnya sulit ditebak dari luar.
//
// TIGA HAL YANG DIPELAJARI DARI PERANGKAT SUNGGUHAN, 17 Agustus 2026:
//
//  a. **Kegagalan masuk hanya bisa disimpulkan SEBELUM prompt pertama.**
//     Versi pertama memeriksa pola galat sepanjang sesi, dan `%Error 140303`
//     dari sebuah perintah yang salah ketik dilaporkan sebagai "kredensial
//     ditolak" — diagnosis yang membuat orang memeriksa password yang
//     sebenarnya sudah benar. Begitu prompt terlihat, kita SUDAH masuk;
//     apa pun sesudahnya adalah jawaban perintah.
//
//  b. **Port telnet berbeda per perangkat, DAN per jalur.** HSGQ G008
//     melayaninya di 1024/1025 pada alamatnya sendiri; ZTE di 23. Angka
//     231/232 yang tersimpan di `OltDevice.telnetPort` ternyata port
//     PENERUSAN pada 172.30.10.6 — sah untuk jalur itu, salah untuk alamat
//     langsung. Memaku 23 menggagalkan HSGQ; memaku nilai tersimpan
//     menggagalkan ZTE. Karena itu keduanya dicoba, dan yang menjawab
//     dipakai — perangkat sendiri yang memberi tahu pintunya, bukan tebakan
//     kita.
//
//  c. **ZTE memutus sambungan MENDADAK saat `exit`.** Ia tidak menutup rapi;
//     ia mengirim RST. Versi pertama menunggu 200 ms sebelum menyelesaikan
//     janjinya, dan RST yang datang lebih dulu membuat penangan galat menolak
//     hasil yang SUDAH didapat — login berhasil dilaporkan sebagai
//     "ECONNRESET". Karena itu hasil diselesaikan pada saat diputuskan, bukan
//     ditunda, dan galat sesudah itu diabaikan: sambungan yang putus setelah
//     jawabannya lengkap bukan kegagalan.
//
//  d. **HSGQ mengirim baris log tanpa diminta.** Di tengah sesi ia menyelipkan
//     `[2026/08/17 11:34:19] Info: ONU ... authorization success`. Prompt
//     karena itu tidak selalu berada di ujung buffer, dan deteksi yang
//     menuntut demikian akan menunggu selamanya.

import net from "node:net";

export class OltTelnetError extends Error {}

/**
 * Mencoba beberapa port sampai ada yang menjawab.
 *
 * Dipakai karena satu perangkat bisa dijangkau lewat lebih dari satu jalur
 * dengan port berbeda, dan catatan kita hanya menyimpan salah satunya. Yang
 * gagal karena SAMBUNGAN dicoba lagi di port berikutnya; yang gagal karena
 * KREDENSIAL tidak — password yang salah tetap salah di pintu mana pun, dan
 * mencobanya berulang hanya menghitung percobaan gagal di perangkatnya.
 */
export async function jalankanPerintahMultiPort(
  opsi: Omit<SesiOpsi, "port">,
  ports: number[],
  perintah: string[]
): Promise<{ keluaran: string; port: number }> {
  let terakhir: Error | null = null;
  for (const port of [...new Set(ports)]) {
    try {
      const keluaran = await jalankanPerintah({ ...opsi, port }, perintah);
      return { keluaran, port };
    } catch (e) {
      terakhir = e as Error;
      if (/ditolak/i.test(terakhir.message)) throw terakhir;
    }
  }
  throw terakhir ?? new OltTelnetError("Tidak ada port yang dicoba.");
}

/** Kredensial dibaca dari env var yang NAMANYA disimpan di database. */
export function bacaKredensialOlt(credentialRef: string | null): { user: string; password: string } {
  const nama = (credentialRef ?? "").trim();
  if (!nama) throw new OltTelnetError("OLT ini belum menunjuk nama env var kredensialnya.");
  if (nama === "LIBRENMS_API_TOKEN") {
    // Penanda sementara Fase 81. Kalau lolos, sambungan akan mencoba masuk
    // memakai token pemantauan sebagai password — gagal dengan pesan yang
    // menyesatkan ("password salah"), padahal yang salah penunjuknya.
    throw new OltTelnetError(
      "OLT ini masih menunjuk LIBRENMS_API_TOKEN — itu penanda sementara, bukan kredensial OLT. " +
        "Jalankan scripts/_atur-kredensial-olt.ts --terapkan."
    );
  }
  const raw = process.env[nama];
  if (!raw) throw new OltTelnetError(`Env var ${nama} belum di-set di proses ini.`);
  const pisah = raw.indexOf(":");
  if (pisah < 1) throw new OltTelnetError(`Isi ${nama} harus berbentuk "user:password".`);
  return { user: raw.slice(0, pisah), password: raw.slice(pisah + 1) };
}

// ── Tembok baca-saja ────────────────────────────────────────────
//
// Diminta pemilik jaringan, 17 Agustus 2026: **yang boleh berubah HANYA basis
// data CRM kita.** OLT, SNMP, router, dan sistem lama seluruhnya baca-saja.
//
// Ini bukan disiplin, melainkan penolakan. Disiplin gagal pada hari seseorang
// menyalin sebaris kode dan mengganti perintahnya; daftar putih menolak
// perintah yang tidak dikenal SEBELUM ia menyentuh soket, dan tidak ada jalan
// memanggil `jalankanPerintah` yang melewatinya.
//
// Yang diizinkan sengaja sempit: berpindah mode, melihat, dan bertanya. Satu
// pun perintah yang mengubah keadaan — `no`, `set`, `save`, `write`, `copy`,
// `reboot`, `ont`, `service-port` — tidak ada di sini, dan menambahkannya
// harus jadi keputusan sadar yang terlihat di riwayat berkas ini.

/** Kata pertama yang boleh dikirim ke konsol perangkat. */
// `interface` ikut diizinkan dengan sadar: pada HSGQ, perintah baca optik
// hidup DI DALAM konteks `interface gpon N`, dan masuk ke konteks itu tidak
// mengubah apa pun — yang mengubah adalah perintah yang dikirim di dalamnya,
// dan itulah yang tetap disaring daftar ini.
const PERINTAH_BOLEH = new Set(["show", "display", "enable", "configure", "interface", "exit", "quit", "end", "?"]);

export class PerintahDitolak extends OltTelnetError {}

/**
 * Memastikan sebuah perintah hanya membaca.
 *
 * Diperiksa per baris, dan yang diperiksa KATA PERTAMANYA — bukan pencocokan
 * pola di tengah kalimat, yang bisa diakali dengan menyisipkan `show` di
 * belakang perintah yang mengubah.
 */
export function periksaPerintahBaca(perintah: string): void {
  const bersih = perintah.trim();
  if (!bersih) return;
  // Titik koma dan baris baru memungkinkan dua perintah menumpang satu baris.
  if (/[;\n\r|]/.test(bersih)) {
    throw new PerintahDitolak(`Perintah "${bersih}" memuat pemisah — hanya satu perintah per baris.`);
  }
  const kata = bersih.split(/\s+/)[0].toLowerCase();
  if (!PERINTAH_BOLEH.has(kata)) {
    throw new PerintahDitolak(
      `Perintah "${kata}" ditolak: sambungan ke OLT bersifat BACA-SAJA. ` +
        `Yang diizinkan: ${[...PERINTAH_BOLEH].join(", ")}.`
    );
  }
}

export interface SesiOpsi {
  host: string;
  /** Dari `OltDevice.telnetPort`. HSGQ memakai 1024/1025, bukan 23. */
  port?: number;
  user: string;
  password: string;
  timeoutMs?: number;
}

/**
 * Menjawab penomoran halaman konsol.
 *
 * ZTE memenggal keluaran panjang dengan ` --More--` dan menunggu tombol.
 * Tanpa jawaban, prompt tidak pernah datang dan sesi mati kehabisan waktu —
 * bukan karena perangkatnya lambat, melainkan karena ia sopan menunggu kita.
 * Spasi meminta halaman berikutnya; penandanya sendiri dibuang dari keluaran
 * supaya parser tidak menemukannya di tengah nilai.
 */
export const TANDA_MORE = /[ \t]*--More--[ \t]*/g;

export function adaMore(teks: string): boolean {
  return /--More--\s*$/.test(teks);
}

/**
 * Apakah teks ini berakhir pada prompt konsol.
 *
 * Baris log yang diselipkan HSGQ tanpa diminta dibuang lebih dulu — kalau
 * tidak, prompt tidak pernah berada di ujung dan sesi menggantung sampai
 * kehabisan waktu.
 */
export function adaPrompt(teks: string): boolean {
  const bersih = teks
    .split(/\r?\n/)
    .filter((b) => !/^\s*\[\d{4}[/-]\d{2}[/-]\d{2}/.test(b))
    .join("\n");
  return /[#>]\s*$/.test(bersih);
}

/**
 * Pola yang HANYA berarti kegagalan masuk — diperiksa sebelum prompt pertama.
 *
 * Dua jenis tanda, dan yang kedua yang paling bisa diandalkan:
 *
 *  1. Kalimat galat. Tiap vendor menulisnya lain: ZTE C600 memakai
 *     `% Username or password error`, yang tidak memuat kata "failed" maupun
 *     "denied" sama sekali — daftar kata kunci saja akan melewatkannya, dan
 *     sesi menggantung sampai kehabisan waktu alih-alih menyebut sebabnya.
 *
 *  2. **Perangkat menanyakan Username LAGI.** Ini tanda yang tidak bergantung
 *     bahasa maupun vendor: setelah sandi dikirim, satu-satunya alasan ia
 *     kembali ke prompt nama adalah karena yang tadi ditolak.
 */
export function tandaGagalMasuk(teks: string): boolean {
  if (/(login|authentication)\s*(failed|incorrect|error)/i.test(teks)) return true;
  if (/access denied|permission denied|bad password/i.test(teks)) return true;
  if (/username or password/i.test(teks)) return true;
  // Kembali ke prompt nama = sandi tadi ditolak.
  if (/(username|login)\s*:\s*$/i.test(teks.trimEnd())) return true;
  return false;
}

/**
 * Masuk ke konsol, jalankan perintah BACA, lalu keluar.
 *
 * Perintah yang boleh dikirim sengaja tidak dibatasi di sini — pembatasannya
 * ada di pemanggil, dan yang memanggil hanya modul pembaca optik. Kalau suatu
 * hari ada yang ingin mengirim perintah yang MENGUBAH konfigurasi, tempatnya
 * bukan di sini melainkan antrean `NetworkAccessJob` yang auditable.
 */
export function jalankanPerintah(opsi: SesiOpsi, perintah: string[]): Promise<string> {
  const { host, port = 23, user, password, timeoutMs = 15_000 } = opsi;

  // Diperiksa SEBELUM soket dibuka: perintah yang mengubah keadaan tidak
  // pernah sampai ke perangkat, bahkan tidak membuat sambungan.
  for (const p of perintah) periksaPerintahBaca(p);

  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    let buffer = "";
    let tahap: "USER" | "PASS" | "MASUK" | "PERINTAH" | "SELESAI" = "USER";
    let sisa = [...perintah];
    let keluaran = "";
    /**
     * Seluruh jawaban sesi, lintas perintah. `keluaran` di-reset tiap kali
     * perintah baru dikirim — itu perlu untuk deteksi prompt — tetapi pemanggil
     * berhak atas semuanya: sesi dua-perintah yang hanya mengembalikan jawaban
     * terakhir membuang jawaban pertama diam-diam.
     */
    let transkrip = "";
    let beres = false;

    const tutup = (err?: Error, hasil?: string) => {
      if (beres) return;
      beres = true;
      sock.destroy();
      if (err) reject(err);
      else resolve(hasil ?? keluaran);
    };

    const jam = setTimeout(
      () => tutup(new OltTelnetError(`OLT ${host}:${port} tidak menjawab dalam ${timeoutMs / 1000} detik.`)),
      timeoutMs
    );
    sock.on("close", () => clearTimeout(jam));

    sock.on("error", (e) => {
      // Galat SESUDAH jawaban lengkap diabaikan. ZTE memutus dengan RST saat
      // `exit`, dan menolak hasil karenanya berarti membuang pembacaan yang
      // sudah benar. Pesan aslinya dibiarkan apa adanya — ia berisi alamat dan
      // kode kesalahan, tidak pernah berisi apa yang kita kirim.
      if (beres) return;
      tutup(new OltTelnetError(`Tidak bisa menyambung ke ${host}:${port} — ${e.message}`));
    });

    sock.on("data", (chunk) => {
      // Negosiasi telnet (IAC, 0xFF) dijawab menolak semua opsi: perangkat ini
      // tidak butuh echo/terminal-type, dan menjawabnya dengan benar lebih
      // sederhana daripada mengabaikannya.
      const bytes = Uint8Array.from(chunk);
      const balas: number[] = [];
      const teks: number[] = [];
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 255 && i + 2 < bytes.length) {
          const perintahIac = bytes[i + 1];
          const opsiIac = bytes[i + 2];
          if (perintahIac === 253) balas.push(255, 252, opsiIac); // DO → WONT
          else if (perintahIac === 251) balas.push(255, 254, opsiIac); // WILL → DONT
          i += 2;
        } else {
          teks.push(bytes[i]);
        }
      }
      if (balas.length) sock.write(Buffer.from(balas));

      buffer += Buffer.from(teks).toString("utf8");
      if (tahap !== "USER" && tahap !== "PASS") keluaran += Buffer.from(teks).toString("utf8");

      // Halaman berikutnya diminta SEBELUM deteksi prompt — selama --More--
      // menggantung, prompt memang tidak akan pernah muncul.
      if ((tahap === "MASUK" || tahap === "PERINTAH") && adaMore(keluaran)) {
        keluaran = keluaran.replace(TANDA_MORE, "\n");
        sock.write(" ");
        return;
      }

      const bawah = buffer.toLowerCase();

      if (tahap === "USER" && /(username|login)\s*:/.test(bawah)) {
        tahap = "PASS";
        buffer = "";
        sock.write(`${user}\r\n`);
        return;
      }
      if (tahap === "PASS" && /password\s*:/.test(bawah)) {
        tahap = "MASUK";
        buffer = "";
        keluaran = "";
        sock.write(`${password}\r\n`);
        return;
      }

      // Sebelum prompt pertama: satu-satunya tempat kegagalan masuk bisa
      // disimpulkan. Sesudahnya, galat apa pun milik perintah — bukan sandi.
      if (tahap === "MASUK") {
        if (tandaGagalMasuk(keluaran)) {
          return tutup(new OltTelnetError(`Kredensial ditolak oleh ${host}. Periksa isi env var-nya.`));
        }
        if (adaPrompt(keluaran)) {
          tahap = "PERINTAH";
          keluaran = "";
          if (sisa.length === 0) {
            // Tidak ada perintah: sampai di prompt SUDAH membuktikan masuknya.
            // Diselesaikan SEKARANG, lalu `exit` dikirim sebagai kesopanan —
            // bukan sebaliknya. Menunggu jawaban atas `exit` berarti menunggu
            // RST yang akan dilaporkan sebagai kegagalan.
            tahap = "SELESAI";
            tutup(undefined, transkrip || "MASUK");
            try { sock.write("exit\r\n"); } catch { /* sesi sudah lepas */ }
            return;
          }
          const pertama = sisa.shift()!;
          sock.write(`${pertama}\r\n`);
          return;
        }
        return;
      }

      if (tahap === "PERINTAH") {
        if (adaPrompt(keluaran)) {
          const berikut = sisa.shift();
          if (berikut !== undefined) {
            transkrip += keluaran;
            keluaran = "";
            sock.write(`${berikut}\r\n`);
          } else {
            // Prompt terlihat lagi berarti jawaban perintah terakhir sudah
            // lengkap. Sama seperti di atas: selesaikan dulu, baru berpamitan.
            tahap = "SELESAI";
            const hasil = transkrip + keluaran;
            tutup(undefined, hasil);
            try { sock.write("exit\r\n"); } catch { /* sesi sudah lepas */ }
          }
        }
      }
    });

    sock.connect(port, host);
  });
}
