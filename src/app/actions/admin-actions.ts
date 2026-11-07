"use server";

import { revalidatePath } from "next/cache";
import { dispatchNotificationsAfterResponse } from "@/lib/actions/dispatch";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { closeCycle, createCycle, openCycle } from "@/lib/dal/cycles";
import {
  applyEmployeeImport,
  MAX_IMPORT_FILE_BYTES,
  previewEmployeeImport,
  type ImportApplyResult,
  type ImportPreview,
} from "@/lib/dal/employee-import";
import { cloneTemplate, createTemplateVersion, updateTemplate } from "@/lib/dal/questionnaires";
import { triggerRemindersNow, type DailyJobResult } from "@/lib/dal/reminders";
import { createUser, deactivateUser, updateUser } from "@/lib/dal/users";
import { validationError } from "@/lib/errors";

/**
 * Server Actions של מנהל המערכת (HR). כל פונקציית DAL מתחילה ב-requireAdmin().
 */

function revalidateApp(): void {
  revalidatePath("/", "layout");
}

export async function createCycleAction(input: unknown): Promise<ActionResult<{ cycleId: string }>> {
  return runAction(async () => {
    const result = await createCycle(input);
    revalidateApp();
    return result;
  });
}

export async function openCycleAction(input: unknown): Promise<ActionResult<{ cycleId: string; participants: number }>> {
  return runAction(async () => {
    const result = await openCycle(input);
    revalidateApp();
    dispatchNotificationsAfterResponse();
    return result;
  });
}

export async function closeCycleAction(input: unknown): Promise<ActionResult<{ cycleId: string; archived: number }>> {
  return runAction(async () => {
    const result = await closeCycle(input);
    revalidateApp();
    return result;
  });
}

/** "הפעלת תזכורות" – מריץ את המשימה היומית מיד (תזכורות שהגיע זמנן + שליחת כל הממתין) */
export async function triggerRemindersAction(): Promise<ActionResult<DailyJobResult>> {
  return runAction(async () => {
    const result = await triggerRemindersNow();
    revalidateApp();
    return result;
  });
}

export async function createUserAction(input: unknown): Promise<ActionResult<{ userId: string }>> {
  return runAction(async () => {
    const result = await createUser(input);
    revalidateApp();
    return result;
  });
}

export async function updateUserAction(input: unknown): Promise<ActionResult<{ userId: string }>> {
  return runAction(async () => {
    const result = await updateUser(input);
    revalidateApp();
    return result;
  });
}

export async function deactivateUserAction(input: unknown): Promise<ActionResult<{ userId: string }>> {
  return runAction(async () => {
    const result = await deactivateUser(input);
    revalidateApp();
    return result;
  });
}

async function readUploadedWorkbook(formData: FormData): Promise<Uint8Array> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw validationError("יש לבחור קובץ Excel.");
  if (file.size > MAX_IMPORT_FILE_BYTES) throw validationError("הקובץ גדול מדי (מקסימום 1MB).");
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw validationError("יש להעלות קובץ בפורמט ‎.xlsx.");
  return new Uint8Array(await file.arrayBuffer());
}

/** שלב 1 בייבוא: בדיקת הקובץ והצגת מה ישתנה – ללא שמירה */
export async function previewEmployeeImportAction(formData: FormData): Promise<ActionResult<ImportPreview>> {
  return runAction(async () => previewEmployeeImport(await readUploadedWorkbook(formData)));
}

/** שלב 2 בייבוא: שמירה (הכל או כלום). הקובץ נבדק מחדש בשרת לפני השמירה. */
export async function applyEmployeeImportAction(formData: FormData): Promise<ActionResult<ImportApplyResult>> {
  return runAction(async () => {
    const result = await applyEmployeeImport(await readUploadedWorkbook(formData));
    revalidateApp();
    return result;
  });
}

export async function createTemplateAction(input: unknown): Promise<ActionResult<{ templateId: string; version: number }>> {
  return runAction(async () => {
    const result = await createTemplateVersion(input);
    revalidateApp();
    return result;
  });
}

export async function updateTemplateAction(input: unknown): Promise<ActionResult<{ templateId: string }>> {
  return runAction(async () => {
    const result = await updateTemplate(input);
    revalidateApp();
    return result;
  });
}

export async function cloneTemplateAction(input: unknown): Promise<ActionResult<{ templateId: string; version: number }>> {
  return runAction(async () => {
    const result = await cloneTemplate(input);
    revalidateApp();
    return result;
  });
}
