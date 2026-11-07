import "server-only";
import { NotificationStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { getMailTransport } from "@/lib/mail/transport";
import { renderEmailHtml } from "@/lib/mail/render";

/**
 * שולח התראות שהגיע זמנן מהתור (PENDING, או FAILED שעוד לא מיצו את מספר הניסיונות).
 *
 * פונקציית מערכת ללא בדיקת משתמש – נקראת רק מ:
 *  - after() בתוך Server Actions (שליחה מיידית לאחר פעולה)
 *  - נתיב ה-Cron המאובטח ב-CRON_SECRET
 *  - הפעלה ידנית ע"י מנהל מערכת (src/lib/dal/reminders.ts)
 *
 * מניעת שליחה כפולה בין מריצים מקבילים: כל רשומה "נתפסת" ע"י הגדלת attempts בתנאי
 * שהערך לא השתנה מאז הקריאה (optimistic claim). רק מי שהצליח לתפוס – שולח.
 */

export const MAX_SEND_ATTEMPTS = 3;
const DEFAULT_BATCH_SIZE = 50;

export interface DispatchResult {
  transport: string;
  sent: number;
  failed: number;
  skipped: number;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

export async function dispatchDueNotifications(options: { limit?: number; now?: Date } = {}): Promise<DispatchResult> {
  const now = options.now ?? new Date();
  const transport = getMailTransport();
  const result: DispatchResult = { transport: transport.name, sent: 0, failed: 0, skipped: 0 };

  const due = await prisma.notification.findMany({
    where: {
      status: { in: [NotificationStatus.PENDING, NotificationStatus.FAILED] },
      attempts: { lt: MAX_SEND_ATTEMPTS },
      scheduledAt: { lte: now },
    },
    orderBy: { scheduledAt: "asc" },
    take: options.limit ?? DEFAULT_BATCH_SIZE,
    select: {
      id: true,
      attempts: true,
      subject: true,
      body: true,
      recipient: { select: { email: true, fullName: true, isActive: true } },
    },
  });

  for (const notification of due) {
    const claimed = await prisma.notification.updateMany({
      where: {
        id: notification.id,
        attempts: notification.attempts,
        status: { in: [NotificationStatus.PENDING, NotificationStatus.FAILED] },
      },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) {
      result.skipped++;
      continue;
    }

    if (!notification.recipient.isActive) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.FAILED, attempts: MAX_SEND_ATTEMPTS, lastError: "Recipient is inactive" },
      });
      result.failed++;
      continue;
    }

    try {
      await transport.send({
        to: { address: notification.recipient.email, name: notification.recipient.fullName },
        subject: notification.subject,
        html: renderEmailHtml(notification.subject, notification.body),
        text: notification.body,
      });
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.SENT, sentAt: new Date(), lastError: null },
      });
      result.sent++;
    } catch (error) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.FAILED, lastError: errorMessage(error) },
      });
      result.failed++;
    }
  }

  return result;
}
