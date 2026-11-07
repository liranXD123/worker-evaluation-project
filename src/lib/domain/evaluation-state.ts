import {
  AssessmentStatus,
  CycleStatus,
  EvaluationStatus,
  FeedbackMeetingStatus,
} from "@/generated/prisma/enums";
import { conflict } from "@/lib/errors";

/**
 * מכונת המצבים של הערכת עובד (SPEC §4).
 * קובץ טהור (ללא גישה ל-DB) – משמש גם את ה-DAL וגם את ה-UI לחישוב הרשאות תצוגה.
 */
export const EVALUATION_TRANSITIONS: Readonly<Record<EvaluationStatus, readonly EvaluationStatus[]>> = {
  NOT_STARTED: [EvaluationStatus.EMPLOYEE_IN_PROGRESS, EvaluationStatus.EMPLOYEE_COMPLETED, EvaluationStatus.ARCHIVED],
  EMPLOYEE_IN_PROGRESS: [EvaluationStatus.EMPLOYEE_COMPLETED, EvaluationStatus.ARCHIVED],
  EMPLOYEE_COMPLETED: [EvaluationStatus.MANAGER_IN_PROGRESS, EvaluationStatus.MANAGER_COMPLETED, EvaluationStatus.ARCHIVED],
  MANAGER_IN_PROGRESS: [EvaluationStatus.MANAGER_COMPLETED, EvaluationStatus.ARCHIVED],
  MANAGER_COMPLETED: [EvaluationStatus.WAITING_FOR_FEEDBACK_MEETING, EvaluationStatus.ARCHIVED],
  WAITING_FOR_FEEDBACK_MEETING: [EvaluationStatus.COMPLETED, EvaluationStatus.ARCHIVED],
  COMPLETED: [EvaluationStatus.ARCHIVED],
  ARCHIVED: [],
};

export function canTransition(from: EvaluationStatus, to: EvaluationStatus): boolean {
  return EVALUATION_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: EvaluationStatus, to: EvaluationStatus): void {
  if (!canTransition(from, to)) {
    throw conflict(`לא ניתן להעביר הערכה מסטטוס "${EVALUATION_STATUS_LABELS[from]}" לסטטוס "${EVALUATION_STATUS_LABELS[to]}".`);
  }
}

export const EVALUATION_STATUS_LABELS: Readonly<Record<EvaluationStatus, string>> = {
  NOT_STARTED: "טרם התחיל",
  EMPLOYEE_IN_PROGRESS: "בטיפול עובד",
  EMPLOYEE_COMPLETED: 'הושלם ע"י עובד',
  MANAGER_IN_PROGRESS: "בטיפול מנהל",
  MANAGER_COMPLETED: 'הושלם ע"י מנהל',
  WAITING_FOR_FEEDBACK_MEETING: "ממתין לשיחת משוב",
  COMPLETED: "הושלם סופית",
  ARCHIVED: "ארכיון",
};

export const CYCLE_STATUS_LABELS: Readonly<Record<CycleStatus, string>> = {
  DRAFT: "טיוטה",
  ACTIVE: "פעיל",
  CLOSED: "סגור",
};

// -----------------------------------------------------------------------------
// הרשאות ברמת רשומת הערכה – מקור אמת יחיד ל-DAL ול-UI
// -----------------------------------------------------------------------------

/** הקשר בין המשתמש הצופה להערכה */
export type ViewerRelation = "SELF" | "MANAGER" | "ADMIN";

export interface EvaluationPermissionInput {
  relation: ViewerRelation;
  status: EvaluationStatus;
  employeeStatus: AssessmentStatus;
  managerStatus: AssessmentStatus;
  cycleStatus: CycleStatus;
  feedbackStatus: FeedbackMeetingStatus | null;
}

export interface EvaluationPermissions {
  /** תשובות העובד – חוק הסודיות: מנהל רואה רק לאחר שהגיש בעצמו */
  canViewEmployeeAnswers: boolean;
  /** תשובות המנהל – עובד רואה רק לאחר אישור סיכום שיחת המשוב */
  canViewManagerAnswers: boolean;
  canEditSelfAssessment: boolean;
  canEditManagerAssessment: boolean;
  canViewComparison: boolean;
  canScheduleMeeting: boolean;
  canViewFeedback: boolean;
  canEditFeedback: boolean;
  canEditGoals: boolean;
  canApproveFeedback: boolean;
  canAcknowledgeFeedback: boolean;
  canViewGoals: boolean;
  canSetHighPotential: boolean;
}

function isFeedbackPublished(status: FeedbackMeetingStatus | null): boolean {
  return status === FeedbackMeetingStatus.APPROVED || status === FeedbackMeetingStatus.ACKNOWLEDGED;
}

export function computeEvaluationPermissions(input: EvaluationPermissionInput): EvaluationPermissions {
  const { relation, status, employeeStatus, managerStatus, cycleStatus, feedbackStatus } = input;

  const isSelf = relation === "SELF";
  const isManager = relation === "MANAGER";
  const isAdmin = relation === "ADMIN";
  const writable = cycleStatus === CycleStatus.ACTIVE && status !== EvaluationStatus.ARCHIVED;
  const employeeSubmitted = employeeStatus === AssessmentStatus.SUBMITTED;
  const managerSubmitted = managerStatus === AssessmentStatus.SUBMITTED;
  const published = isFeedbackPublished(feedbackStatus);
  const feedbackEditableStatus =
    status === EvaluationStatus.MANAGER_COMPLETED || status === EvaluationStatus.WAITING_FOR_FEEDBACK_MEETING;

  return {
    canViewEmployeeAnswers: isSelf || isAdmin || (isManager && managerSubmitted),
    canViewManagerAnswers: isManager || isAdmin || (isSelf && published),
    canEditSelfAssessment: isSelf && writable && !employeeSubmitted,
    canEditManagerAssessment: isManager && writable && employeeSubmitted && !managerSubmitted,
    canViewComparison: employeeSubmitted && managerSubmitted && (isManager || isAdmin || (isSelf && published)),
    canScheduleMeeting: isManager && writable && feedbackEditableStatus,
    canViewFeedback: isManager || isAdmin || (isSelf && published),
    canEditFeedback: isManager && writable && status === EvaluationStatus.WAITING_FOR_FEEDBACK_MEETING && !published,
    canEditGoals: isManager && writable && feedbackEditableStatus && !published,
    canApproveFeedback: isManager && writable && status === EvaluationStatus.WAITING_FOR_FEEDBACK_MEETING && !published,
    canAcknowledgeFeedback: isSelf && writable && feedbackStatus === FeedbackMeetingStatus.APPROVED,
    canViewGoals: isManager || isAdmin || (isSelf && published),
    canSetHighPotential: isManager && writable && !published,
  };
}
