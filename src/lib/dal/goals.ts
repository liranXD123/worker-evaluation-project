import "server-only";
import { AuditAction, GoalStatus } from "@/generated/prisma/enums";
import { prisma, type DbClient } from "@/lib/db";
import { validationError } from "@/lib/errors";
import { assertPermission, assertRelation, resolveEvaluationAccess } from "@/lib/dal/access";
import { recordAudit } from "@/lib/dal/audit";
import { requireUser } from "@/lib/dal/session";
import { MAX_GOALS, MIN_GOALS, parseInput, saveGoalsSchema } from "@/lib/validation/schemas";

/** יעדים לשנה הבאה (SPEC §4 שלב 6): 3–5 יעדים, סכום משקלים 100%. */

export interface GoalDTO {
  id: string;
  title: string;
  description: string;
  kpi: string;
  weight: number;
  dueDate: Date;
  status: GoalStatus;
  progress: number;
  order: number;
}

const goalSelect = {
  id: true,
  title: true,
  description: true,
  kpi: true,
  weight: true,
  dueDate: true,
  status: true,
  progress: true,
  order: true,
} as const;

export async function getGoals(evaluationId: string): Promise<GoalDTO[]> {
  const user = await requireUser();
  const access = await resolveEvaluationAccess(user, evaluationId);
  assertPermission(access, "canViewGoals", "היעדים יהיו זמינים לצפייה לאחר אישור סיכום שיחת המשוב.");
  return prisma.goal.findMany({ where: { evaluationId }, orderBy: { order: "asc" }, select: goalSelect });
}

/** מחליף את כל היעדים של ההערכה (מותר עד לאישור סיכום השיחה). */
export async function saveGoals(rawInput: unknown): Promise<GoalDTO[]> {
  const user = await requireUser();
  const input = parseInput(saveGoalsSchema, rawInput);
  const access = await resolveEvaluationAccess(user, input.evaluationId);
  assertRelation(access, "MANAGER");
  assertPermission(access, "canEditGoals", "ניתן להגדיר יעדים רק לאחר הגשת הערכת המנהל ועד לאישור סיכום השיחה.");
  const { evaluation } = access;

  const cycle = await prisma.reviewCycle.findUniqueOrThrow({ where: { id: evaluation.cycleId }, select: { startDate: true } });
  const invalidDates = input.goals
    .map((goal, index) => ({ goal, index }))
    .filter(({ goal }) => goal.dueDate <= cycle.startDate);
  if (invalidDates.length > 0) {
    throw validationError(
      "תאריך היעד חייב להיות אחרי תחילת מחזור ההערכה.",
      Object.fromEntries(invalidDates.map(({ index }) => [`goals.${index}.dueDate`, ["תאריך היעד מוקדם מדי"]])),
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.goal.deleteMany({ where: { evaluationId: evaluation.id } });
    await tx.goal.createMany({
      data: input.goals.map((goal, index) => ({
        evaluationId: evaluation.id,
        cycleId: evaluation.cycleId,
        employeeId: evaluation.employeeId,
        createdById: user.id,
        title: goal.title,
        description: goal.description,
        kpi: goal.kpi,
        weight: goal.weight,
        dueDate: goal.dueDate,
        status: GoalStatus.NOT_STARTED,
        progress: 0,
        order: index + 1,
      })),
    });
    await recordAudit(
      {
        action: AuditAction.GOAL_UPDATED,
        entityType: "Evaluation",
        entityId: evaluation.id,
        actorId: user.id,
        metadata: { goals: input.goals.map((goal) => ({ title: goal.title, weight: goal.weight })) },
      },
      tx,
    );
    return tx.goal.findMany({ where: { evaluationId: evaluation.id }, orderBy: { order: "asc" }, select: goalSelect });
  });
}

/** בדיקה לפני אישור סיכום שיחה: 3–5 יעדים וסכום משקלים 100. */
export async function assertGoalsReady(db: DbClient, evaluationId: string): Promise<void> {
  const goals = await db.goal.findMany({ where: { evaluationId }, select: { weight: true } });
  if (goals.length < MIN_GOALS || goals.length > MAX_GOALS) {
    throw validationError(`יש להגדיר בין ${MIN_GOALS} ל-${MAX_GOALS} יעדים לפני אישור הסיכום (מוגדרים כעת ${goals.length}).`);
  }
  const total = goals.reduce((sum, goal) => sum + goal.weight, 0);
  if (total !== 100) {
    throw validationError(`סכום משקלי היעדים חייב להיות 100% (כרגע ${total}%).`);
  }
}
