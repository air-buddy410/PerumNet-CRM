import { headers } from "next/headers";
import { db } from "@/lib/db";

// Audit log bersifat append-only: satu-satunya operasi yang tersedia adalah
// pencatatan. Tidak ada fungsi update/delete — sesuai PRD §51.

export interface AuditEntry {
  userId?: string | null;
  action: string;
  module: string;
  entityType?: string;
  entityId?: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  let ipAddress: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ipAddress =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
    userAgent = h.get("user-agent");
  } catch {
    // di luar request context (mis. seed) — abaikan
  }

  await db.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      module: entry.module,
      entityType: entry.entityType,
      entityId: entry.entityId,
      description: entry.description,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      ipAddress,
      userAgent,
    },
  });
}
