import { NotificationType } from "@/generated/prisma/enums";

/**
 * נוסחי ההתראות (SPEC §4, §6). שלב 3 יעטוף את הגוף בתבנית HTML וישלח דרך Outlook 365.
 */

export function appUrl(path = ""): string {
  const base = (process.env.APP_URL ?? process.env.RENDER_EXTERNAL_URL ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

export function evaluationUrl(evaluationId: string): string {
  return appUrl(`/evaluations/${evaluationId}`);
}

const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "long", timeZone: "Asia/Jerusalem" });
const dateTimeFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jerusalem" });

export function formatHebrewDate(date: Date): string {
  return dateFormatter.format(date);
}

export function formatHebrewDateTime(date: Date): string {
  return dateTimeFormatter.format(date);
}

export interface NotificationContent {
  subject: string;
  body: string;
}

export interface CycleOpenedParams {
  employeeName: string;
  cycleName: string;
  year: number;
  dueDate: Date;
  evaluationId: string;
}

export interface EvaluationLinkParams {
  employeeName: string;
  evaluationId: string;
}

export interface MeetingParams extends EvaluationLinkParams {
  scheduledAt: Date;
  location: string | null;
}

export interface EmployeeReminderParams extends EvaluationLinkParams {
  dueDate: Date;
  level: 1 | 2;
}

export interface ManagerReminderParams extends EvaluationLinkParams {
  dueDate: Date;
  level: 1 | 2;
}

function reminderPrefix(level: 1 | 2): string {
  return level === 1 ? "תזכורת" : "תזכורת שנייה";
}

function employeeReminder(params: EmployeeReminderParams): NotificationContent {
  return {
    subject: `${reminderPrefix(params.level)}: יש להשלים את ההערכה העצמית`,
    body: [
      `שלום ${params.employeeName},`,
      "",
      "ההערכה העצמית שלך עדיין לא נשלחה.",
      `נא להשלים ולשלוח אותה עד ${formatHebrewDate(params.dueDate)}.`,
      "",
      `לשאלון האישי: ${evaluationUrl(params.evaluationId)}`,
    ].join("\n"),
  };
}

function managerReminder(params: ManagerReminderParams): NotificationContent {
  return {
    subject: `${reminderPrefix(params.level)}: הערכת מנהל ממתינה – ${params.employeeName}`,
    body: [
      `${params.employeeName} השלים/ה את ההערכה העצמית, והערכת המנהל עדיין לא נשלחה.`,
      `נא להשלים את הערכת המנהל עד ${formatHebrewDate(params.dueDate)}.`,
      "",
      `להערכת העובד: ${evaluationUrl(params.evaluationId)}`,
    ].join("\n"),
  };
}

export const notificationTemplates = {
  [NotificationType.CYCLE_OPENED]: (params: CycleOpenedParams): NotificationContent => ({
    subject: `נפתח מחזור הערכת עובדים – ${params.cycleName} ${params.year}`,
    body: [
      `שלום ${params.employeeName},`,
      "",
      "נפתח מחזור הערכת העובדים השנתי. התהליך כולל הערכה עצמית, הערכת מנהל ושיחת משוב משותפת עם יעדים לשנה הבאה.",
      `יש למלא את ההערכה העצמית עד ${formatHebrewDate(params.dueDate)}.`,
      "",
      `לשאלון האישי: ${evaluationUrl(params.evaluationId)}`,
    ].join("\n"),
  }),

  [NotificationType.EMPLOYEE_SUBMITTED]: (params: EvaluationLinkParams): NotificationContent => ({
    subject: "עובד השלים הערכה עצמית",
    body: [
      `העובד ${params.employeeName} השלים את ההערכה העצמית. כעת נדרש למלא הערכת מנהל.`,
      "",
      `להערכת העובד: ${evaluationUrl(params.evaluationId)}`,
    ].join("\n"),
  }),

  [NotificationType.ASSESSMENTS_COMPLETED]: (params: EvaluationLinkParams): NotificationContent => ({
    subject: "הערכות הושלמו - יש לתאם שיחת משוב",
    body: [
      `ההערכה העצמית והערכת המנהל של ${params.employeeName} הושלמו.`,
      "יש לתאם שיחת משוב.",
      "",
      `לפרטים: ${evaluationUrl(params.evaluationId)}`,
    ].join("\n"),
  }),

  [NotificationType.FEEDBACK_MEETING_REMINDER]: (params: MeetingParams): NotificationContent => ({
    subject: "תזכורת: שיחת משוב מתקרבת",
    body: [
      `שיחת המשוב של ${params.employeeName} נקבעה ל-${formatHebrewDateTime(params.scheduledAt)}${params.location ? ` (${params.location})` : ""}.`,
      "",
      `לפרטים: ${evaluationUrl(params.evaluationId)}`,
    ].join("\n"),
  }),

  [NotificationType.EMPLOYEE_REMINDER_1]: (params: EmployeeReminderParams): NotificationContent =>
    employeeReminder({ ...params, level: 1 }),
  [NotificationType.EMPLOYEE_REMINDER_2]: (params: EmployeeReminderParams): NotificationContent =>
    employeeReminder({ ...params, level: 2 }),
  [NotificationType.MANAGER_REMINDER_1]: (params: ManagerReminderParams): NotificationContent =>
    managerReminder({ ...params, level: 1 }),
  [NotificationType.MANAGER_REMINDER_2]: (params: ManagerReminderParams): NotificationContent =>
    managerReminder({ ...params, level: 2 }),

  /** תזכורת למנהל שהשלים הערכה אך טרם קבע שיחת משוב (נשלחת כ-FEEDBACK_MEETING_REMINDER) */
  MEETING_NOT_SCHEDULED: (params: EvaluationLinkParams): NotificationContent => ({
    subject: `תזכורת: יש לקבוע שיחת משוב עם ${params.employeeName}`,
    body: [
      `ההערכות של ${params.employeeName} הושלמו, אך טרם נקבע מועד לשיחת המשוב.`,
      "נא לתאם את השיחה ולעדכן את המועד במערכת.",
      "",
      `לקביעת השיחה: ${evaluationUrl(params.evaluationId)}`,
    ].join("\n"),
  }),

  [NotificationType.FEEDBACK_APPROVED]: (params: EvaluationLinkParams): NotificationContent => ({
    subject: "סיכום שיחת המשוב והיעדים שלך זמינים לצפייה",
    body: [
      `שלום ${params.employeeName},`,
      "",
      "המנהל אישר את סיכום שיחת המשוב והיעדים לשנה הבאה. ניתן לצפות בהם ולאשר קריאה.",
      "",
      `לצפייה: ${evaluationUrl(params.evaluationId)}`,
    ].join("\n"),
  }),
} as const;
