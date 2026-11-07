import "server-only";
import { cache } from "react";
import { auth } from "@/auth";
import { AuditAction, Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { forbidden, unauthenticated } from "@/lib/errors";
import { recordAudit } from "@/lib/dal/audit";

export interface CurrentUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  departmentId: string;
  managerId: string | null;
}

/**
 * המשתמש המחובר, טעון מה-DB (לא מה-token) – פעם אחת לכל בקשה בזכות React cache.
 * משתמש מושבת מטופל כלא מחובר.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, email: true, role: true, departmentId: true, managerId: true, isActive: true },
  });
  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId,
    managerId: user.managerId,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthenticated();
  return user;
}

export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    await recordAudit({
      action: AuditAction.ACCESS_DENIED,
      entityType: "Role",
      actorId: user.id,
      metadata: { required: roles, actual: user.role },
    });
    throw forbidden();
  }
  return user;
}

export function requireAdmin(): Promise<CurrentUser> {
  return requireRole(Role.ADMIN);
}

/** מנהל = מי שיש לו כפיפים ישירים, בתפקיד MANAGER או ADMIN */
export function requireManagerRole(): Promise<CurrentUser> {
  return requireRole(Role.MANAGER, Role.ADMIN);
}
