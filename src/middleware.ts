import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "perumnet_session";
const PUBLIC_PATHS = ["/login"];

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
