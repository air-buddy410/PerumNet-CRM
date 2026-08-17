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

import net from "node:net";

export class OltTelnetError extends Error {}

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

export interface SesiOpsi {
  host: string;
  port?: number;
  user: string;
  password: string;
  timeoutMs?: number;
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

  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    let buffer = "";
    let tahap: "USER" | "PASS" | "PERINTAH" | "SELESAI" = "USER";
    let sisa = [...perintah];
    let keluaran = "";
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

    sock.on("error", (e) =>
      // Pesan aslinya dibiarkan — ia berisi alamat dan kode kesalahan, tidak
      // pernah berisi apa yang kita kirim.
      tutup(new OltTelnetError(`Tidak bisa menyambung ke ${host}:${port} — ${e.message}`))
    );

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
      if (tahap === "PERINTAH" || tahap === "SELESAI") keluaran += Buffer.from(teks).toString("utf8");

      const bawah = buffer.toLowerCase();

      if (tahap === "USER" && /(username|login)\s*:/.test(bawah)) {
        tahap = "PASS";
        buffer = "";
        sock.write(`${user}\r\n`);
        return;
      }
      if (tahap === "PASS" && /password\s*:/.test(bawah)) {
        tahap = "PERINTAH";
        buffer = "";
        sock.write(`${password}\r\n`);
        return;
      }
      if (tahap === "PERINTAH") {
        if (/(login|authentication)\s*(failed|incorrect)|%\s*error|access denied/i.test(keluaran)) {
          return tutup(new OltTelnetError(`Kredensial ditolak oleh ${host}. Periksa isi env var-nya.`));
        }
        // Prompt konsol: berakhiran # atau >
        if (/[#>]\s*$/.test(keluaran)) {
          const berikut = sisa.shift();
          if (berikut !== undefined) {
            keluaran = "";
            sock.write(`${berikut}\r\n`);
          } else {
            tahap = "SELESAI";
            sock.write("exit\r\n");
            setTimeout(() => tutup(undefined, keluaran), 250);
          }
        }
      }
    });

    sock.connect(port, host);
  });
}
