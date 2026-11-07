import "server-only";
import {
  AssessmentStatus,
  EvaluationStatus,
  FeedbackMeetingStatus,
  Respondent,
  type CycleStatus,
} from "@/generated/prisma/enums";
import { decimalToNumber, prisma } from "@/lib/db";
import { decryptNullable } from "@/lib/crypto";
import { EVALUATION_STATUS_LABELS, type EvaluationPermissions, type ViewerRelation } from "@/lib/domain/evaluation-state";
import { resolveEvaluationAccess } from "@/lib/dal/access";
import { getCurrentOrLatestCycleId } from "@/lib/dal/cycles";
import {
  loadTemplateStructure,
  questionsForRespondent,
  type CategoryDTO,
  type QuestionDTO,
} from "@/lib/dal/questionnaire-data";
import { requireManagerRole, requireUser } from "@/lib/dal/session";

/**
 * קריאת הערכות.
 *
 * חוק הסודיות (Blind Assessment) נאכף כאן ברמת השאילתה:
 *  - תשובות/ציון העובד לא נשלפים מה-DB עבור מנהל כל עוד managerStatus !== SUBMITTED.
 *  - תשובות/ציון המנהל לא נשלפים עבור העובד כל עוד סיכום שיחת המשוב לא אושר.
 */

export interface AnswerDTO {
  questionId: string;
  score: number | null;
  textAnswer: string | null;
}

export interface EvaluationDetailDTO {
  id: string;
  status: EvaluationStatus;
  statusLabel: string;
  relation: ViewerRelation;
  permissions: EvaluationPermissions;
  cycle: {
    id: string;
    name: string;
    year: number;
    status: CycleStatus;
    selfAssessmentDueDate: Date;
    managerAssessmentDueDate: Date;
  };
  employee: { id: string; fullName: string; jobTitle: string; employeeNumber: string; department: string };
  manager: { id: string; fullName: string };
  employeeStatus: AssessmentStatus;
  managerStatus: AssessmentStatus;
  employeeSubmittedAt: Date | null;
  managerSubmittedAt: Date | null;
  comparisonUnlockedAt: Date | null;
  completedAt: Date | null;
  /** null כשהציון מוסתר מהצופה או טרם חושב */
  employeeWeightedScore: number | null;
  managerWeightedScore: number | null;
  /** מוסתר מהעובד עצמו */
  isHighPotential: boolean | null;
  categories: CategoryDTO[];
  /** השאלות הרלוונטיות לצופה (עובד רואה רק שאלות לעובד) */
  questions: QuestionDTO[];
  /** null = מוסתר לפי חוק הסודיות */
  employeeAnswers: AnswerDTO[] | null;
  managerAnswers: AnswerDTO[] | null;
}

function toAnswerDTO(answer: { questionId: string; score: number | null; textAnswer: string | null }): AnswerDTO {
  return { questionId: answer.questionId, score: answer.score, textAnswer: decryptNullable(answer.textAnswer) };
}

export async function getEvaluationDetail(evaluationId: string): Promise<EvaluationDetailDTO> {
  const user = await requireUser();
  const { evaluation, relation, permissions } = await resolveEvaluationAccess(user, evaluationId);

  const visibleRespondents: Respondent[] = [
    ...(permissions.canViewEmployeeAnswers ? [Respondent.EMPLOYEE] : []),
    ...(permissions.canViewManagerAnswers ? [Respondent.MANAGER] : []),
  ];

  const [details, structure, answers] = await Promise.all([
    prisma.evaluation.findUniqueOrThrow({
      where: { id: evaluation.id },
      select: {
        comparisonUnlockedAt: true,
        completedAt: true,
        employeeWeightedScore: permissions.canViewEmployeeAnswers,
        managerWeightedScore: permissions.canViewManagerAnswers,
        employee: {
          select: { id: true, fullName: true, jobTitle: true, employeeNumber: true, department: { select: { name: true } } },
        },
        manager: { select: { id: true, fullName: true } },
      },
    }),
    loadTemplateStructure(evaluation.cycle.templateId),
    visibleRespondents.length > 0
      ? prisma.answer.findMany({
          where: { evaluationId: evaluation.id, respondent: { in: visibleRespondents } },
          select: { questionId: true, respondent: true, score: true, textAnswer: true },
        })
      : Promise.resolve([]),
  ]);

  const questions = relation === "SELF" ? questionsForRespondent(structure, Respondent.EMPLOYEE) : structure.questions;

  return {
    id: evaluation.id,
    status: evaluation.status,
    statusLabel: EVALUATION_STATUS_LABELS[evaluation.status],
    relation,
    permissions,
    cycle: {
      id: evaluation.cycle.id,
      name: evaluation.cycle.name,
      year: evaluation.cycle.year,
      status: evaluation.cycle.status,
      selfAssessmentDueDate: evaluation.cycle.selfAssessmentDueDate,
      managerAssessmentDueDate: evaluation.cycle.managerAssessmentDueDate,
    },
    employee: {
      id: details.employee.id,
      fullName: details.employee.fullName,
      jobTitle: details.employee.jobTitle,
      employeeNumber: details.employee.employeeNumber,
      department: details.employee.department.name,
    },
    manager: details.manager,
    employeeStatus: evaluation.employeeStatus,
    managerStatus: evaluation.managerStatus,
    employeeSubmittedAt: evaluation.employeeSubmittedAt,
    managerSubmittedAt: evaluation.managerSubmittedAt,
    comparisonUnlockedAt: details.comparisonUnlockedAt,
    completedAt: details.completedAt,
    employeeWeightedScore: permissions.canViewEmployeeAnswers ? decimalToNumber(details.employeeWeightedScore) : null,
    managerWeightedScore: permissions.canViewManagerAnswers ? decimalToNumber(details.managerWeightedScore) : null,
    isHighPotential: relation === "SELF" ? null : evaluation.isHighPotential,
    categories: structure.categories,
    questions,
    employeeAnswers: permissions.canViewEmployeeAnswers
      ? answers.filter((answer) => answer.respondent === Respondent.EMPLOYEE).map(toAnswerDTO)
      : null,
    managerAnswers: permissions.canViewManagerAnswers
      ? answers.filter((answer) => answer.respondent === Respondent.MANAGER).map(toAnswerDTO)
      : null,
  };
}

