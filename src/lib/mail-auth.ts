import tls from "node:tls";

// ── Verifikasi kredensial ke mailserver (Fase 53) ───────────────
//
// PerumNet memilih mailcow sebagai sumber identitas untuk sementara, dan
// Authentik disimpan untuk nanti. Konsekuensinya ada di sini: CRM menerima
// password email milik orang, lalu menanyakannya ke mailserver.
//
// API mailcow TIDAK bisa dipakai untuk ini — ia API admin berkunci API key,
// untuk mengelola mailbox. Memverifikasi password pengguna bukan tugasnya.
// Jadi jalurnya IMAP: coba masuk sebagai orang tersebut. Kalau server
// menerima, passwordnya benar.
//
// Empat hal yang dijaga ketat di berkas ini, dan semuanya karena password
// yang lewat sini adalah password EMAIL — saluran reset untuk segalanya:
//
//   1. Password tidak pernah masuk log, pesan galat, maupun basis data.
//   2. Sambungan WAJIB TLS dengan sertifikat diperiksa. Tidak ada opsi
//      mematikannya, karena password polos melintas di sambungan ini.
//   3. CR/LF pada kredensial DITOLAK sebelum terkirim — tanpa itu, sebuah
//      "password" bisa menyisipkan perintah IMAP-nya sendiri.
//   4. Gagal menghubungi mailserver TIDAK PERNAH berarti lolos. Tidak ada
//      jalan mundur diam-diam ke hash lokal.

export class MailAuthError extends Error {}

/** Hasil pemeriksaan, dibedakan supaya pesannya ke pengguna tidak menyesatkan. */
export type MailAuthResult =
  /** Server menerima kredensialnya. */
  | { ok: true }
  /** Server menolak — password memang salah. */
  | { ok: false; reason: "REJECTED" }
  /** Servernya tidak terjawab. BUKAN berarti passwordnya salah. */
  | { ok: false; reason: "UNREACHABLE"; detail: string };

export const IMAP_PORT = 993;
export const IMAP_TIMEOUT_MS = 10_000;

/**
 * Nama host IMAP dari baseUrl integrasi mailcow.
 *
 * Diambil dari satu tempat yang sama dengan API mailcow supaya tidak ada dua
 * alamat mailserver yang bisa berbeda diam-diam.
 */
export function imapHostFrom(baseUrl: string): string {
  const trimmed = (baseUrl ?? "").trim();
  if (!trimmed) throw new MailAuthError("Alamat mailserver belum diisi.");
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    throw new MailAuthError(`Alamat mailserver tidak terbaca: ${trimmed}`);
  }
}

/**
 * Menolak kredensial yang bisa menyuntik perintah IMAP.
 *
 * Perintah IMAP dipisahkan CRLF. Sebuah "password" berisi baris baru dapat
 * mengakhiri perintah LOGIN lalu menuliskan perintahnya sendiri. Ditolak di
 * sini, sebelum satu byte pun terkirim — bukan disaring, karena password sah
 * memang tidak pernah memuat baris baru.
 */
export function credentialRejection(value: string): string | null {
  if (/[\r\n\0]/.test(value)) return "Kredensial memuat karakter yang tidak diizinkan.";
  if (!value.length) return "Kredensial kosong.";
  if (value.length > 512) return "Kredensial terlalu panjang.";
  return null;
}

