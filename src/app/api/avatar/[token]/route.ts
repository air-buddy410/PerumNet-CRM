import { NextResponse } from "next/server";
import { avatarBytes } from "@/lib/avatar-service";
import { AVATAR_MIME } from "@/lib/avatar";

// ── Penyajian foto profil (Fase 59) ─────────────────────────────
//
// Terbuka tanpa login DENGAN SENGAJA, dan alasannya teknis: tag <img> tidak
// bisa mengirim header otentikasi. Aplikasi PerumNet lain menempelkan URL ini
// apa adanya, dan itu hanya mungkin bila jalurnya bisa diambil langsung.
//
// Yang menjaganya bukan login, melainkan TOKENNYA: acak penuh, tidak
// mengandung nama, email, maupun id. Ia tidak bisa ditebak, dan tidak bisa
// dipakai menelusuri siapa saja yang bekerja di sini.
//
// Data diri TIDAK ikut jalur ini. Yang keluar dari sini hanya gambar. Nama,
// divisi, dan seterusnya menunggu API bertoken layanan — data pribadi tidak
// boleh berada di balik URL yang bisa ditempel di mana pun.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const bytes = await avatarBytes(token);
  if (!bytes) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": AVATAR_MIME,
      // Boleh disimpan peramban sebentar — foto profil jarang berubah, dan
      // avatar muncul di setiap halaman. Tapi TIDAK lama: mengganti foto harus
      // terasa, dan akun yang dinonaktifkan harus segera berhenti tampil.
      "Cache-Control": "public, max-age=300, must-revalidate",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
