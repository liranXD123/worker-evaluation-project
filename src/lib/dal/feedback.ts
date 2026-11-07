import "server-only";
import {
  AuditAction,
  EvaluationStatus,
  FeedbackMeetingStatus,
  NotificationType,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { decryptNullable, encryptNullable } from "@/lib/crypto";
import { conflict, validationError } from "@/lib/errors";
import { assertTransition } from "@/lib/domain/evaluation-state";
import { notificationTemplates } from "@/lib/notifications/templates";
import { assertPermission, assertRelation, resolveEvaluationAccess } from "@/lib/dal/access";
import { recordAudit } from "@/lib/dal/audit";
import { assertGoalsReady } from "@/lib/dal/goals";
import { buildDedupeKey, cancelPendingNotifications, enqueueNotifications } from "@/lib/dal/notifications";
import { requireUser } from "@/lib/dal/session";
import {
  acknowledgeFeedbackSchema,
  evaluationRefSchema,
  feedbackSummarySchema,
  parseInput,
  scheduleMeetingSchema,
} from "@/lib/validation/schemas";

/** שיחת משוב (SPEC §4 שלב 5). שדות הטקסט נשמרים מוצפנים. */

export interface FeedbackMeetingDTO {
  evaluationId: string;
  status: FeedbackMeetingStatus;
  scheduledAt: Date | null;
  location: string | null;
  heldAt: Date | null;
  achievements: string | null;
  strengths: string | null;
  improvementAreas: string | null;
  developmentOpportunities: string | null;
  summary: string | null;
  managerComments: string | null;
  employeeComments: string | null;
  approvedAt: Date | null;
  employeeAcknowledgedAt: Date | null;
}

const MEETING_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

export async function getFeedbackMeeting(evaluationId: string): Promise<FeedbackMeetingDTO | null> {
  const user = await requireUser();
  const access = await resolveEvaluationAccess(user, evaluationId);
  assertPermission(access, "canViewFeedback", "סיכום שיחת המשוב יהיה זמין לאחר אישור המנהל.");

  const meeting = await prisma.feedbackMeeting.findUnique({ where: { evaluationId } });
  if (!meeting) return null;

  return {
    evaluationId,
    status: meeting.status,
    scheduledAt: meeting.scheduledAt,
    location: meeting.location,
    heldAt: meeting.heldAt,
    achievements: decryptNullable(meeting.achievements),
    strengths: decryptNullable(meeting.strengths),
    improvementAreas: decryptNullable(meeting.improvementAreas),
    developmentOpportunities: decryptNullable(meeting.developmentOpportunities),
    summary: decryptNullable(meeting.summary),
    managerComments: decryptNullable(meeting.managerComments),
    employeeComments: decryptNullable(meeting.employeeComments),
    approvedAt: meeting.approvedAt,
    employeeAcknowledgedAt: meeting.employeeAcknowledgedAt,
  };
}

/** קביעה/שינוי מועד שיחה. המעבר MANAGER_COMPLETED → WAITING_FOR_FEEDBACK_MEETING קורה כאן. */
export async function scheduleFeedbackMeeting(rawInput: unknown): Promise<{ evaluationId: string; status: EvaluationStatus }> {
  const user = await requireUser();
  const input = parseInput(scheduleMeetingSchema, rawInput);
  const access = await resolveEvaluationAccess(user, input.evaluationId);
  assertRelation(access, "MANAGER");
  assertPermission(access, "canScheduleMeeting", "ניתן לקבוע שיחת משוב רק לאחר הגשת הערכת המנהל.");
  const { evaluation } = access;

  const nextStatus =
    evaluation.status === EvaluationStatus.MANAGER_COMPLETED ? EvaluationStatus.WAITING_FOR_FEEDBACK_MEETING : evaluation.status;
  if (nextStatus !== evaluation.status) assertTransition(evaluation.status, nextStatus);

  return prisma.$transaction(async (tx) => {
    await tx.feedbackMeeting.upsert({
      where: { evaluationId: evaluation.id },
      create: {
        evaluationId: evaluation.id,
        authorId: user.id,
        status: FeedbackMeetingStatus.SCHEDULED,
        scheduledAt: input.scheduledAt,
        location: input.location ?? null,
      },
      update: { scheduledAt: input.scheduledAt, location: input.location ?? null },
    });

    if (nextStatus !== evaluation.status) {
      const updated = await tx.evaluation.updateMany({
        where: { id: evaluation.id, status: evaluation.status },
        data: { status: nextStatus },
      });
      if (updated.count !== 1) throw conflict("ההערכה עודכנה במקביל. רעננו את הדף ונסו שוב.");
    }

    await cancelPendingNotifications(tx, { evaluationId: evaluation.id, type: NotificationType.FEEDBACK_MEETING_REMINDER });
    const reminderAt = new Date(Math.max(Date.now(), input.scheduledAt.getTime() - MEETING_REMINDER_LEAD_MS));
    const managerId = evaluation.employee.managerId ?? evaluation.managerId;
    const content = notificationTemplates.FEEDBACK_MEETING_REMINDER({
      employeeName: evaluation.employee.fullName,
      evaluationId: evaluation.id,
      scheduledAt: input.scheduledAt,
      location: input.location ?? null,
    });
    await enqueueNotifications(
      tx,
      [evaluation.employeeId, managerId].map((recipientId) => ({
        type: NotificationType.FEEDBACK_MEETING_REMINDER,
        recipientId,
        evaluationId: evaluation.id,
        cycleId: evaluation.cycleId,
        content,
        scheduledAt: reminderAt,
        dedupeKey: buildDedupeKey(evaluation.id, NotificationType.FEEDBACK_MEETING_REMINDER, recipientId, input.scheduledAt.toISOString()),
      })),
    );

    await recordAudit(
      {
        action: AuditAction.FEEDBACK_MEETING_SCHEDULED,
        entityType: "Evaluation",
        entityId: evaluation.id,
        actorId: user.id,
        metadata: { scheduledAt: input.scheduledAt.toISOString(), location: input.location ?? null },
      },
      tx,
    );

    return { evaluationId: evaluation.id, status: nextStatus };
  });
}

/** שמירת טיוטת סיכום שיחה (ניתן לשמור שוב ושוב עד לאישור). */
export async function saveFeedbackSummary(rawInput: unknown): Promise<{ evaluationId: string }> {
  const user = await requireUser();
  const input = parseInput(feedbackSummarySchema, rawInput);
  const access = await resolveEvaluationAccess(user, input.evaluationId);
  assertRelation(access, "MANAGER");
  assertPermission(access, "canEditFeedback", "ניתן לערוך את סיכום השיחה רק לאחר קביעת שיחת משוב ועד לאישורו.");

  const existing = await prisma.feedbackMeeting.findUnique({ where: { evaluationId: input.evaluationId }, select: { id: true } });
  if (!existing) throw conflict("יש לקבוע מועד לשיחת המשוב לפני כתיבת הסיכום.");

  await prisma.$transaction(async (tx) => {
    await tx.feedbackMeeting.update({
      where: { evaluationId: input.evaluationId },
      data: {
        status: FeedbackMeetingStatus.DRAFT,
        ...(input.heldAt !== undefined ? { heldAt: input.heldAt } : {}),
        achievements: encryptNullable(input.achievements),
        strengths: encryptNullable(input.strengths),
        improvementAreas: encryptNullable(input.improvementAreas),
        developmentOpportunities: encryptNullable(input.developmentOpportunities),
        summary: encryptNullable(input.summary),
        managerComments: encryptNullable(input.managerComments),
        employeeComments: encryptNullable(input.employeeComments),
      },
    });
    await recordAudit(
      { action: AuditAction.FEEDBACK_SAVED, entityType: "Evaluation", entityId: input.evaluationId, actorId: user.id },
      tx,
    );
  });

  return { evaluationId: input.evaluationId };
}

/**
 * אישור סיכום השיחה: דורש שדות חובה + 3–5 יעדים בסכום 100%.
 * ההערכה עוברת ל-COMPLETED, הסיכום, היעדים והערכת המנהל נחשפים לעובד.
 */
export async function approveFeedback(rawInput: unknown): Promise<{ evaluationId: string; status: EvaluationStatus }> {
  const user = await requireUser();
  const input = parseInput(evaluationRefSchema, rawInput);
  const access = await resolveEvaluationAccess(user, input.evaluationId);
  assertRelation(access, "MANAGER");
  assertPermission(access, "canApproveFeedback", "לא ניתן לאשר את הסיכום בשלב הנוכחי.");
  const { evaluation } = access;
  assertTransition(evaluation.status, EvaluationStatus.COMPLETED);

  const meeting = await prisma.feedbackMeeting.findUnique({ where: { evaluationId: evaluation.id } });
  if (!meeting) throw conflict("יש לקבוע ולסכם את שיחת המשוב לפני האישור.");

  const required: { field: keyof typeof meeting; label: string }[] = [
    { field: "achievements", label: "הישגים מרכזיים" },
    { field: "strengths", label: "חוזקות" },
    { field: "improvementAreas", label: "תחומי שיפור" },
    { field: "summary", label: "סיכום שיחה" },
  ];
  const missing = required.filter(({ field }) => !meeting[field]);
  if (missing.length > 0) {
    throw validationError(
      `יש למלא את השדות: ${missing.map(({ label }) => label).join(", ")}.`,
      Object.fromEntries(missing.map(({ field }) => [field, ["שדה חובה לפני אישור"]])),
    );
  }

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await assertGoalsReady(tx, evaluation.id);

    await tx.feedbackMeeting.update({
      where: { evaluationId: evaluation.id },
      data: { status: FeedbackMeetingStatus.APPROVED, approvedAt: now, heldAt: meeting.heldAt ?? now },
    });

    const updated = await tx.evaluation.updateMany({
      where: { id: evaluation.id, status: evaluation.status },
      data: { status: EvaluationStatus.COMPLETED, completedAt: now },
    });
    if (updated.count !== 1) throw conflict("ההערכה עודכנה במקביל. רעננו את הדף ונסו שוב.");

    await cancelPendingNotifications(tx, { evaluationId: evaluation.id, type: NotificationType.FEEDBACK_MEETING_REMINDER });
    await enqueueNotifications(tx, [
      {
        type: NotificationType.FEEDBACK_APPROVED,
        recipientId: evaluation.employeeId,
        evaluationId: evaluation.id,
        cycleId: evaluation.cycleId,
        content: notificationTemplates.FEEDBACK_APPROVED({ employeeName: evaluation.employee.fullName, evaluationId: evaluation.id }),
      },
    ]);

    await recordAudit(
      { action: AuditAction.FEEDBACK_APPROVED, entityType: "Evaluation", entityId: evaluation.id, actorId: user.id },
      tx,
    );
    await recordAudit(
      {
        action: AuditAction.EVALUATION_COMPLETED,
        entityType: "Evaluation",
        entityId: evaluation.id,
        actorId: user.id,
        metadata: { fromStatus: evaluation.status, toStatus: EvaluationStatus.COMPLETED },
      },
      tx,
    );

    return { evaluationId: evaluation.id, status: EvaluationStatus.COMPLETED };
  });
}

