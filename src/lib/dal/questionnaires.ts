import "server-only";
import { AuditAction, QuestionAudience, QuestionType } from "@/generated/prisma/enums";
import { isUniqueViolation, prisma, type DbClient } from "@/lib/db";
import { conflict, notFound, readOnly } from "@/lib/errors";
import { recordAudit } from "@/lib/dal/audit";
import { loadTemplateStructure, type TemplateStructure } from "@/lib/dal/questionnaire-data";
import { requireAdmin } from "@/lib/dal/session";
import {
  parseInput,
  templateInputSchema,
  templateRefSchema,
  updateTemplateSchema,
  type TemplateInput,
} from "@/lib/validation/schemas";

/**
 * ניהול שאלונים עם גרסאות (SPEC §3): שאלון שכבר שויך למחזור ננעל.
 * שינוי בין מחזורים = יצירת גרסה חדשה (cloneTemplate), כך שהיסטוריית שנים קודמות נשמרת.
 */

export interface TemplateSummaryDTO {
  id: string;
  name: string;
  version: number;
  description: string | null;
  isLocked: boolean;
  createdAt: Date;
  categoriesCount: number;
  questionsCount: number;
  cyclesCount: number;
}

export interface TemplateDetailDTO extends TemplateStructure {
  name: string;
  version: number;
  description: string | null;
  isLocked: boolean;
}

export async function listTemplates(): Promise<TemplateSummaryDTO[]> {
  await requireAdmin();
  const templates = await prisma.questionnaireTemplate.findMany({
    orderBy: [{ name: "asc" }, { version: "desc" }],
    select: {
      id: true,
      name: true,
      version: true,
      description: true,
      isLocked: true,
      createdAt: true,
      _count: { select: { categories: true, questions: true, cycles: true } },
    },
  });
  return templates.map(({ _count, ...template }) => ({
    ...template,
    categoriesCount: _count.categories,
    questionsCount: _count.questions,
    cyclesCount: _count.cycles,
  }));
}

export async function getTemplate(templateId: string): Promise<TemplateDetailDTO> {
  await requireAdmin();
  const template = await prisma.questionnaireTemplate.findUnique({
    where: { id: templateId },
    select: { name: true, version: true, description: true, isLocked: true },
  });
  if (!template) throw notFound("השאלון");
  return { ...template, ...(await loadTemplateStructure(templateId)) };
}

/** כותב קטגוריות ושאלות לתבנית (התבנית חייבת להיות ריקה). */
async function writeTemplateContent(db: DbClient, templateId: string, input: TemplateInput): Promise<void> {
  let order = 1;
  for (const [categoryIndex, categoryInput] of input.categories.entries()) {
    const category = await db.category.create({
      data: {
        templateId,
        key: categoryInput.key,
        name: categoryInput.name,
        nameEn: categoryInput.nameEn,
        weight: categoryInput.weight,
        order: categoryIndex + 1,
      },
      select: { id: true },
    });
    await db.question.createMany({
      data: categoryInput.questions.map((question) => ({
        templateId,
        categoryId: category.id,
        text: question.text,
        helpText: question.helpText ?? null,
        type: QuestionType.RATING,
        audience: QuestionAudience.BOTH,
        isRequired: true,
        order: order++,
      })),
    });
  }
  if (input.openQuestions.length > 0) {
    await db.question.createMany({
      data: input.openQuestions.map((question) => ({
        templateId,
        text: question.text,
        type: QuestionType.OPEN_TEXT,
        audience: question.audience,
        isRequired: false,
        order: order++,
      })),
    });
  }
}

