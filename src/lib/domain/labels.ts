import type {
  AssessmentStatus,
  AuditAction,
  EvaluationStatus,
  FeedbackMeetingStatus,
  GoalStatus,
  Role,
} from "@/generated/prisma/enums";

/** תוויות בעברית לערכי ה-Enums. בטוח לשימוש גם בקומפוננטות לקוח. */

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  ADMIN: "מנהל מערכת",
  MANAGER: "מנהל",
  EMPLOYEE: "עובד",
};

export const ASSESSMENT_STATUS_LABELS: Readonly<Record<AssessmentStatus, string>> = {
  NOT_STARTED: "טרם התחיל",
  DRAFT: "טיוטה",
  SUBMITTED: "נשלח",
};

export const FEEDBACK_STATUS_LABELS: Readonly<Record<FeedbackMeetingStatus, string>> = {
  SCHEDULED: "נקבעה",
  DRAFT: "סיכום בכתיבה",
  APPROVED: "אושר",
  ACKNOWLEDGED: "העובד אישר קריאה",
};

export const GOAL_STATUS_LABELS: Readonly<Record<GoalStatus, string>> = {
  NOT_STARTED: "טרם התחיל",
  IN_PROGRESS: "בתהליך",
  ACHIEVED: "הושג",
  PARTIALLY_ACHIEVED: "הושג חלקית",
  NOT_ACHIEVED: "לא הושג",
  CANCELLED: "בוטל",
};

/** צבע תג לכל סטטוס הערכה */
export const EVALUATION_STATUS_TONE: Readonly<Record<EvaluationStatus, "neutral" | "info" | "warning" | "success" | "muted">> = {
  NOT_STARTED: "neutral",
  EMPLOYEE_IN_PROGRESS: "info",
  EMPLOYEE_COMPLETED: "warning",
  MANAGER_IN_PROGRESS: "warning",
  MANAGER_COMPLETED: "info",
  WAITING_FOR_FEEDBACK_MEETING: "info",
  COMPLETED: "success",
  ARCHIVED: "muted",
};

export const AUDIT_ACTION_LABELS: Readonly<Record<AuditAction, string>> = {
  LOGIN: "התחברות",
  LOGOUT: "התנתקות",
  USER_CREATED: "יצירת עובד",
  USER_UPDATED: "עדכון עובד",
  USER_DEACTIVATED: "השבתת עובד",
  ROLE_CHANGED: "שינוי הרשאה",
  MANAGER_ASSIGNED: "שיוך למנהל",
  EMPLOYEES_IMPORTED: "ייבוא עובדים",
  QUESTIONNAIRE_CREATED: "יצירת שאלון",
  QUESTIONNAIRE_UPDATED: "עדכון שאלון",
  CYCLE_CREATED: "יצירת מחזור",
  CYCLE_OPENED: "פתיחת מחזור",
  CYCLE_CLOSED: "סגירת מחזור",
  SELF_ASSESSMENT_SAVED: "שמירת הערכה עצמית",
  SELF_ASSESSMENT_SUBMITTED: "שליחת הערכה עצמית",
  MANAGER_ASSESSMENT_SAVED: "שמירת הערכת מנהל",
  MANAGER_ASSESSMENT_SUBMITTED: "שליחת הערכת מנהל",
  COMPARISON_VIEWED: "צפייה בדוח השוואתי",
  FEEDBACK_MEETING_SCHEDULED: "קביעת שיחת משוב",
  FEEDBACK_SAVED: "שמירת סיכום שיחה",
  FEEDBACK_APPROVED: "אישור סיכום שיחה",
  FEEDBACK_ACKNOWLEDGED: "אישור קריאה ע\"י העובד",
  GOAL_CREATED: "יצירת יעד",
  GOAL_UPDATED: "עדכון יעדים",
  GOAL_DELETED: "מחיקת יעד",
  EVALUATION_COMPLETED: "השלמת הערכה",
  REMINDERS_TRIGGERED: "הרצת תזכורות",
  REPORT_VIEWED: "צפייה בדוח",
  REPORT_EXPORTED: "ייצוא דוח",
  ACCESS_DENIED: "ניסיון גישה נחסם",
};
