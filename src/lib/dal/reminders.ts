import "server-only";
import {
  AssessmentStatus,
  AuditAction,
  CycleStatus,
  EvaluationStatus,
  NotificationType,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  calendarDaysBetween,
  dueReminderLevel,
  MEETING_NOT_SCHEDULED_DAY,
} from "@/lib/domain/reminder-rules";
import { notificationTemplates } from "@/lib/notifications/templates";
import { recordAudit } from "@/lib/dal/audit";
import { dispatchDueNotifications, type DispatchResult } from "@/lib/dal/notification-dispatch";
import { buildDedupeKey, enqueueNotifications, type NotificationDraft } from "@/lib/dal/notifications";
import { requireAdmin } from "@/lib/dal/session";

/**
 * מנגנון התזכורות היומי (SPEC §6):
 *  - עובד שטרם הגיש: יום 4 ויום 7 מפתיחת המחזור (יום 0 = מייל הפתיחה שנשלח בפתיחה).
 *  - מנהל שטרם הגיש: יום 4 ויום 7 מהגשת העובד (יום 0 = ההתראה המיידית בהגשה).
 *  - מנהל שהגיש אך לא קבע שיחת משוב: תזכורת ביום 4 מהגשתו.
 * ה-dedupeKey הקבוע מבטיח שהרצה חוזרת באותו יום (או ידנית) לא תיצור כפילויות.
 */

export interface ReminderScheduleResult {
  employeeReminders: number;
  managerReminders: number;
  meetingReminders: number;
}

export interface DailyJobResult {
  ranAt: string;
  reminders: ReminderScheduleResult;
  dispatch: DispatchResult;
}

export async function scheduleDueReminders(now: Date = new Date()): Promise<ReminderScheduleResult> {
  const result: ReminderScheduleResult = { employeeReminders: 0, managerReminders: 0, meetingReminders: 0 };

  const cycles = await prisma.reviewCycle.findMany({
    where: { status: CycleStatus.ACTIVE, openedAt: { not: null } },
    select: { id: true, openedAt: true, selfAssessmentDueDate: true, managerAssessmentDueDate: true },
  });

  for (const cycle of cycles) {
    if (!cycle.openedAt) continue;

    // --- עובדים שטרם הגישו ---
    const employeeLevel = dueReminderLevel(calendarDaysBetween(cycle.openedAt, now));
    const employeeDrafts: NotificationDraft[] = [];
    if (employeeLevel !== null) {
      const pending = await prisma.evaluation.findMany({
        where: {
          cycleId: cycle.id,
          employeeStatus: { not: AssessmentStatus.SUBMITTED },
          employee: { isActive: true },
        },
        select: { id: true, employeeId: true, employee: { select: { fullName: true } } },
      });
      const type = employeeLevel === 1 ? NotificationType.EMPLOYEE_REMINDER_1 : NotificationType.EMPLOYEE_REMINDER_2;
      for (const evaluation of pending) {
        employeeDrafts.push({
          type,
          recipientId: evaluation.employeeId,
          evaluationId: evaluation.id,
          cycleId: cycle.id,
          content: notificationTemplates[type]({
            employeeName: evaluation.employee.fullName,
            evaluationId: evaluation.id,
            dueDate: cycle.selfAssessmentDueDate,
            level: employeeLevel,
          }),
        });
      }
    }

    // --- מנהלים: העובד הגיש, המנהל עדיין לא ---
    const managerDrafts: NotificationDraft[] = [];
    const awaitingManager = await prisma.evaluation.findMany({
      where: {
        cycleId: cycle.id,
        employeeStatus: AssessmentStatus.SUBMITTED,
        managerStatus: { not: AssessmentStatus.SUBMITTED },
        employeeSubmittedAt: { not: null },
      },
      select: {
        id: true,
        managerId: true,
        employeeSubmittedAt: true,
        employee: { select: { fullName: true, managerId: true } },
      },
    });
    for (const evaluation of awaitingManager) {
      if (!evaluation.employeeSubmittedAt) continue;
      const level = dueReminderLevel(calendarDaysBetween(evaluation.employeeSubmittedAt, now));
      if (level === null) continue;
      const type = level === 1 ? NotificationType.MANAGER_REMINDER_1 : NotificationType.MANAGER_REMINDER_2;
      managerDrafts.push({
        type,
        recipientId: evaluation.employee.managerId ?? evaluation.managerId,
        evaluationId: evaluation.id,
        cycleId: cycle.id,
        content: notificationTemplates[type]({
          employeeName: evaluation.employee.fullName,
          evaluationId: evaluation.id,
          dueDate: cycle.managerAssessmentDueDate,
          level,
        }),
      });
    }

    // --- מנהלים שהגישו אך לא קבעו שיחת משוב ---
    const meetingDrafts: NotificationDraft[] = [];
    const notScheduled = await prisma.evaluation.findMany({
      where: { cycleId: cycle.id, status: EvaluationStatus.MANAGER_COMPLETED, managerSubmittedAt: { not: null } },
      select: {
        id: true,
        managerId: true,
        managerSubmittedAt: true,
        employee: { select: { fullName: true, managerId: true } },
      },
    });
    for (const evaluation of notScheduled) {
      if (!evaluation.managerSubmittedAt) continue;
      if (calendarDaysBetween(evaluation.managerSubmittedAt, now) < MEETING_NOT_SCHEDULED_DAY) continue;
      const recipientId = evaluation.employee.managerId ?? evaluation.managerId;
      meetingDrafts.push({
        type: NotificationType.FEEDBACK_MEETING_REMINDER,
        recipientId,
        evaluationId: evaluation.id,
        cycleId: cycle.id,
        content: notificationTemplates.MEETING_NOT_SCHEDULED({
          employeeName: evaluation.employee.fullName,
          evaluationId: evaluation.id,
        }),
        dedupeKey: buildDedupeKey(evaluation.id, NotificationType.FEEDBACK_MEETING_REMINDER, recipientId, "not-scheduled"),
      });
    }

    result.employeeReminders += await enqueueNotifications(prisma, employeeDrafts);
    result.managerReminders += await enqueueNotifications(prisma, managerDrafts);
    result.meetingReminders += await enqueueNotifications(prisma, meetingDrafts);
  }

  return result;
}

/** תזמון תזכורות + שליחת כל מה שממתין. actorId=null כשמופעל ע"י ה-Cron. */
export async function runDailyJobs(actorId: string | null = null, now: Date = new Date()): Promise<DailyJobResult> {
  const reminders = await scheduleDueReminders(now);
  // שליחה לפי השעה הנוכחית (ולא לפי now), כדי שגם התזכורות שנוצרו זה עתה ייכללו באותה ריצה
  const dispatch = await dispatchDueNotifications({ limit: 500, now: new Date(Math.max(now.getTime(), Date.now())) });
  const result: DailyJobResult = { ranAt: now.toISOString(), reminders, dispatch };
  await recordAudit({
    action: AuditAction.REMINDERS_TRIGGERED,
    entityType: "System",
    actorId,
    metadata: { trigger: actorId ? "manual" : "cron", ...reminders, ...dispatch },
  });
  return result;
}

/** "הפעלת תזכורות" ידנית ע"י מנהל מערכת */
export async function triggerRemindersNow(): Promise<DailyJobResult> {
  const admin = await requireAdmin();
  return runDailyJobs(admin.id);
}
