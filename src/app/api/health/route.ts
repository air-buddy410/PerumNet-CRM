import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// ── Health check (Fase 57) ──────────────────────────────────────
//
// Dipakai Docker dan pengatur beban untuk memutuskan apakah kontainer ini
// layak menerima lalu lintas.
//
// Databasenya IKUT DIPERIKSA, dan itu disengaja. Proses Node yang hidup tapi
// tidak bisa menyentuh database akan menjawab setiap permintaan dengan galat —
// dan health check yang cuma bilang "proses jalan" akan menyatakannya sehat
// sepanjang hari. Kueri yang dipakai sesederhana mungkin: satu SELECT 1.
//
// Isinya sengaja hampa. Jalur ini terbuka tanpa login, jadi ia tidak boleh
// menyebut versi, nama host, jumlah data, atau apa pun yang menolong orang
// yang sedang memetakan sistem ini dari luar.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { status: "unhealthy" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
