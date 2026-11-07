import { z } from "zod";
import { QuestionAudience, Role } from "@/generated/prisma/enums";
import { validationError } from "@/lib/errors";

/**
 * סכמות Zod לכל קלט שמגיע מהלקוח. משמשות בצד שרת (DAL) ויכולות לשמש גם את React Hook Form בצד לקוח.
 */

export const idSchema = z.string().trim().min(1).max(64);

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const requiredText = (min: number, max: number, message: string) => z.string().trim().min(min, message).max(max);

// -----------------------------------------------------------------------------
// הערכות
// -----------------------------------------------------------------------------

export const answerInputSchema = z.object({
  questionId: idSchema,
  score: z.number().int().min(1, "ציון חייב להיות בין 1 ל-5").max(5, "ציון חייב להיות בין 1 ל-5").nullable().optional(),
  textAnswer: optionalText(5000),
});
export type AnswerInput = z.infer<typeof answerInputSchema>;

export const saveAssessmentSchema = z.object({
  evaluationId: idSchema,
  answers: z.array(answerInputSchema).max(200),
  /** true = "שלח הערכה" (נעילה), false = שמירת טיוטה */
  submit: z.boolean(),
});
export type SaveAssessmentInput = z.infer<typeof saveAssessmentSchema>;

export const saveManagerAssessmentSchema = saveAssessmentSchema.extend({
  isHighPotential: z.boolean().optional(),
});
export type SaveManagerAssessmentInput = z.infer<typeof saveManagerAssessmentSchema>;

// -----------------------------------------------------------------------------
// שיחת משוב
// -----------------------------------------------------------------------------

export const scheduleMeetingSchema = z.object({
  evaluationId: idSchema,
  scheduledAt: z.coerce.date({ error: "תאריך לא תקין" }),
  location: optionalText(200),
});
export type ScheduleMeetingInput = z.infer<typeof scheduleMeetingSchema>;

export const feedbackSummarySchema = z.object({
  evaluationId: idSchema,
  heldAt: z.coerce.date().nullable().optional(),
  achievements: optionalText(10000),
  strengths: optionalText(10000),
  improvementAreas: optionalText(10000),
  developmentOpportunities: optionalText(10000),
  summary: optionalText(10000),
  managerComments: optionalText(10000),
  employeeComments: optionalText(10000),
});
export type FeedbackSummaryInput = z.infer<typeof feedbackSummarySchema>;

export const evaluationRefSchema = z.object({ evaluationId: idSchema });

export const acknowledgeFeedbackSchema = z.object({
  evaluationId: idSchema,
  employeeComments: optionalText(10000),
});
export type AcknowledgeFeedbackInput = z.infer<typeof acknowledgeFeedbackSchema>;

// -----------------------------------------------------------------------------
// יעדים (3–5, סכום משקלים 100)
// -----------------------------------------------------------------------------

export const MIN_GOALS = 3;
export const MAX_GOALS = 5;

export const goalInputSchema = z.object({
  title: requiredText(2, 200, "יש להזין שם יעד"),
  description: requiredText(1, 2000, "יש להזין תיאור"),
  kpi: requiredText(1, 500, "יש להזין מדד הצלחה"),
  weight: z.number().int().min(1, "משקל מינימלי 1%").max(100, "משקל מקסימלי 100%"),
  dueDate: z.coerce.date({ error: "תאריך יעד לא תקין" }),
});
export type GoalInput = z.infer<typeof goalInputSchema>;

export const saveGoalsSchema = z
  .object({
    evaluationId: idSchema,
    goals: z
      .array(goalInputSchema)
      .min(MIN_GOALS, `יש להגדיר לפחות ${MIN_GOALS} יעדים`)
      .max(MAX_GOALS, `ניתן להגדיר עד ${MAX_GOALS} יעדים`),
  })
  .superRefine((value, context) => {
    const total = value.goals.reduce((sum, goal) => sum + goal.weight, 0);
    if (total !== 100) {
      context.addIssue({ code: "custom", path: ["goals"], message: `סכום משקלי היעדים חייב להיות 100% (כרגע ${total}%)` });
    }
  });
export type SaveGoalsInput = z.infer<typeof saveGoalsSchema>;

// -----------------------------------------------------------------------------
// מחזורי הערכה
// -----------------------------------------------------------------------------

