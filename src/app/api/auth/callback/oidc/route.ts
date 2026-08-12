import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { createSession } from "@/lib/session";
import { AUDIT_ACTIONS } from "@/lib/constants";
import { oidcConfig, oidcBlocker, exchangeCode, verifyIdToken, OidcError } from "@/lib/oidc";
import { callbackRejection, resolveAccount } from "@/lib/oidc-rules";
import { OIDC_FLOW_COOKIE } from "../../oidc/start/route";

// Titik balik dari penyedia identitas.
//
// Urutan pemeriksaannya sengaja dari yang paling murah dan paling menentukan:
// state (apakah kita yang memulai) → tukar kode → verifikasi tanda tangan →
// verifikasi isi → cocokkan akun. Tidak ada satu pun yang boleh dilewati,
// dan setiap kegagalan berhenti di situ.

function fail(appUrl: string, message: string): NextResponse {
  const res = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, appUrl));
  res.cookies.delete(OIDC_FLOW_COOKIE);
  return res;
}

export async function GET(req: NextRequest) {
  const fallbackUrl = process.env.APP_URL ?? "http://localhost:3300";
  const blocker = oidcBlocker();
  if (blocker) return fail(fallbackUrl, blocker);
  const cfg = oidcConfig()!;

  const store = await cookies();
  const raw = store.get(OIDC_FLOW_COOKIE)?.value;
  let flow: { state: string; nonce: string; codeVerifier: string } | null = null;
  if (raw) {
    try {
      flow = JSON.parse(raw);
    } catch {
      flow = null;
    }
  }

  const sp = req.nextUrl.searchParams;
  const rejection = callbackRejection(
    { state: sp.get("state"), code: sp.get("code"), error: sp.get("error") },
    flow ? { state: flow.state } : null
  );
  if (rejection || !flow) return fail(cfg.appUrl, rejection ?? "Permintaan login tidak dikenali.");

  // ── Tukar kode, verifikasi token ──────────────────────────────
  let identity;
  try {
    const tokens = await exchangeCode(cfg, sp.get("code")!, flow.codeVerifier);
    if (!tokens.id_token) return fail(cfg.appUrl, "Penyedia identitas tidak mengirimkan id_token.");
    identity = await verifyIdToken(cfg, tokens.id_token, flow.nonce);
  } catch (e) {
    const msg = e instanceof OidcError ? e.message : "Verifikasi identitas gagal.";
    await logAudit({
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      module: "auth",
      description: `Login OIDC gagal: ${msg}`,
    });
    return fail(cfg.appUrl, msg);
  }

  // ── Cocokkan ke akun CRM ──────────────────────────────────────
  const account = await db.user.findFirst({
    where: {
      OR: [
        { oidcSubject: identity.sub },
        { email: { equals: identity.email, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      isActive: true,
      frozenAt: true,
      oidcSubject: true,
      sessionEpoch: true,
    },
  });

  const resolved = resolveAccount({ sub: identity.sub, email: identity.email }, account);
  if (!resolved.ok) {
    await logAudit({
      userId: account?.id,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      module: "auth",
      description: `Login OIDC ditolak untuk ${identity.email}: ${resolved.error}`,
    });
    return fail(cfg.appUrl, resolved.error);
  }

  // Penautan pertama kali: setelah ini `sub` yang mengikat, bukan email.
  if (resolved.bindSubject) {
    await db.user.update({
      where: { id: resolved.userId },
      data: { oidcSubject: identity.sub },
    });
    await logAudit({
      userId: resolved.userId,
      action: "USER_OIDC_LINK",
      module: "auth",
      entityType: "User",
      entityId: resolved.userId,
      description: `Akun ${account!.username} ditautkan ke identitas terpusat (${identity.email})`,
    });
  }

  await createSession({
    userId: account!.id,
    username: account!.username,
    name: account!.name,
    epoch: account!.sessionEpoch,
  });
  await logAudit({
    userId: account!.id,
    action: AUDIT_ACTIONS.LOGIN,
    module: "auth",
    description: `${account!.name} login lewat penyedia identitas`,
  });

  const res = NextResponse.redirect(new URL("/dashboard", cfg.appUrl));
  res.cookies.delete(OIDC_FLOW_COOKIE);
  return res;
}