// -----------------------------------------------------------------------------
// ההערכות שלי (היסטוריה רב-שנתית)
// -----------------------------------------------------------------------------

export interface MyEvaluationSummaryDTO {
  id: string;
  status: EvaluationStatus;
  statusLabel: string;
  cycle: { id: string; name: string; year: number; status: CycleStatus; selfAssessmentDueDate: Date };
  employeeStatus: AssessmentStatus;
  employeeWeightedScore: number | null;
  /** מוצג רק לאחר אישור סיכום השיחה */
  managerWeightedScore: number | null;
  feedbackStatus: FeedbackMeetingStatus | null;
}

const PUBLISHED_FEEDBACK: FeedbackMeetingStatus[] = [FeedbackMeetingStatus.APPROVED, FeedbackMeetingStatus.ACKNOWLEDGED];

export async function listMyEvaluations(): Promise<MyEvaluationSummaryDTO[]> {
  const user = await requireUser();

  const evaluations = await prisma.evaluation.findMany({
    where: { employeeId: user.id },
    orderBy: { cycle: { startDate: "desc" } },
    select: {
      id: true,
      status: true,
      employeeStatus: true,
      employeeWeightedScore: true,
      cycle: { select: { id: true, name: true, year: true, status: true, selfAssessmentDueDate: true } },
      feedbackMeeting: { select: { status: true } },
    },
  });

  const publishedIds = evaluations
    .filter((evaluation) => evaluation.feedbackMeeting && PUBLISHED_FEEDBACK.includes(evaluation.feedbackMeeting.status))
    .map((evaluation) => evaluation.id);

  const managerScores = publishedIds.length
    ? await prisma.evaluation.findMany({
        where: { id: { in: publishedIds }, employeeId: user.id, feedbackMeeting: { status: { in: PUBLISHED_FEEDBACK } } },
        select: { id: true, managerWeightedScore: true },
      })
    : [];
  const managerScoreById = new Map(managerScores.map((row) => [row.id, decimalToNumber(row.managerWeightedScore)]));

  return evaluations.map((evaluation) => ({
    id: evaluation.id,
    status: evaluation.status,
    statusLabel: EVALUATION_STATUS_LABELS[evaluation.status],
    cycle: evaluation.cycle,
    employeeStatus: evaluation.employeeStatus,
    employeeWeightedScore: decimalToNumber(evaluation.employeeWeightedScore),
    managerWeightedScore: managerScoreById.get(evaluation.id) ?? null,
    feedbackStatus: evaluation.feedbackMeeting?.status ?? null,
  }));
}

// -----------------------------------------------------------------------------
// הצוות שלי (מנהל) – כפיפים ישירים בלבד
// -----------------------------------------------------------------------------

export type ManagerPendingAction =
  | "WAITING_FOR_EMPLOYEE"
  | "FILL_MANAGER_ASSESSMENT"
  | "SCHEDULE_FEEDBACK_MEETING"
  | "COMPLETE_FEEDBACK_AND_GOALS"
  | "NONE";

