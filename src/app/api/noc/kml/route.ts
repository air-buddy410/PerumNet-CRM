import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { exportOdpKml } from "@/lib/ftth-kml";

// Ekspor KML sebagai unduhan. Route ini berada di balik middleware JWT,
// dan permission tetap diperiksa di sini — guard sesi bukan pengganti RBAC.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }
  if (!user.permissions.has(PERMISSIONS.NOC_VIEW)) {
    return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  }

  const siteId = new URL(request.url).searchParams.get("site");
  const kml = await exportOdpKml(siteId);
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(kml, {
    headers: {
      "Content-Type": "application/vnd.google-earth.kml+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="perumnet-odp-${stamp}.kml"`,
      "Cache-Control": "no-store",
    },
  });
}