async function nextVersion(db: DbClient, name: string): Promise<number> {
  const latest = await db.questionnaireTemplate.findFirst({
    where: { name },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

export async function createTemplateVersion(rawInput: unknown): Promise<{ templateId: string; version: number }> {
  const admin = await requireAdmin();
  const input = parseInput(templateInputSchema, rawInput);

  try {
    return await prisma.$transaction(async (tx) => {
      const version = await nextVersion(tx, input.name);
      const template = await tx.questionnaireTemplate.create({
        data: { name: input.name, version, description: input.description ?? null, isLocked: false },
        select: { id: true },
      });
      await writeTemplateContent(tx, template.id, input);
      await recordAudit(
        {
          action: AuditAction.QUESTIONNAIRE_CREATED,
          entityType: "QuestionnaireTemplate",
          entityId: template.id,
          actorId: admin.id,
          metadata: { name: input.name, version },
        },
        tx,
      );
      return { templateId: template.id, version };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("גרסה זו של השאלון נוצרה במקביל. נסו שוב.");
    throw error;
  }
}

export async function updateTemplate(rawInput: unknown): Promise<{ templateId: string }> {
  const admin = await requireAdmin();
  const { templateId } = parseInput(templateRefSchema, rawInput);

  const existing = await prisma.questionnaireTemplate.findUnique({
    where: { id: templateId },
    select: { isLocked: true, _count: { select: { cycles: true } } },
  });
  if (!existing) throw notFound("השאלון");
  if (existing.isLocked || existing._count.cycles > 0) {
    throw readOnly("השאלון כבר שויך למחזור הערכה ולכן נעול. צרו ממנו גרסה חדשה לעריכה.");
  }
  const input = parseInput(updateTemplateSchema, rawInput);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.question.deleteMany({ where: { templateId: input.templateId } });
      await tx.category.deleteMany({ where: { templateId: input.templateId } });
      await tx.questionnaireTemplate.update({
        where: { id: input.templateId },
        data: { name: input.name, description: input.description ?? null },
      });
      await writeTemplateContent(tx, input.templateId, input);
      await recordAudit(
        {
          action: AuditAction.QUESTIONNAIRE_UPDATED,
          entityType: "QuestionnaireTemplate",
          entityId: input.templateId,
          actorId: admin.id,
        },
        tx,
      );
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("כבר קיימת גרסה עם שם זה ומספר גרסה זהה.");
    throw error;
  }
  return { templateId: input.templateId };
}

/** יוצר גרסה חדשה ופתוחה לעריכה מתוך שאלון קיים (גם נעול). */
export async function cloneTemplate(rawInput: unknown): Promise<{ templateId: string; version: number }> {
  const admin = await requireAdmin();
  const { templateId } = parseInput(templateRefSchema, rawInput);

  const source = await prisma.questionnaireTemplate.findUnique({
    where: { id: templateId },
    select: { name: true, description: true },
  });
  if (!source) throw notFound("השאלון");
  const structure = await loadTemplateStructure(templateId);

  const input: TemplateInput = {
    name: source.name,
    description: source.description,
    categories: structure.categories.map((category) => ({
      key: category.key,
      name: category.name,
      nameEn: category.nameEn,
      weight: category.weight,
      questions: structure.questions
        .filter((question) => question.categoryId === category.id && question.type === QuestionType.RATING)
        .map((question) => ({ text: question.text, helpText: question.helpText })),
    })),
    openQuestions: structure.questions
      .filter((question) => question.type === QuestionType.OPEN_TEXT)
      .map((question) => ({ text: question.text, audience: question.audience })),
  };

  try {
    return await prisma.$transaction(async (tx) => {
      const version = await nextVersion(tx, source.name);
      const template = await tx.questionnaireTemplate.create({
        data: { name: source.name, version, description: source.description, isLocked: false },
        select: { id: true },
      });
      await writeTemplateContent(tx, template.id, input);
      await recordAudit(
        {
          action: AuditAction.QUESTIONNAIRE_CREATED,
          entityType: "QuestionnaireTemplate",
          entityId: template.id,
          actorId: admin.id,
          metadata: { clonedFrom: templateId, version },
        },
        tx,
      );
      return { templateId: template.id, version };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("גרסה זו של השאלון נוצרה במקביל. נסו שוב.");
    throw error;
  }
}
