import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ingestMonitoringAlert, type MonitoringAlert } from "@/lib/integrations";
import { ingestGatewayEvent, type GatewayEvent } from "@/lib/payments";

// Inbound webhook integrasi (PRD §30–31, §56; DESIGN-PHASE-8 §3.2).
// Autentikasi: header `x-webhook-token` (atau ?token=) per-integrasi.
// Dispatch berdasarkan kategori integrasi:
//  - NETWORK        → alert monitoring → alarm otomatis
//    { status?: "FIRING"|"RESOLVED", severity?, message, deviceHostname?,
//      siteCode?, dedupKey? }
//  - CRM_CUSTOMER   → event payment gateway → pembayaran bundle
//    { bundleRef, status: "PAID"|"EXPIRED"|"CANCELLED"|"FAILED", feeAmount? }

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
): Promise<NextResponse> {
  const { code } = await context.params;
  const token =
    request.headers.get("x-webhook-token") ??
    request.nextUrl.searchParams.get("token");

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body harus JSON." }, { status: 400 });
  }

  const integration = await db.integration.findUnique({
    where: { code: code.toLowerCase() },
    select: { category: true },
  });
  if (!integration) {
    return NextResponse.json({ ok: false, error: "Integrasi tidak ditemukan." }, { status: 404 });
  }

  const result =
    integration.category === "CRM_CUSTOMER"
      ? await ingestGatewayEvent(code, token, payload as GatewayEvent)
      : await ingestMonitoringAlert(code, token, payload as MonitoringAlert);

  if (!result.ok) {
    const status = result.error.includes("Token")
      ? 401
      : result.error.includes("ditemukan")
        ? 404
        : 422;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, ...result.data });
}
