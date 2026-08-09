import { NextRequest, NextResponse } from "next/server";
import { ingestMonitoringAlert, type MonitoringAlert } from "@/lib/integrations";

// Inbound webhook monitoring (PRD §30–31, §56).
// Autentikasi: header `x-webhook-token` (atau ?token=) yang cocok dengan
// token integrasi. Payload generik:
//   { status?: "FIRING"|"RESOLVED", severity?, message, deviceHostname?,
//     siteCode?, dedupKey? }

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
): Promise<NextResponse> {
  const { code } = await context.params;
  const token =
    request.headers.get("x-webhook-token") ??
    request.nextUrl.searchParams.get("token");

  let payload: MonitoringAlert;
  try {
    payload = (await request.json()) as MonitoringAlert;
  } catch {
    return NextResponse.json({ ok: false, error: "Body harus JSON." }, { status: 400 });
  }

  const result = await ingestMonitoringAlert(code, token, payload);
  if (!result.ok) {
    const status = result.error.includes("Token") ? 401 : result.error.includes("ditemukan") ? 404 : 422;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, ...result.data });
}
