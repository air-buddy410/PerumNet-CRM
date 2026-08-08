import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/rbac";
import { attachmentPath } from "@/lib/files";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const attachment = await db.attachment.findUnique({ where: { id } });
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  try {
    const data = await readFile(attachmentPath(attachment.storedName));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.filename)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("File hilang dari storage", { status: 410 });
  }
}
