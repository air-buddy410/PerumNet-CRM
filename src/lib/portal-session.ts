// ── Sesi portal pelanggan (Fase 87) ─────────────────────────────
//
// TERPISAH PENUH dari sesi staf: nama cookie sendiri, rahasia sendiri, muatan
// sendiri, masa berlaku sendiri.
//
// Kenapa tidak menumpang `session.ts`: kalau keduanya memakai cookie dan
// rahasia yang sama, sebuah token pelanggan yang sah secara kriptografis akan
// lolos verifikasi di jalur staf. Yang menahannya tinggal pemeriksaan bentuk
// muatan — satu baris yang bisa hilang saat seseorang merapikan kode setahun
// dari sekarang. Pemisahan rahasia membuat kekeliruan itu mustahil, bukan
// sekadar tidak terjadi.

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const PORTAL_COOKIE = "perumnet_portal";
/** Lebih panjang dari sesi staf: pelanggan membuka portal sesekali, bukan tiap hari. */
const PORTAL_HARI = 30;

function secretKey(): Uint8Array {
  // Rahasia SENDIRI. Kalau belum diatur, portal tidak berjalan — bukan
  // diam-diam memakai rahasia staf sebagai cadangan.
  const secret = process.env.PORTAL_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "PORTAL_SESSION_SECRET belum diatur (minimal 32 karakter). Portal pelanggan sengaja tidak memakai SESSION_SECRET staf."
    );
  }
  return new TextEncoder().encode(secret);
}

export interface PortalSession {
  accountId: string;
  customerId: string;
  loginName: string;
  /** Dicocokkan dengan `CustomerAccount.sessionEpoch`; beda = diusir. */
  epoch: number;
}

export async function createPortalSession(payload: PortalSession): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PORTAL_HARI}d`)
    .sign(secretKey());

  const store = await cookies();
  store.set(PORTAL_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PORTAL_HARI * 24 * 60 * 60,
  });
}

export async function getPortalSession(): Promise<PortalSession | null> {
  const store = await cookies();
  const token = store.get(PORTAL_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const p = payload as unknown as PortalSession;
    // Bentuk muatan tetap diperiksa meski rahasianya sudah terpisah — dua
    // lapis, sebab yang satu menjaga dari kekeliruan konfigurasi dan yang lain
    // dari token yang bentuknya berubah antar versi.
    if (!p.accountId || !p.customerId || typeof p.epoch !== "number") return null;
    return p;
  } catch {
    return null;
  }
}

export async function destroyPortalSession(): Promise<void> {
  const store = await cookies();
  store.delete(PORTAL_COOKIE);
}

export { PORTAL_COOKIE };
