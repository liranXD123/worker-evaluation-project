import "server-only";
import { headers } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import type { AuditAction } from "@/generated/prisma/enums";
import { prisma, type DbClient } from "@/lib/db";

/**
 * Audit Log (SPEC §8): מי ביצע, איזו פעולה, על איזו ישות, מתי ומאיזו כתובת IP.
 * רשומות append-only – אין פונקציית עדכון/מחיקה.
 */

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

/** קורא IP ו-User-Agent מהבקשה הנוכחית. מחוץ להקשר בקשה (Cron, seed) מחזיר null. */
export async function getRequestContext(): Promise<RequestContext> {
  try {
    const requestHeaders = await headers();
    const forwardedFor = requestHeaders.get("x-forwarded-for");
    const ipAddress = forwardedFor?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || null;
    return { ipAddress, userAgent: requestHeaders.get("user-agent")?.slice(0, 500) ?? null };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

export interface AuditEntry {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  /** null = פעולת מערכת */
  actorId: string | null;
  metadata?: Prisma.InputJsonValue;
}

export async function recordAudit(entry: AuditEntry, db: DbClient = prisma): Promise<void> {
  const context = await getRequestContext();
  await db.auditLog.create({
    data: {
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      actorId: entry.actorId,
      metadata: entry.metadata,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    },
  });
}