/** Mengutip untuk IMAP: hanya `\` dan `"` yang perlu didahului garis miring. */
export function quoteImap(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Apakah balasan server menandakan perintah berhasil? */
export function isTaggedOk(line: string, tag: string): boolean | null {
  const re = new RegExp(`^${tag} (OK|NO|BAD)\\b`, "im");
  const m = re.exec(line);
  if (!m) return null;
  return m[1].toUpperCase() === "OK";
}

/** Disuntik pada tes supaya seluruh aturan di atas teruji tanpa mailserver. */
export type ImapProbe = (host: string, email: string, password: string) => Promise<MailAuthResult>;

/**
 * Mencoba LOGIN ke IMAPS.
 *
 * Sengaja hanya LOGIN lalu LOGOUT — tidak membuka kotak surat, tidak membaca
 * apa pun. Yang dibutuhkan cuma jawaban server atas satu pertanyaan: benar
 * atau tidak.
 */
export async function probeImapLogin(
  host: string,
  email: string,
  password: string
): Promise<MailAuthResult> {
  for (const v of [email, password]) {
    const bad = credentialRejection(v);
    // Pesannya sengaja tidak menyebut nilai apa pun.
    if (bad) return { ok: false, reason: "REJECTED" };
  }

  return new Promise<MailAuthResult>((resolve) => {
    let selesai = false;
    const beres = (r: MailAuthResult) => {
      if (selesai) return;
      selesai = true;
      try {
        socket.end();
      } catch {
        /* sambungan sudah tertutup */
      }
      resolve(r);
    };

    // rejectUnauthorized dibiarkan pada nilai bawaannya (true) DENGAN SENGAJA.
    // Password polos melintas di sambungan ini; sertifikat yang tidak
    // diperiksa berarti siapa pun di tengah jalan bisa memanennya.
    const socket = tls.connect({ host, port: IMAP_PORT, servername: host });
    socket.setEncoding("utf8");
    socket.setTimeout(IMAP_TIMEOUT_MS);

    let buffer = "";
    let dikirim = false;
    const TAG = "a1";

    socket.on("secureConnect", () => {
      /* menunggu salam server */
    });
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      if (!dikirim && /^\* OK/im.test(buffer)) {
        dikirim = true;
        buffer = "";
        socket.write(`${TAG} LOGIN ${quoteImap(email)} ${quoteImap(password)}\r\n`);
        return;
      }
      if (dikirim) {
        const hasil = isTaggedOk(buffer, TAG);
        if (hasil === true) beres({ ok: true });
        else if (hasil === false) beres({ ok: false, reason: "REJECTED" });
      }
    });
    socket.on("timeout", () =>
      beres({ ok: false, reason: "UNREACHABLE", detail: "Mailserver tidak menjawab tepat waktu." })
    );
    socket.on("error", (e) =>
      beres({ ok: false, reason: "UNREACHABLE", detail: (e as Error).message })
    );
    socket.on("close", () =>
      beres({ ok: false, reason: "UNREACHABLE", detail: "Sambungan ke mailserver terputus." })
    );
  });
}

// ── Aturan ganti password mailserver (Fase 54) ──────────────────

/**
 * Panjang minimum password email baru.
 *
 * Lebih ketat dari minimum password CRM (8) DENGAN SENGAJA: password email
 * adalah saluran reset untuk hampir semua akun lain. Yang menguasainya bisa
 * mengambil alih sisanya, jadi ia tidak boleh selemah password biasa.
 */
export const MIN_MAIL_PASSWORD = 10;

/**
 * Alasan penolakan password email baru, atau null bila boleh dipakai.
 *
 * Password LAMA tetap wajib diisi dan diverifikasi ke mailserver sebelum
 * fungsi ini berarti apa-apa. Tanpa itu, sesi CRM yang dibajak cukup untuk
 * mengganti password email seseorang — dan dengan begitu mengambil alih
 * seluruh akun lain miliknya.
 */
export function newMailPasswordRejection(
  current: string,
  next: string,
  confirm: string
): string | null {
  if (!current) return "Isi password email Anda saat ini.";
  if (!next) return "Isi password baru.";
  if (next !== confirm) return "Konfirmasi password tidak sama.";
  if (next.length < MIN_MAIL_PASSWORD) {
    return `Password email baru minimal ${MIN_MAIL_PASSWORD} karakter — ini kunci ke seluruh akun Anda yang lain.`;
  }
  if (next === current) return "Password baru harus berbeda dari yang sekarang.";
  // Alasannya sama dengan saat login: karakter ini bisa menyisipkan perintah.
  const bad = credentialRejection(next);
  if (bad) return bad;
  return null;
}
