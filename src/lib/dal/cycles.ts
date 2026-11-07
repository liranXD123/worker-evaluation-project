import "server-only";
import {
  AuditAction,
  CycleStatus,
  EvaluationStatus,
  NotificationType,
  Role,
} from "@/generated/prisma/enums";
import { isUniqueViolation, prisma } from "@/lib/db";
import { conflict, notFound, validationError } from "@/lib/errors";
import { CYCLE_STATUS_LABELS } from "@/lib/domain/evaluation-state";
import { notificationTemplates } from "@/lib/notifications/templates";
import { recordAudit } from "@/lib/dal/audit";
import { cancelPendingNotifications, enqueueNotifications } from "@/lib/dal/notifications";
import { requireAdmin, requireUser } from "@/lib/dal/session";
import { createCycleSchema, cycleRefSchema, parseInput } from "@/lib/validation/schemas";

/**
 * מחזורי הערכה (SPEC §4 שלבים 1, 7).
 * DRAFT → ACTIVE (פתיחה: יצירת הערכות + מייל פתיחה) → CLOSED (ארכיון, קריאה בלבד).
 */

export interface CycleDTO {
  id: string;
  name: string;
  year: number;
  status: CycleStatus;
  statusLabel: string;
  startDate: Date;
  selfAssessmentDueDate: Date;
  managerAssessmentDueDate: Date;
  endDate: Date;
  openedAt: Date | null;
  closedAt: Date | null;
  template: { id: string; name: string; version: number };
  participants: number;
  completed: number;
}

const cycleSelect = {
  id: true,
  name: true,
  year: true,
  status: true,
  startDate: true,
  selfAssessmentDueDate: true,
  managerAssessmentDueDate: true,
  endDate: true,
  openedAt: true,
  closedAt: true,
  template: { select: { id: true, name: true, version: true } },
  _count: { select: { evaluations: true } },
} as const;

/** המחזור הפעיל, ואם אין – האחרון שנפתח. לשימוש פנימי (ללא נתונים רגישים). */
export async function getCurrentOrLatestCycleId(): Promise<string | null> {
  const cycle = await prisma.reviewCycle.findFirst({
    where: { status: { in: [CycleStatus.ACTIVE, CycleStatus.CLOSED] } },
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
    select: { id: true },
  });
  return cycle?.id ?? null;
}

export async function listCycles(): Promise<CycleDTO[]> {
  const user = await requireUser();
  const cycles = await prisma.reviewCycle.findMany({
    where: user.role === Role.ADMIN ? {} : { status: { not: CycleStatus.DRAFT } },
    orderBy: { startDate: "desc" },
    select: cycleSelect,
  });
  const completedCounts = await prisma.evaluation.groupBy({
    by: ["cycleId"],
    where: { cycleId: { in: cycles.map((cycle) => cycle.id) }, completedAt: { not: null } },
    _count: { _all: true },
  });
  const completedByCycle = new Map(completedCounts.map((row) => [row.cycleId, row._count._all]));

  return cycles.map((cycle) => ({
    id: cycle.id,
    name: cycle.name,
    year: cycle.year,
    status: cycle.status,
    statusLabel: CYCLE_STATUS_LABELS[cycle.status],
    startDate: cycle.startDate,
    selfAssessmentDueDate: cycle.selfAssessmentDueDate,
    managerAssessmentDueDate: cycle.managerAssessmentDueDate,
    endDate: cycle.endDate,
    openedAt: cycle.openedAt,
    closedAt: cycle.closedAt,
    template: cycle.template,
    participants: cycle._count.evaluations,
    completed: completedByCycle.get(cycle.id) ?? 0,
  }));
}

export async function createCycle(rawInput: unknown): Promise<{ cycleId: string }> {
  const admin = await requireAdmin();
  const input = parseInput(createCycleSchema, rawInput);

  const template = await prisma.questionnaireTemplate.findUnique({
    where: { id: input.templateId },
    select: { id: true, categories: { select: { weight: true } } },
  });
  if (!template) throw notFound("השאלון");
  const totalWeight = template.categories.reduce((sum, category) => sum + category.weight, 0);
  if (template.categories.length === 0 || totalWeight !== 100) {
    throw validationError("השאלון שנבחר אינו תקין – סכום משקלי הקטגוריות חייב להיות 100%.");
  }

  try {
    const cycle = await prisma.reviewCycle.create({
      data: {
        name: input.name,
        year: input.year,
        templateId: input.templateId,
        startDate: input.startDate,
        selfAssessmentDueDate: input.selfAssessmentDueDate,
        managerAssessmentDueDate: input.managerAssessmentDueDate,
        endDate: input.endDate,
        status: CycleStatus.DRAFT,
        createdById: admin.id,
      },
      select: { id: true },
    });
    await recordAudit({
      action: AuditAction.CYCLE_CREATED,
      entityType: "ReviewCycle",
      entityId: cycle.id,
      actorId: admin.id,
      metadata: { name: input.name, year: input.year, templateId: input.templateId },
    });
    return { cycleId: cycle.id };
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict(`כבר קיים מחזור בשם "${input.name}" לשנת ${input.year}.`);
    throw error;
  }
}