export const createCycleSchema = z
  .object({
    name: requiredText(2, 120, "יש להזין שם מחזור"),
    year: z.number().int().min(2000).max(2100),
    templateId: idSchema,
    startDate: z.coerce.date(),
    selfAssessmentDueDate: z.coerce.date(),
    managerAssessmentDueDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .superRefine((value, context) => {
    if (value.selfAssessmentDueDate < value.startDate) {
      context.addIssue({ code: "custom", path: ["selfAssessmentDueDate"], message: "מועד ההערכה העצמית חייב להיות אחרי תאריך הפתיחה" });
    }
    if (value.managerAssessmentDueDate < value.selfAssessmentDueDate) {
      context.addIssue({ code: "custom", path: ["managerAssessmentDueDate"], message: "מועד הערכת המנהל חייב להיות אחרי מועד ההערכה העצמית" });
    }
    if (value.endDate < value.managerAssessmentDueDate) {
      context.addIssue({ code: "custom", path: ["endDate"], message: "תאריך הסיום חייב להיות אחרי מועד הערכת המנהל" });
    }
  });
export type CreateCycleInput = z.infer<typeof createCycleSchema>;

export const cycleRefSchema = z.object({ cycleId: idSchema });

// -----------------------------------------------------------------------------
// משתמשים
// -----------------------------------------------------------------------------

export const userInputSchema = z.object({
  employeeNumber: requiredText(1, 32, "יש להזין מספר עובד"),
  fullName: requiredText(2, 120, "יש להזין שם מלא"),
  email: z.email("כתובת אימייל לא תקינה").transform((email) => email.toLowerCase()),
  jobTitle: requiredText(1, 120, "יש להזין תפקיד"),
  departmentId: idSchema,
  role: z.enum(Role),
  managerId: idSchema.nullable(),
  hireDate: z.coerce.date({ error: "תאריך לא תקין" }),
});
export type UserInput = z.infer<typeof userInputSchema>;

export const updateUserSchema = userInputSchema.extend({ userId: idSchema });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userRefSchema = z.object({ userId: idSchema });

// -----------------------------------------------------------------------------
// שאלונים
// -----------------------------------------------------------------------------

export const templateInputSchema = z
  .object({
    name: requiredText(2, 120, "יש להזין שם שאלון"),
    description: optionalText(1000),
    categories: z
      .array(
        z.object({
          key: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,39}$/, "מפתח באותיות לועזיות גדולות, לדוגמה PROFESSIONAL"),
          name: requiredText(1, 120, "יש להזין שם קטגוריה"),
          nameEn: requiredText(1, 120, "יש להזין שם באנגלית"),
          weight: z.number().int().min(1).max(100),
          questions: z
            .array(z.object({ text: requiredText(3, 500, "יש להזין נוסח שאלה"), helpText: optionalText(500) }))
            .min(1, "לכל קטגוריה נדרשת לפחות שאלה אחת"),
        }),
      )
      .min(1)
      .max(10),
    openQuestions: z
      .array(z.object({ text: requiredText(3, 500, "יש להזין נוסח שאלה"), audience: z.enum(QuestionAudience) }))
      .max(20),
  })
  .superRefine((value, context) => {
    const total = value.categories.reduce((sum, category) => sum + category.weight, 0);
    if (total !== 100) {
      context.addIssue({ code: "custom", path: ["categories"], message: `סכום משקלי הקטגוריות חייב להיות 100% (כרגע ${total}%)` });
    }
    const keys = value.categories.map((category) => category.key);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: "custom", path: ["categories"], message: "מפתחות קטגוריה חייבים להיות ייחודיים" });
    }
  });
export type TemplateInput = z.infer<typeof templateInputSchema>;

export const updateTemplateSchema = templateInputSchema.safeExtend({ templateId: idSchema });
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const templateRefSchema = z.object({ templateId: idSchema });

// -----------------------------------------------------------------------------
// עזר
// -----------------------------------------------------------------------------

/** מאמת קלט לא אמין; בכישלון זורק AppError מסוג VALIDATION עם שגיאות לפי שדה. */
export function parseInput<Schema extends z.ZodType>(schema: Schema, input: unknown): z.output<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join(".") : "_form";
      (fieldErrors[path] ??= []).push(issue.message);
    }
    const firstMessage = result.error.issues[0]?.message ?? "הנתונים שנשלחו אינם תקינים.";
    throw validationError(firstMessage, fieldErrors);
  }
  return result.data;
}
