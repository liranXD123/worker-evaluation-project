"use server";

import { revalidatePath } from "next/cache";
import { dispatchNotificationsAfterResponse } from "@/lib/actions/dispatch";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { saveManagerAssessment, saveSelfAssessment, type SaveAssessmentResult } from "@/lib/dal/assessments";
import {
  acknowledgeFeedback,
  approveFeedback,
  saveFeedbackSummary,
  scheduleFeedbackMeeting,
} from "@/lib/dal/feedback";
import { saveGoals, type GoalDTO } from "@/lib/dal/goals";
import type { EvaluationStatus } from "@/generated/prisma/enums";

/**
 * Server Actions של תהליך ההערכה. שכבה דקה: כל האימות, ההרשאות וחוקי העסק נמצאים ב-DAL.
 * הקלט מגיע כ-unknown ומאומת ב-Zod בתוך ה-DAL.
 */

/** רענון המסכים + שליחה מיידית של התראות שנוצרו בפעולה (אחרי שהתשובה נשלחה) */
function afterMutation(): void {
  revalidatePath("/", "layout");
  dispatchNotificationsAfterResponse();
}

export async function saveSelfAssessmentAction(input: unknown): Promise<ActionResult<SaveAssessmentResult>> {
  return runAction(async () => {
    const result = await saveSelfAssessment(input);
    afterMutation();
    return result;
  });
}

export async function saveManagerAssessmentAction(input: unknown): Promise<ActionResult<SaveAssessmentResult>> {
  return runAction(async () => {
    const result = await saveManagerAssessment(input);
    afterMutation();
    return result;
  });
}

export async function scheduleFeedbackMeetingAction(
  input: unknown,
): Promise<ActionResult<{ evaluationId: string; status: EvaluationStatus }>> {
  return runAction(async () => {
    const result = await scheduleFeedbackMeeting(input);
    afterMutation();
    return result;
  });
}

export async function saveFeedbackSummaryAction(input: unknown): Promise<ActionResult<{ evaluationId: string }>> {
  return runAction(async () => {
    const result = await saveFeedbackSummary(input);
    afterMutation();
    return result;
  });
}

export async function approveFeedbackAction(
  input: unknown,
): Promise<ActionResult<{ evaluationId: string; status: EvaluationStatus }>> {
  return runAction(async () => {
    const result = await approveFeedback(input);
    afterMutation();
    return result;
  });
}

export async function acknowledgeFeedbackAction(input: unknown): Promise<ActionResult<{ evaluationId: string }>> {
  return runAction(async () => {
    const result = await acknowledgeFeedback(input);
    afterMutation();
    return result;
  });
}

export async function saveGoalsAction(input: unknown): Promise<ActionResult<GoalDTO[]>> {
  return runAction(async () => {
    const result = await saveGoals(input);
    afterMutation();
    return result;
  });
}
