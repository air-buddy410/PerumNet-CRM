import net from "node:net";
import tls from "node:tls";
import crypto from "node:crypto";

// ── Pengirim email seperlunya (Fase 55) ─────────────────────────
//
// CRM sebelumnya tidak bisa mengirim email sama sekali — antrean pesannya ada,
// tapi pengirimnya buntu ("menunggu kredensial SMTP"). Ini yang membukanya.
//
// Cakupannya SENGAJA sempit: satu pesan teks biasa ke satu penerima. Bukan
// pengganti pustaka email, dan tidak berpura-pura begitu. Yang di luar itu —
// lampiran, HTML berformat, banyak penerima sekaligus — belum dibutuhkan, dan
// menambahkannya sekarang berarti menanggung kerumitan yang belum ada gunanya.
//
// Tiga hal yang dijaga:
//
//   1. STARTTLS WAJIB. Kalau server tidak menawarkannya, sambungan dibatalkan
//      sebelum AUTH — password SMTP tidak boleh melintas polos, sekali pun.
//   2. CR/LF pada nilai header DITOLAK. Tanpa itu, sebuah alamat email bisa
//      menyisipkan header sendiri (Bcc, Reply-To) dan mengubah ke mana pesan
//      itu benar-benar pergi.
//   3. Password SMTP tidak pernah masuk log maupun pesan galat.

export class SmtpError extends Error {}

export const SMTP_TIMEOUT_MS = 15_000;

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  fromName: string;
}

/** Konfigurasi dari environment, atau null bila belum lengkap. */
export function smtpConfig(): SmtpConfig | null {
  const host = (process.env.SMTP_HOST ?? "").trim();
  const user = (process.env.SMTP_USER ?? "").trim();
  const password = process.env.SMTP_PASSWORD ?? "";
  if (!host || !user || !password) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    user,
    password,
    fromName: (process.env.SMTP_FROM_NAME ?? "PerumNet CRM").trim(),
  };
}

/** Alasan konfigurasi belum bisa dipakai, atau null bila siap. */
export function smtpBlocker(cfg: SmtpConfig | null): string | null {
  if (!cfg) {
    return "Pengiriman email belum disiapkan — SMTP_HOST, SMTP_USER, dan SMTP_PASSWORD belum diisi.";
  }
  if (!Number.isInteger(cfg.port) || cfg.port <= 0) return "SMTP_PORT tidak valid.";
  if (headerRejection(cfg.user)) return "SMTP_USER memuat karakter yang tidak diizinkan.";
  return null;
}

/**
 * Menolak nilai yang bisa menyisipkan header email.
 *
 * Header dipisahkan CRLF. Sebuah "alamat" berisi baris baru dapat menutup
 * header To lalu menuliskan Bcc-nya sendiri — pesan pun diam-diam pergi ke
 * tempat yang tidak diminta siapa pun.
 */
export function headerRejection(value: string): string | null {
  if (/[\r\n\0]/.test(value)) return "Nilai header memuat baris baru.";
  if (value.length > 400) return "Nilai header terlalu panjang.";
  return null;
}

/** Alamat email berbentuk wajar? Bukan validasi RFC penuh — cukup untuk menolak yang jelas salah. */
export function isPlainEmail(value: string): boolean {
  return headerRejection(value) === null && /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(value.trim());
}

/** Subjek non-ASCII dikodekan supaya tidak rusak di klien email. */
export function encodeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/**
 * Menyusun pesan RFC 5322 sederhana.
 *
 * Isi pesan dikodekan base64 — dengan begitu baris sepanjang apa pun, karakter
 * non-ASCII, maupun baris yang diawali titik tidak perlu diperlakukan khusus.
 * "Dot-stuffing" yang klasik itu jadi tidak relevan sama sekali.
 */
