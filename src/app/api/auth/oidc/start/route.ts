import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  oidcConfig,
  oidcBlocker,
  newStartParams,
  authorizationUrl,
  OidcError,
} from "@/lib/oidc";

// Memulai alur masuk lewat penyedia identitas.
//
// State, nonce, dan PKCE verifier disimpan di cookie httpOnly berumur pendek,
// BUKAN di database. Alasannya: ketiganya hanya berarti untuk satu peramban
// yang sedang melakukan satu permintaan login. Menyimpannya di database
// membuat tabel yang harus dibersihkan dan bisa dibaca proses lain, tanpa
// menambah keamanan apa pun.

export const OIDC_FLOW_COOKIE = "perumnet_oidc_flow";
const FLOW_TTL_SEC = 10 * 60;

export async function GET() {
  const blocker = oidcBlocker();
  if (blocker) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(blocker)}`, process.env.APP_URL ?? "http://localhost:3300")
    );
  }
  const cfg = oidcConfig()!;
  const params = newStartParams();

  let target: string;
  try {
    target = await authorizationUrl(cfg, params);
  } catch (e) {
    const msg = e instanceof OidcError ? e.message : "Gagal menghubungi penyedia identitas.";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, cfg.appUrl));
  }

  const store = await cookies();
  store.set(OIDC_FLOW_COOKIE, JSON.stringify(params), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // "lax" bukan "strict": callback datang sebagai navigasi dari domain
    // penyedia identitas, dan "strict" akan menahan cookienya sehingga
    // state tidak pernah cocok.
    sameSite: "lax",
    maxAge: FLOW_TTL_SEC,
    path: "/",
  });

  return NextResponse.redirect(target);
}
