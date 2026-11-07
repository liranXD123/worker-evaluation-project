import "server-only";
import {
  AssessmentStatus,
  AuditAction,
  EvaluationStatus,
  NotificationType,
  Respondent,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { encryptNullable } from "@/lib/crypto";
import { conflict, validationError } from "@/lib/errors";
import { assertTransition } from "@/lib/domain/evaluation-state";
import { computeCategoryScores, computeWeightedScore } from "@/lib/domain/scoring";
import { notificationTemplates } from "@/lib/notifications/templates";
import { assertPermission, assertRelation, resolveEvaluationAccess, type EvaluationAccess } from "@/lib/dal/access";
import { recordAudit } from "@/lib/dal/audit";
import { buildDedupeKey, enqueueNotifications } from "@/lib/dal/notifications";
import {
  assertComplete,
  loadTemplateStructure,
  normalizeAnswers,
  questionsForRespondent,
  scoringInputs,
} from "@/lib/dal/questionnaire-data";
import { requireUser } from "@/lib/dal/session";
import {
  parseInput,
  saveAssessmentSchema,
  saveManagerAssessmentSchema,
  type AnswerInput,
} from "@/lib/validation/schemas";

/**
 * שמירה ושליחה של הערכה עצמית / הערכת מנהל (SPEC §4 שלבים 2–3).
 *
 * - שמירת טיוטה: עדכון תשובות + מעבר ל-IN_PROGRESS.
 * - שליחה: בדיקת שלמות, חישוב ציון משוקלל, נעילה (SUBMITTED), מעבר סטטוס, התראה, Audit.
 * - נעילה אופטימית: העדכון מותנה בסטטוס הנוכחי, כך ששתי שליחות מקבילות לא יעברו שתיהן.
 */

export interface SaveAssessmentResult {
  evaluationId: string;
  status: EvaluationStatus;
  submitted: boolean;
  weightedScore: number | null;
}

interface AssessmentCommand {
  evaluationId: string;
  answers: AnswerInput[];
  submit: boolean;
  isHighPotential?: boolean;
}

function assertCanEdit(access: EvaluationAccess, respondent: Respondent): void {
  if (respondent === Respondent.EMPLOYEE) {
    assertRelation(access, "SELF");
    assertPermission(access, "canEditSelfAssessment", "ההערכה העצמית כבר נשלחה ונעולה לעריכה.");
    return;
  }
  assertRelation(access, "MANAGER");
  const message =
    access.evaluation.employeeStatus !== AssessmentStatus.SUBMITTED
      ? "ניתן למלא הערכת מנהל רק לאחר שהעובד השלים את ההערכה העצמית."
      : "הערכת המנהל כבר נשלחה ונעולה לעריכה.";
  assertPermission(access, "canEditManagerAssessment", message);
}

function nextStatusFor(respondent: Respondent, current: EvaluationStatus, submit: boolean): EvaluationStatus {
  if (respondent === Respondent.EMPLOYEE) {
    if (submit) return EvaluationStatus.EMPLOYEE_COMPLETED;
    return current === EvaluationStatus.NOT_STARTED ? EvaluationStatus.EMPLOYEE_IN_PROGRESS : current;
  }
  if (submit) return EvaluationStatus.MANAGER_COMPLETED;
  return current === EvaluationStatus.EMPLOYEE_COMPLETED ? EvaluationStatus.MANAGER_IN_PROGRESS : current;
}

async function saveAssessment(
  respondent: Respondent,
  userId: string,
  access: EvaluationAccess,
  command: AssessmentCommand,
): Promise<SaveAssessmentResult> {
  const { evaluation } = access;
  const structure = await loadTemplateStructure(evaluation.cycle.templateId);
  const allowedQuestions = questionsForRespondent(structure, respondent);
  const answers = normalizeAnswers(allowedQuestions, command.answers);
  const isEmployee = respondent === Respondent.EMPLOYEE;
  const now = new Date();

  const currentStatus = evaluation.status;
  const nextStatus = nextStatusFor(respondent, currentStatus, command.submit);
  if (nextStatus !== currentStatus) assertTransition(currentStatus, nextStatus);

  return prisma.$transaction(async (tx) => {
    for (const answer of answers) {
      if (answer.score === null && answer.textAnswer === null) {
        await tx.answer.deleteMany({ where: { evaluationId: evaluation.id, questionId: answer.questionId, respondent } });
        continue;
      }
      const values = { score: answer.score, textAnswer: encryptNullable(answer.textAnswer), authorId: userId };
      await tx.answer.upsert({
        where: {
          evaluationId_questionId_respondent: { evaluationId: evaluation.id, questionId: answer.questionId, respondent },
        },
        create: { evaluationId: evaluation.id, questionId: answer.questionId, respondent, ...values },
        update: values,
      });
    }

    let weightedScore: number | null = null;
    if (command.submit) {
      const stored = await tx.answer.findMany({
        where: { evaluationId: evaluation.id, respondent },
        select: { questionId: true, score: true, textAnswer: true },
      });
      assertComplete(allowedQuestions, new Map(stored.map((row) => [row.questionId, row])));

      const { categories, questions } = scoringInputs(structure);
      const scoreMap = new Map(
        stored.filter((row) => row.score !== null).map((row) => [row.questionId, row.score as number]),
      );
      weightedScore = computeWeightedScore(computeCategoryScores(categories, questions, scoreMap));
      if (weightedScore === null) {
        throw validationError("לא ניתן לחשב ציון משוקלל – חסרים ציונים בחלק מהקטגוריות.");
      }
    }

    const assessmentStatus = command.submit ? AssessmentStatus.SUBMITTED : AssessmentStatus.DRAFT;
    const guard: Prisma.EvaluationWhereInput = isEmployee
      ? { employeeStatus: { not: AssessmentStatus.SUBMITTED } }
      : { employeeStatus: AssessmentStatus.SUBMITTED, managerStatus: { not: AssessmentStatus.SUBMITTED } };

    const data: Prisma.EvaluationUpdateManyMutationInput = isEmployee
      ? {
          status: nextStatus,
          employeeStatus: assessmentStatus,
          ...(currentStatus === EvaluationStatus.NOT_STARTED ? { employeeStartedAt: now } : {}),
          ...(command.submit ? { employeeSubmittedAt: now, employeeWeightedScore: weightedScore } : {}),
        }
      : {
          status: nextStatus,
          managerStatus: assessmentStatus,
          ...(currentStatus === EvaluationStatus.EMPLOYEE_COMPLETED ? { managerStartedAt: now } : {}),
          ...(command.submit
            ? { managerSubmittedAt: now, managerWeightedScore: weightedScore, comparisonUnlockedAt: now }
            : {}),
          ...(command.isHighPotential !== undefined ? { isHighPotential: command.isHighPotential } : {}),
        };

    const updated = await tx.evaluation.updateMany({
      where: { id: evaluation.id, status: currentStatus, ...guard },
      data,
    });
    if (updated.count !== 1) {
      throw conflict("ההערכה עודכנה במקביל או כבר נשלחה. רעננו את הדף ונסו שוב.");
    }

    const employeeName = evaluation.employee.fullName;
    const managerId = evaluation.employee.managerId ?? evaluation.managerId;

    if (command.submit && isEmployee) {
      await enqueueNotifications(tx, [
        {
          type: NotificationType.EMPLOYEE_SUBMITTED,
          recipientId: managerId,
          evaluationId: evaluation.id,
          cycleId: evaluation.cycleId,
          content: notificationTemplates.EMPLOYEE_SUBMITTED({ employeeName, evaluationId: evaluation.id }),
          dedupeKey: buildDedupeKey(evaluation.id, NotificationType.EMPLOYEE_SUBMITTED, managerId),
        },
      ]);
    }

    if (command.submit && !isEmployee) {
      const content = notificationTemplates.ASSESSMENTS_COMPLETED({ employeeName, evaluationId: evaluation.id });
      await enqueueNotifications(
        tx,
        [evaluation.employeeId, managerId].map((recipientId) => ({
          type: NotificationType.ASSESSMENTS_COMPLETED,
          recipientId,
          evaluationId: evaluation.id,
          cycleId: evaluation.cycleId,
          content,
        })),
      );
    }

    const action = isEmployee
      ? command.submit
        ? AuditAction.SELF_ASSESSMENT_SUBMITTED
        : AuditAction.SELF_ASSESSMENT_SAVED
      : command.submit
        ? AuditAction.MANAGER_ASSESSMENT_SUBMITTED
        : AuditAction.MANAGER_ASSESSMENT_SAVED;

    await recordAudit(
      {
        action,
        entityType: "Evaluation",
        entityId: evaluation.id,
        actorId: userId,
        metadata: {
          fromStatus: currentStatus,
          toStatus: nextStatus,
          answersChanged: answers.length,
          ...(weightedScore !== null ? { weightedScore } : {}),
        },
      },
      tx,
    );

    return { evaluationId: evaluation.id, status: nextStatus, submitted: command.submit, weightedScore };
  });
}

/** הערכה עצמית – העובד בלבד, על ההערכה של עצמו */
export async function saveSelfAssessment(rawInput: unknown): Promise<SaveAssessmentResult> {
  const user = await requireUser();
  const input = parseInput(saveAssessmentSchema, rawInput);
  const access = await resolveEvaluationAccess(user, input.evaluationId);
  assertCanEdit(access, Respondent.EMPLOYEE);
  return saveAssessment(Respondent.EMPLOYEE, user.id, access, input);
}

/** הערכת מנהל – המנהל הישיר בלבד, ורק לאחר שהעובד הגיש */
export async function saveManagerAssessment(rawInput: unknown): Promise<SaveAssessmentResult> {
  const user = await requireUser();
  const input = parseInput(saveManagerAssessmentSchema, rawInput);
  const access = await resolveEvaluationAccess(user, input.evaluationId);
  assertCanEdit(access, Respondent.MANAGER);
  return saveAssessment(Respondent.MANAGER, user.id, access, input);
}
