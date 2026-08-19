import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { isOidcBypassPath } from "@/lib/oidc-rules";
import { keputusanJalur } from "@/lib/middleware-rules";

const SESSION_COOKIE = "perumnet_session";

// Next.js middleware membangun URL dari hostname/port server (bukan Host header),
// sehingga di belakang reverse proxy/tunnel redirect harus dibangun dari header.
function requestOrigin(request: NextRequest): string {
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  const host = request.headers.get("host") || request.nextUrl.host;
  return `${proto}://${host}`;
}

// Fase 87 — portal pelanggan. Realm yang BERBEDA, bukan sekadar jalur publik.
//
// Aturan "sudah masuk lalu buka jalur publik → lempar ke /dashboard" berlaku
// untuk staf, dan menerapkannya di sini akan salah dua arah sekaligus:
// pelanggan yang membuka portalnya akan dilempar ke dasbor staf, dan pegawai
// yang sedang masuk tidak akan pernah bisa membuka portal untuk menolong
// pelanggan di telepon. Karena itu seluruh cabang `/pelanggan` dilewatkan di
// sini, dan penjagaannya dikerjakan halamannya sendiri lewat
// `pelangganSekarang()` — yang memeriksa cookie portal, keaktifan akun, DAN
// `sessionEpoch`, tiga hal yang tidak bisa diperiksa dari middleware tanpa
// menyentuh basis data.
const PORTAL_PREFIX = "/pelanggan";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === PORTAL_PREFIX || pathname.startsWith(`${PORTAL_PREFIX}/`)) {
    return NextResponse.next();
  }

  // Webhook integrasi (§56): dipanggil sistem eksternal tanpa sesi —
  // autentikasi memakai token per-integrasi di route handler.
  if (pathname.startsWith("/api/integrations/")) {
    return NextResponse.next();
  }

  // Jalur OIDC dilewatkan SEPENUHNYA — bukan sekadar "publik".
  //
  // Bedanya penting pada satu kasus: kalau sesi lama masih ada dan orangnya
  // masuk ulang lewat penyedia identitas, memperlakukan callback sebagai
  // "publik" akan memantulkannya ke /dashboard SEBELUM sesi barunya terbentuk
  // — ia tetap masuk sebagai pemilik sesi lama, bukan sebagai dirinya yang
  // baru saja login.
  if (isOidcBypassPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;

  let authenticated = false;
  if (token && process.env.SESSION_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET));
      authenticated = true;
    } catch {
      authenticated = false;
    }
  }

  // Aturannya ada di `@/lib/middleware-rules` — berkas murni yang ikut
  // `npm test`. Berkas ini sendiri tidak pernah tersentuh suite, dan itu yang
  // membuat bug avatar Fase 96 bertahan berbulan-bulan tanpa ketahuan.
  switch (keputusanJalur({ pathname, authenticated })) {
    case "ke-login": {
      const url = new URL("/login", requestOrigin(request));
      if (pathname !== "/") url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    case "ke-dashboard":
      return NextResponse.redirect(new URL("/dashboard", requestOrigin(request)));
    default:
      return NextResponse.next();
  }
}

export const config = {
  // Lindungi semua route kecuali aset statis
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.png$).*)"],
};