export function buildMessage(opts: {
  fromName: string;
  fromAddress: string;
  to: string;
  subject: string;
  body: string;
  date: Date;
  messageId: string;
}): string {
  for (const v of [opts.fromName, opts.fromAddress, opts.to, opts.subject]) {
    const bad = headerRejection(v);
    if (bad) throw new SmtpError(bad);
  }
  if (!isPlainEmail(opts.to)) throw new SmtpError(`Alamat tujuan tidak valid: ${opts.to}`);

  const headers = [
    `From: "${encodeHeaderValue(opts.fromName).replace(/"/g, "")}" <${opts.fromAddress}>`,
    `To: <${opts.to.trim()}>`,
    `Subject: ${encodeHeaderValue(opts.subject)}`,
    `Date: ${opts.date.toUTCString()}`,
    `Message-ID: <${opts.messageId}>`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  const encoded = Buffer.from(opts.body, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
  return `${headers.join("\r\n")}\r\n\r\n${encoded}\r\n`;
}

/** Kode balasan SMTP dari satu blok teks, atau null bila belum lengkap. */
export function replyCode(buffer: string): number | null {
  // Balasan bisa berbaris banyak: "250-AUTH ..." lalu "250 OK". Yang menandai
  // selesai adalah baris dengan spasi setelah angkanya.
  const m = /^(\d{3}) [^\n]*$/m.exec(buffer.trimEnd());
  return m ? Number(m[1]) : null;
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

/** Percakapan SMTP satu pesan. Diekspor terpisah supaya bisa diganti pada tes. */
export type MailSender = (cfg: SmtpConfig, to: string, subject: string, body: string) => Promise<SendResult>;

export const sendMailSmtp: MailSender = async (cfg, to, subject, body) => {
  const message = buildMessage({
    fromName: cfg.fromName,
    fromAddress: cfg.user,
    to,
    subject,
    body,
    date: new Date(),
    messageId: `${crypto.randomUUID()}@${cfg.host}`,
  });

  return new Promise<SendResult>((resolve) => {
    let socket: net.Socket | tls.TLSSocket = net.createConnection({ host: cfg.host, port: cfg.port });
    let selesai = false;
    const beres = (r: SendResult) => {
      if (selesai) return;
      selesai = true;
      try {
        socket.end();
      } catch {
        /* sudah tertutup */
      }
      resolve(r);
    };

    let buffer = "";
    let langkah = 0;
    let starttlsDitawarkan = false;

    const kirim = (line: string) => socket.write(line + "\r\n");

    const pasangPendengar = () => {
      socket.setEncoding("utf8");
      socket.setTimeout(SMTP_TIMEOUT_MS);
      socket.on("data", onData);
      socket.on("timeout", () => beres({ ok: false, error: "Mailserver tidak menjawab tepat waktu." }));
      socket.on("error", (e) => beres({ ok: false, error: (e as Error).message }));
    };

    function onData(chunk: string) {
      buffer += chunk;
      const code = replyCode(buffer);
      if (code === null) return;
      const teks = buffer;
      buffer = "";

      // 4xx dan 5xx selalu berarti gagal, di langkah mana pun.
      if (code >= 400) {
        return beres({ ok: false, error: `Mailserver menolak (${code}).` });
      }

      switch (langkah) {
        case 0: // salam server
          langkah = 1;
          return kirim(`EHLO ${cfg.host}`);
        case 1: // balasan EHLO sebelum TLS
          starttlsDitawarkan = /STARTTLS/i.test(teks);
          if (!starttlsDitawarkan) {
            // Dibatalkan, bukan dilanjutkan tanpa enkripsi. Password SMTP
            // tidak boleh melintas polos sekali pun.
            return beres({ ok: false, error: "Mailserver tidak menawarkan STARTTLS — pengiriman dibatalkan." });
          }
          langkah = 2;
          return kirim("STARTTLS");
        case 2: {
          // Meningkatkan sambungan yang sama menjadi TLS.
          socket.removeAllListeners("data");
          socket.removeAllListeners("timeout");
          socket.removeAllListeners("error");
          const polos = socket;
          socket = tls.connect({ socket: polos as net.Socket, servername: cfg.host });
          langkah = 3;
          pasangPendengar();
          socket.on("secureConnect", () => kirim(`EHLO ${cfg.host}`));
          return;
        }
        case 3: // balasan EHLO sesudah TLS
          langkah = 4;
          return kirim("AUTH LOGIN");
        case 4:
          langkah = 5;
          return kirim(Buffer.from(cfg.user, "utf8").toString("base64"));
        case 5:
          langkah = 6;
          return kirim(Buffer.from(cfg.password, "utf8").toString("base64"));
        case 6: // hasil AUTH
          langkah = 7;
          return kirim(`MAIL FROM:<${cfg.user}>`);
        case 7:
          langkah = 8;
          return kirim(`RCPT TO:<${to.trim()}>`);
        case 8:
          langkah = 9;
          return kirim("DATA");
        case 9: // server siap menerima isi (354)
          langkah = 10;
          return socket.write(message + ".\r\n");
        case 10: // pesan diterima
          langkah = 11;
          kirim("QUIT");
          return beres({ ok: true });
        default:
          return;
      }
    }

    pasangPendengar();
  });
};