/** העובד מאשר שקרא את הסיכום ויכול להוסיף הערות משלו. */
export async function acknowledgeFeedback(rawInput: unknown): Promise<{ evaluationId: string }> {
  const user = await requireUser();
  const input = parseInput(acknowledgeFeedbackSchema, rawInput);
  const access = await resolveEvaluationAccess(user, input.evaluationId);
  assertRelation(access, "SELF");
  assertPermission(access, "canAcknowledgeFeedback", "ניתן לאשר קריאה רק לאחר שהמנהל אישר את הסיכום.");

  const meeting = await prisma.feedbackMeeting.findUniqueOrThrow({
    where: { evaluationId: input.evaluationId },
    select: { employeeComments: true },
  });
  const existingComments = decryptNullable(meeting.employeeComments);
  const newComments = input.employeeComments?.trim();
  const mergedComments = newComments
    ? existingComments
      ? `${existingComments}\n\n— הערות העובד באישור הקריאה —\n${newComments}`
      : newComments
    : existingComments;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.feedbackMeeting.updateMany({
      where: { evaluationId: input.evaluationId, status: FeedbackMeetingStatus.APPROVED },
      data: {
        status: FeedbackMeetingStatus.ACKNOWLEDGED,
        employeeAcknowledgedAt: new Date(),
        employeeComments: encryptNullable(mergedComments),
      },
    });
    if (updated.count !== 1) throw conflict("הסיכום כבר אושר לקריאה.");
    await recordAudit(
      { action: AuditAction.FEEDBACK_ACKNOWLEDGED, entityType: "Evaluation", entityId: input.evaluationId, actorId: user.id },
      tx,
    );
  });

  return { evaluationId: input.evaluationId };
}
