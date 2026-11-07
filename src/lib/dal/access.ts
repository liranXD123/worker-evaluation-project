import "server-only";
import { AuditAction, CycleStatus, EvaluationStatus, Role } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { forbidden, notFound, readOnly } from "@/lib/errors";
import {
  computeEvaluationPermissions,
  type EvaluationPermissions,
  type ViewerRelation,
} from "@/lib/domain/evaluation-state";
import { recordAudit } from "@/lib/dal/audit";
import type { CurrentUser } from "@/lib/dal/session";

/**
 * נקודת הכניסה היחידה לגישה לרשומת הערכה.
 *
 * קובעת את הקשר בין המשתמש להערכה:
 *  1. SELF    – evaluation.employeeId === user.id
 *  2. MANAGER – where: { employee: { managerId: user.id } } (בידוד היררכי – CLAUDE.md)
 *  3. ADMIN   – role === ADMIN
 * הסדר חשוב: מנהל מערכת שהוא גם המנהל הישיר מקבל קשר MANAGER, ולכן כפוף לחוק הסודיות.
 * אם אין קשר – NOT_FOUND (לא חושפים שהרשומה קיימת) + רישום ב-Audit.
 */

export const evaluationCoreSelect = {
  id: true,
  status: true,
  cycleId: true,
  employeeId: true,
  managerId: true,
  employeeStatus: true,
  managerStatus: true,
  employeeSubmittedAt: true,
  managerSubmittedAt: true,
  isHighPotential: true,
  cycle: {
    select: {
      id: true,
      name: true,
      year: true,
      status: true,
      templateId: true,
      selfAssessmentDueDate: true,
      managerAssessmentDueDate: true,
    },
  },
  employee: { select: { id: true, fullName: true, managerId: true } },
  feedbackMeeting: { select: { status: true } },
} satisfies Prisma.EvaluationSelect;

export type EvaluationCore = Prisma.EvaluationGetPayload<{ select: typeof evaluationCoreSelect }>;

export interface EvaluationAccess {
  evaluation: EvaluationCore;
  relation: ViewerRelation;
  permissions: EvaluationPermissions;
}

export function permissionsFor(evaluation: EvaluationCore, relation: ViewerRelation): EvaluationPermissions {
  return computeEvaluationPermissions({
    relation,
    status: evaluation.status,
    employeeStatus: evaluation.employeeStatus,
    managerStatus: evaluation.managerStatus,
    cycleStatus: evaluation.cycle.status,
    feedbackStatus: evaluation.feedbackMeeting?.status ?? null,
  });
}

export async function resolveEvaluationAccess(user: CurrentUser, evaluationId: string): Promise<EvaluationAccess> {
  const own = await prisma.evaluation.findFirst({
    where: { id: evaluationId, employeeId: user.id },
    select: evaluationCoreSelect,
  });
  if (own) return { evaluation: own, relation: "SELF", permissions: permissionsFor(own, "SELF") };

  if (user.role === Role.MANAGER || user.role === Role.ADMIN) {
    const managed = await prisma.evaluation.findFirst({
      where: { id: evaluationId, employee: { managerId: user.id } },
      select: evaluationCoreSelect,
    });
    if (managed) return { evaluation: managed, relation: "MANAGER", permissions: permissionsFor(managed, "MANAGER") };
  }

  if (user.role === Role.ADMIN) {
    const any = await prisma.evaluation.findUnique({ where: { id: evaluationId }, select: evaluationCoreSelect });
    if (any) return { evaluation: any, relation: "ADMIN", permissions: permissionsFor(any, "ADMIN") };
  }

  await recordAudit({
    action: AuditAction.ACCESS_DENIED,
    entityType: "Evaluation",
    entityId: evaluationId,
    actorId: user.id,
  });
  throw notFound("ההערכה");
}

/** דורש קשר מסוים ומחזיר שגיאה מתאימה אחרת */
export function assertRelation(access: EvaluationAccess, ...allowed: ViewerRelation[]): void {
  if (!allowed.includes(access.relation)) {
    throw forbidden();
  }
}

/**
 * מוודא שההרשאה הנדרשת קיימת.
 * הרשאות עריכה במחזור סגור/בארכיון → READ_ONLY; כל מקרה אחר → FORBIDDEN עם הסבר.
 */
export function assertPermission(
  access: EvaluationAccess,
  permission: keyof EvaluationPermissions,
  message: string,
): void {
  if (access.permissions[permission]) return;
  const isViewPermission = permission.startsWith("canView");
  const isReadOnly =
    access.evaluation.cycle.status !== CycleStatus.ACTIVE || access.evaluation.status === EvaluationStatus.ARCHIVED;
  if (!isViewPermission && isReadOnly) throw readOnly();
  throw forbidden(message);
}
