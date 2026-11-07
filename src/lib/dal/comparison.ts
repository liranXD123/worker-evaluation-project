import "server-only";
import { AuditAction, QuestionAudience, QuestionType, Respondent } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { decryptNullable } from "@/lib/crypto";
import { buildComparison, type ComparisonResult } from "@/lib/domain/scoring";
import { assertPermission, resolveEvaluationAccess } from "@/lib/dal/access";
import { recordAudit } from "@/lib/dal/audit";
import { loadTemplateStructure, scoringInputs } from "@/lib/dal/questionnaire-data";
import { requireUser } from "@/lib/dal/session";

/**
 * דוח השוואתי (SPEC §4 שלב 4): נפתח רק כששני השאלונים הוגשו.
 * מנהל ישיר / HR – מיד לאחר הגשת המנהל; עובד – לאחר אישור סיכום שיחת המשוב.
 */

export interface OpenAnswerComparison {
  questionId: string;
  text: string;
  audience: QuestionAudience;
  employeeAnswer: string | null;
  managerAnswer: string | null;
}

export interface ComparisonReportDTO extends ComparisonResult {
  evaluationId: string;
  cycle: { id: string; name: string; year: number };
  employee: { id: string; fullName: string; jobTitle: string; department: string };
  manager: { id: string; fullName: string };
  employeeSubmittedAt: Date | null;
  managerSubmittedAt: Date | null;
  openAnswers: OpenAnswerComparison[];
}

export async function getComparisonReport(evaluationId: string): Promise<ComparisonReportDTO> {
  const user = await requireUser();
  const access = await resolveEvaluationAccess(user, evaluationId);
  assertPermission(
    access,
    "canViewComparison",
    access.relation === "SELF"
      ? "הדוח ההשוואתי יהיה זמין לאחר אישור סיכום שיחת המשוב."
      : "הדוח ההשוואתי ייפתח רק לאחר שגם העובד וגם המנהל השלימו את ההערכות.",
  );
  const { evaluation } = access;

  const [structure, answers, people] = await Promise.all([
    loadTemplateStructure(evaluation.cycle.templateId),
    prisma.answer.findMany({
      where: { evaluationId: evaluation.id },
      select: { questionId: true, respondent: true, score: true, textAnswer: true },
    }),
    prisma.evaluation.findUniqueOrThrow({
      where: { id: evaluation.id },
      select: {
        employee: { select: { id: true, fullName: true, jobTitle: true, department: { select: { name: true } } } },
        manager: { select: { id: true, fullName: true } },
      },
    }),
  ]);

  const employeeScores = new Map<string, number>();
  const managerScores = new Map<string, number>();
  const employeeTexts = new Map<string, string | null>();
  const managerTexts = new Map<string, string | null>();

  for (const answer of answers) {
    const isEmployee = answer.respondent === Respondent.EMPLOYEE;
    if (answer.score !== null) (isEmployee ? employeeScores : managerScores).set(answer.questionId, answer.score);
    if (answer.textAnswer !== null) (isEmployee ? employeeTexts : managerTexts).set(answer.questionId, decryptNullable(answer.textAnswer));
  }

  const { categories, questions } = scoringInputs(structure);
  const comparison = buildComparison(categories, questions, employeeScores, managerScores);

  await recordAudit({
    action: AuditAction.COMPARISON_VIEWED,
    entityType: "Evaluation",
    entityId: evaluation.id,
    actorId: user.id,
    metadata: { relation: access.relation },
  });

  return {
    ...comparison,
    evaluationId: evaluation.id,
    cycle: { id: evaluation.cycle.id, name: evaluation.cycle.name, year: evaluation.cycle.year },
    employee: {
      id: people.employee.id,
      fullName: people.employee.fullName,
      jobTitle: people.employee.jobTitle,
      department: people.employee.department.name,
    },
    manager: people.manager,
    employeeSubmittedAt: evaluation.employeeSubmittedAt,
    managerSubmittedAt: evaluation.managerSubmittedAt,
    openAnswers: structure.questions
      .filter((question) => question.type === QuestionType.OPEN_TEXT)
      .map((question) => ({
        questionId: question.id,
        text: question.text,
        audience: question.audience,
        employeeAnswer: employeeTexts.get(question.id) ?? null,
        managerAnswer: managerTexts.get(question.id) ?? null,
      })),
  };
}
