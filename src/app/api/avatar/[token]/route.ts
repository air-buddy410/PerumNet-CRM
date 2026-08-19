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
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const foto = await avatarBytes(token);

  if (!foto) {
    // `no-store`, dan ini BUKAN kerapian.
    //
    // URL foto profil tidak pernah berubah — tokennya sengaja dipertahankan
    // supaya tautan yang disimpan aplikasi lain tidak mati. Jawaban tanpa
    // header kesegaran akan disimpan peramban menurut tebakannya sendiri
    // (heuristic caching), jadi satu 404 — mis. sesaat setelah foto dihapus —
    // ikut menutupi foto yang diunggah SESUDAHNYA, di URL yang sama persis.
    // Yang terlihat orang: sudah unggah ulang, masih gambar rusak.
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // ETag = nama berkas tersimpan, acak dan berganti tiap unggahan. Inilah
  // satu-satunya cara peramban tahu isinya berganti, karena URL-nya tidak.
  const etag = `"${foto.versi}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "no-cache" },
    });
  }

  return new NextResponse(new Uint8Array(foto.bytes), {
    headers: {
      "Content-Type": AVATAR_MIME,
      ETag: etag,
      // `no-cache` BUKAN "jangan simpan" — peramban tetap menyimpannya, tapi
      // wajib bertanya dulu tiap kali. Dengan ETag, pertanyaan itu dijawab 304
      // tanpa bita apa pun selama fotonya belum diganti.
      //
      // Sebelumnya `max-age=300`: selama lima menit peramban menyajikan foto
      // LAMA tanpa bertanya sama sekali, padahal komentar di sini menjanjikan
      // "mengganti foto harus terasa". Janjinya sekarang ditepati kodenya.
      "Cache-Control": "no-cache",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
