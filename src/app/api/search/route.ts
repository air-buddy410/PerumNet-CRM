import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/rbac";
import { searchEntities, SEARCH_LIMIT_TOTAL } from "@/lib/search";

// Endpoint pencarian entity (PRD Frontend §13).
// Read-only, permission-scoped, dan tidak pernah mengembalikan tautan luar.

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const results = await searchEntities(user, q, SEARCH_LIMIT_TOTAL);

  return NextResponse.json(
    { results },
    {
      headers: {
        // Hasil pencarian bergantung pada izin pemanggil — tidak boleh
        // tersimpan di cache bersama dan terbaca akun lain.
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}
