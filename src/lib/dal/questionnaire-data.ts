import "server-only";
import { QuestionAudience, QuestionType, Respondent } from "@/generated/prisma/enums";
import type { DbClient } from "@/lib/db";
import { prisma } from "@/lib/db";
import { validationError } from "@/lib/errors";
import type { ScoringCategory, ScoringQuestion } from "@/lib/domain/scoring";
import type { AnswerInput } from "@/lib/validation/schemas";

/** טעינת מבנה שאלון של מחזור ובדיקת תשובות מולו – משותף להערכה עצמית, הערכת מנהל ודוח השוואתי. */

export interface QuestionDTO {
  id: string;
  text: string;
  helpText: string | null;
  type: QuestionType;
  audience: QuestionAudience;
  isRequired: boolean;
  order: number;
  categoryId: string | null;
}

export interface CategoryDTO {
  id: string;
  key: string;
  name: string;
  nameEn: string;
  weight: number;
  order: number;
}

export interface TemplateStructure {
  templateId: string;
  categories: CategoryDTO[];
  questions: QuestionDTO[];
}

export async function loadTemplateStructure(templateId: string, db: DbClient = prisma): Promise<TemplateStructure> {
  const [categories, questions] = await Promise.all([
    db.category.findMany({
      where: { templateId },
      orderBy: { order: "asc" },
      select: { id: true, key: true, name: true, nameEn: true, weight: true, order: true },
    }),
    db.question.findMany({
      where: { templateId },
      orderBy: { order: "asc" },
      select: { id: true, text: true, helpText: true, type: true, audience: true, isRequired: true, order: true, categoryId: true },
    }),
  ]);
  return { templateId, categories, questions };
}

export function audienceFor(respondent: Respondent): QuestionAudience {
  return respondent === Respondent.EMPLOYEE ? QuestionAudience.EMPLOYEE : QuestionAudience.MANAGER;
}

export function questionsForRespondent(structure: TemplateStructure, respondent: Respondent): QuestionDTO[] {
  const audience = audienceFor(respondent);
  return structure.questions.filter(
    (question) => question.audience === audience || question.audience === QuestionAudience.BOTH,
  );
}

export function scoringInputs(structure: TemplateStructure): { categories: ScoringCategory[]; questions: ScoringQuestion[] } {
  return {
    categories: structure.categories.map((category) => ({
      id: category.id,
      key: category.key,
      name: category.name,
      weight: category.weight,
      order: category.order,
    })),
    questions: structure.questions
      .filter((question): question is QuestionDTO & { categoryId: string } => question.type === QuestionType.RATING && question.categoryId !== null)
      .map((question) => ({ id: question.id, categoryId: question.categoryId, text: question.text, order: question.order })),
  };
}

export interface NormalizedAnswer {
  questionId: string;
  score: number | null;
  textAnswer: string | null;
}

/**
 * מוודא שכל תשובה שייכת לשאלה שמותרת לצד המשיב, ושסוג הערך מתאים לסוג השאלה.
 * תשובה ריקה (ללא ציון וללא טקסט) מסמנת מחיקה של תשובה קיימת.
 */
export function normalizeAnswers(
  allowedQuestions: readonly QuestionDTO[],
  answers: readonly AnswerInput[],
): NormalizedAnswer[] {
  const byId = new Map(allowedQuestions.map((question) => [question.id, question]));
  const seen = new Set<string>();
  const fieldErrors: Record<string, string[]> = {};

  const normalized = answers.map((answer) => {
    const question = byId.get(answer.questionId);
    if (!question) {
      throw validationError("התשובות כוללות שאלה שאינה שייכת לשאלון זה.");
    }
    if (seen.has(answer.questionId)) {
      throw validationError("שאלה הופיעה יותר מפעם אחת.");
    }
    seen.add(answer.questionId);

    const score = answer.score ?? null;
    const textAnswer = answer.textAnswer?.trim() ? answer.textAnswer.trim() : null;

    if (question.type === QuestionType.OPEN_TEXT && score !== null) {
      (fieldErrors[question.id] ??= []).push("לשאלה פתוחה לא ניתן לתת ציון.");
    }
    return { questionId: question.id, score: question.type === QuestionType.RATING ? score : null, textAnswer };
  });

  if (Object.keys(fieldErrors).length > 0) {
    throw validationError("חלק מהתשובות אינן תקינות.", fieldErrors);
  }
  return normalized;
}

/** בהגשה: כל שאלות הדירוג חייבות ציון, וכל שאלה פתוחה המסומנת כחובה חייבת טקסט. */
export function assertComplete(
  allowedQuestions: readonly QuestionDTO[],
  finalAnswers: ReadonlyMap<string, { score: number | null; textAnswer: string | null }>,
): void {
  const fieldErrors: Record<string, string[]> = {};
  for (const question of allowedQuestions) {
    const answer = finalAnswers.get(question.id);
    if (question.type === QuestionType.RATING && (answer?.score ?? null) === null) {
      (fieldErrors[question.id] ??= []).push("יש לדרג שאלה זו.");
    }
    if (question.type === QuestionType.OPEN_TEXT && question.isRequired && !answer?.textAnswer) {
      (fieldErrors[question.id] ??= []).push("יש לענות על שאלה זו.");
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw validationError("לא ניתן לשלוח – יש שאלות שטרם נענו.", fieldErrors);
  }
}
