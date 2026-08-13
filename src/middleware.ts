import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { isOidcBypassPath } from "@/lib/oidc-rules";

const SESSION_COOKIE = "perumnet_session";
// Fase 45 — jalur masuk lewat penyedia identitas harus terbuka tanpa sesi,
// karena justru DI SITULAH sesi dibuat. Keduanya punya penjaganya sendiri:
// `/start` hanya mengalihkan ke IdP, dan `/callback` menolak apa pun yang
// state-nya tidak cocok dengan cookie yang kita terbitkan sendiri.
// Fase 50 — halaman verifikasi kartu dibuka pelanggan di depan pintu, tanpa
// akun. Isinya sudah disaring publicVerification(): hanya nama, jabatan, foto,
// dan nomor kartu, dan hanya bila kartunya berlaku.
const PUBLIC_PATHS = [
  "/login",
  "/verify",
  "/api/verify/",
  // Fase 57 — dibaca Docker dan pengatur beban, yang tidak punya sesi.
  // Isinya hampa dengan sengaja: jalur terbuka tidak boleh menyebut versi,
  // nama host, atau apa pun yang menolong orang memetakan sistem dari luar.
  "/api/health",
];

// Next.js middleware membangun URL dari hostname/port server (bukan Host header),
// sehingga di belakang reverse proxy/tunnel redirect harus dibangun dari header.
function requestOrigin(request: NextRequest): string {
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  const host = request.headers.get("host") || request.nextUrl.host;
  return `${proto}://${host}`;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
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

  if (!authenticated && !isPublic) {
    const url = new URL("/login", requestOrigin(request));
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (authenticated && isPublic) {
    return NextResponse.redirect(new URL("/dashboard", requestOrigin(request)));
  }
  return NextResponse.next();
}

export const config = {
  // Lindungi semua route kecuali aset statis
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.png$).*)"],
};
