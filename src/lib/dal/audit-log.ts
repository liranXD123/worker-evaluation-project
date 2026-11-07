import "server-only";
import type { AuditAction } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/dal/session";

/** צפייה ביומן הפעולות (Audit Log) – מנהל מערכת בלבד */

export interface AuditLogRowDTO {
  id: string;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  actorName: string | null;
  ipAddress: string | null;
  createdAt: Date;
}

export async function listAuditLog(options: { limit?: number; action?: AuditAction } = {}): Promise<AuditLogRowDTO[]> {
  await requireAdmin();
  const rows = await prisma.auditLog.findMany({
    where: options.action ? { action: options.action } : {},
    orderBy: { createdAt: "desc" },
    take: Math.min(options.limit ?? 200, 1000),
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      ipAddress: true,
      createdAt: true,
      actor: { select: { fullName: true } },
    },
  });
  return rows.map(({ actor, ...row }) => ({ ...row, actorName: actor?.fullName ?? null }));
}