export const MANAGER_PENDING_ACTION_LABELS: Readonly<Record<ManagerPendingAction, string>> = {
  WAITING_FOR_EMPLOYEE: "ממתין להערכה העצמית של העובד",
  FILL_MANAGER_ASSESSMENT: "יש למלא הערכת מנהל",
  SCHEDULE_FEEDBACK_MEETING: "יש לקבוע שיחת משוב",
  COMPLETE_FEEDBACK_AND_GOALS: "יש להשלים סיכום שיחה ויעדים",
  NONE: "אין פעולה נדרשת",
};

function pendingActionFor(status: EvaluationStatus): ManagerPendingAction {
  switch (status) {
    case EvaluationStatus.NOT_STARTED:
    case EvaluationStatus.EMPLOYEE_IN_PROGRESS:
      return "WAITING_FOR_EMPLOYEE";
    case EvaluationStatus.EMPLOYEE_COMPLETED:
    case EvaluationStatus.MANAGER_IN_PROGRESS:
      return "FILL_MANAGER_ASSESSMENT";
    case EvaluationStatus.MANAGER_COMPLETED:
      return "SCHEDULE_FEEDBACK_MEETING";
    case EvaluationStatus.WAITING_FOR_FEEDBACK_MEETING:
      return "COMPLETE_FEEDBACK_AND_GOALS";
    case EvaluationStatus.COMPLETED:
    case EvaluationStatus.ARCHIVED:
      return "NONE";
  }
}

export interface TeamEvaluationRowDTO {
  id: string;
  status: EvaluationStatus;
  statusLabel: string;
  employee: { id: string; fullName: string; jobTitle: string; department: string };
  employeeStatus: AssessmentStatus;
  managerStatus: AssessmentStatus;
  employeeSubmittedAt: Date | null;
  managerSubmittedAt: Date | null;
  /** null עד שהמנהל הגיש את הערכתו (חוק הסודיות) */
  employeeWeightedScore: number | null;
  managerWeightedScore: number | null;
  isHighPotential: boolean;
  feedbackStatus: FeedbackMeetingStatus | null;
  feedbackScheduledAt: Date | null;
  goalsCount: number;
  completedAt: Date | null;
  pendingAction: ManagerPendingAction;
}

export async function listTeamEvaluations(cycleId?: string): Promise<{ cycleId: string | null; rows: TeamEvaluationRowDTO[] }> {
  const user = await requireManagerRole();
  const targetCycleId = cycleId ?? (await getCurrentOrLatestCycleId());
  if (!targetCycleId) return { cycleId: null, rows: [] };

  const evaluations = await prisma.evaluation.findMany({
    where: { cycleId: targetCycleId, employee: { managerId: user.id } },
    orderBy: { employee: { fullName: "asc" } },
    select: {
      id: true,
      status: true,
      employeeStatus: true,
      managerStatus: true,
      employeeSubmittedAt: true,
      managerSubmittedAt: true,
      managerWeightedScore: true,
      isHighPotential: true,
      completedAt: true,
      employee: { select: { id: true, fullName: true, jobTitle: true, department: { select: { name: true } } } },
      feedbackMeeting: { select: { status: true, scheduledAt: true } },
      _count: { select: { goals: true } },
    },
  });

  const unlockedIds = evaluations
    .filter((evaluation) => evaluation.managerStatus === AssessmentStatus.SUBMITTED)
    .map((evaluation) => evaluation.id);

  const employeeScores = unlockedIds.length
    ? await prisma.evaluation.findMany({
        where: { id: { in: unlockedIds }, managerStatus: AssessmentStatus.SUBMITTED, employee: { managerId: user.id } },
        select: { id: true, employeeWeightedScore: true },
      })
    : [];
  const employeeScoreById = new Map(employeeScores.map((row) => [row.id, decimalToNumber(row.employeeWeightedScore)]));

  return {
    cycleId: targetCycleId,
    rows: evaluations.map((evaluation) => ({
      id: evaluation.id,
      status: evaluation.status,
      statusLabel: EVALUATION_STATUS_LABELS[evaluation.status],
      employee: {
        id: evaluation.employee.id,
        fullName: evaluation.employee.fullName,
        jobTitle: evaluation.employee.jobTitle,
        department: evaluation.employee.department.name,
      },
      employeeStatus: evaluation.employeeStatus,
      managerStatus: evaluation.managerStatus,
      employeeSubmittedAt: evaluation.employeeSubmittedAt,
      managerSubmittedAt: evaluation.managerSubmittedAt,
      employeeWeightedScore: employeeScoreById.get(evaluation.id) ?? null,
      managerWeightedScore: decimalToNumber(evaluation.managerWeightedScore),
      isHighPotential: evaluation.isHighPotential,
      feedbackStatus: evaluation.feedbackMeeting?.status ?? null,
      feedbackScheduledAt: evaluation.feedbackMeeting?.scheduledAt ?? null,
      goalsCount: evaluation._count.goals,
      completedAt: evaluation.completedAt,
      pendingAction: pendingActionFor(evaluation.status),
    })),
  };
}