/**
 * פתיחת מחזור: יוצרת הערכה לכל עובד פעיל שיש לו מנהל ישיר פעיל, נועלת את השאלון
 * ומכניסה לתור מייל פתיחה (יום 0) לכל משתתף.
 */
export async function openCycle(rawInput: unknown): Promise<{ cycleId: string; participants: number }> {
  const admin = await requireAdmin();
  const { cycleId } = parseInput(cycleRefSchema, rawInput);

  const cycle = await prisma.reviewCycle.findUnique({
    where: { id: cycleId },
    select: { id: true, name: true, year: true, status: true, templateId: true, selfAssessmentDueDate: true },
  });
  if (!cycle) throw notFound("מחזור ההערכה");
  if (cycle.status !== CycleStatus.DRAFT) throw conflict("ניתן לפתוח רק מחזור במצב טיוטה.");

  const otherActive = await prisma.reviewCycle.findFirst({
    where: { status: CycleStatus.ACTIVE, id: { not: cycleId } },
    select: { name: true, year: true },
  });
  if (otherActive) {
    throw conflict(`קיים מחזור פעיל (${otherActive.name} ${otherActive.year}). יש לסגור אותו לפני פתיחת מחזור חדש.`);
  }

  const candidates = await prisma.user.findMany({
    where: { isActive: true, managerId: { not: null }, manager: { isActive: true } },
    select: { id: true, fullName: true, managerId: true },
  });
  const participants = candidates.filter(
    (candidate): candidate is typeof candidate & { managerId: string } => candidate.managerId !== null,
  );
  if (participants.length === 0) {
    throw validationError("אין עובדים פעילים עם מנהל ישיר – לא ניתן לפתוח מחזור.");
  }
  const nameById = new Map(participants.map((participant) => [participant.id, participant.fullName]));
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const opened = await tx.reviewCycle.updateMany({
      where: { id: cycleId, status: CycleStatus.DRAFT },
      data: { status: CycleStatus.ACTIVE, openedAt: now },
    });
    if (opened.count !== 1) throw conflict("המחזור עודכן במקביל. רעננו את הדף ונסו שוב.");

    await tx.questionnaireTemplate.update({ where: { id: cycle.templateId }, data: { isLocked: true } });

    await tx.evaluation.createMany({
      data: participants.map((participant) => ({
        cycleId,
        employeeId: participant.id,
        managerId: participant.managerId,
      })),
      skipDuplicates: true,
    });

    const evaluations = await tx.evaluation.findMany({ where: { cycleId }, select: { id: true, employeeId: true } });
    await enqueueNotifications(
      tx,
      evaluations.map((evaluation) => ({
        type: NotificationType.CYCLE_OPENED,
        recipientId: evaluation.employeeId,
        evaluationId: evaluation.id,
        cycleId,
        content: notificationTemplates.CYCLE_OPENED({
          employeeName: nameById.get(evaluation.employeeId) ?? "",
          cycleName: cycle.name,
          year: cycle.year,
          dueDate: cycle.selfAssessmentDueDate,
          evaluationId: evaluation.id,
        }),
      })),
    );

    await recordAudit(
      {
        action: AuditAction.CYCLE_OPENED,
        entityType: "ReviewCycle",
        entityId: cycleId,
        actorId: admin.id,
        metadata: { participants: participants.length },
      },
      tx,
    );
  });

  return { cycleId, participants: participants.length };
}

/**
 * סגירת מחזור: כל ההערכות עוברות ל-ARCHIVED, התראות שטרם נשלחו מבוטלות,
 * והמחזור הופך לקריאה בלבד (נאכף ב-computeEvaluationPermissions).
 */
export async function closeCycle(rawInput: unknown): Promise<{ cycleId: string; archived: number }> {
  const admin = await requireAdmin();
  const { cycleId } = parseInput(cycleRefSchema, rawInput);

  const cycle = await prisma.reviewCycle.findUnique({ where: { id: cycleId }, select: { status: true } });
  if (!cycle) throw notFound("מחזור ההערכה");
  if (cycle.status !== CycleStatus.ACTIVE) throw conflict("ניתן לסגור רק מחזור פעיל.");

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const breakdown = await tx.evaluation.groupBy({
      by: ["status"],
      where: { cycleId },
      _count: { _all: true },
    });

    const closed = await tx.reviewCycle.updateMany({
      where: { id: cycleId, status: CycleStatus.ACTIVE },
      data: { status: CycleStatus.CLOSED, closedAt: now, closedById: admin.id },
    });
    if (closed.count !== 1) throw conflict("המחזור עודכן במקביל. רעננו את הדף ונסו שוב.");

    const archived = await tx.evaluation.updateMany({
      where: { cycleId, status: { not: EvaluationStatus.ARCHIVED } },
      data: { status: EvaluationStatus.ARCHIVED, archivedAt: now },
    });

    const cancelled = await cancelPendingNotifications(tx, { cycleId });

    await recordAudit(
      {
        action: AuditAction.CYCLE_CLOSED,
        entityType: "ReviewCycle",
        entityId: cycleId,
        actorId: admin.id,
        metadata: {
          archived: archived.count,
          cancelledNotifications: cancelled,
          statusBeforeClose: Object.fromEntries(breakdown.map((row) => [row.status, row._count._all])),
        },
      },
      tx,
    );

    return { cycleId, archived: archived.count };
  });
}
