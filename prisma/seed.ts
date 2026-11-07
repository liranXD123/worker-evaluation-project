/**
 * Seed – מערכת הערכת עובדים
 *
 * יוצר נתוני דמה מלאים:
 *  - 6 מחלקות, 22 משתמשים (HR, מנכ"ל, 4 מנהלים, 16 עובדים) עם היררכיה מלאה
 *  - תבנית שאלון גרסה 1 (2025) וגרסה 2 (2026) – להדגמת שינוי שאלון בין מחזורים
 *  - מחזור 2025 סגור (ARCHIVED) עם הערכות, שיחות משוב ויעדים – היסטוריה רב-שנתית
 *  - מחזור 2026 פעיל עם הערכות בכל אחד מ-7 הסטטוסים הפעילים
 *  - התראות (Notifications) ו-Audit Log תואמים
 *
 * הרצה: npx prisma db seed
 * להתחברות עם חשבון Entra אמיתי כ-HR: הגדירו SEED_ADMIN_EMAIL ב-.env לפני ההרצה.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  AssessmentStatus,
  AuditAction,
  CycleStatus,
  EvaluationStatus,
  FeedbackMeetingStatus,
  GoalStatus,
  NotificationStatus,
  NotificationType,
  Prisma,
  PrismaClient,
  QuestionAudience,
  QuestionType,
  Respondent,
  Role,
} from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not defined. Add it to .env before running the seed.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// -----------------------------------------------------------------------------
// עזרי זמן ואקראיות דטרמיניסטית (אותה תוצאה בכל הרצה)
// -----------------------------------------------------------------------------

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = createRandom(20261106);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

function clampScore(value: number): number {
  return Math.min(5, Math.max(1, Math.round(value)));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date();

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function dateOnly(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

// -----------------------------------------------------------------------------
// הגדרות שאלון
// -----------------------------------------------------------------------------

interface CategoryDefinition {
  key: string;
  name: string;
  nameEn: string;
  weight: number;
  questions: readonly string[];
}

interface OpenQuestionDefinition {
  text: string;
  audience: QuestionAudience;
}

const CATEGORY_DEFINITIONS: readonly CategoryDefinition[] = [
  {
    key: "PROFESSIONAL",
    name: "מקצועיות",
    nameEn: "Professional Skills",
    weight: 30,
    questions: [
      "רמת הידע המקצועי והשליטה בתחום האחריות",
      "איכות ודיוק תוצרי העבודה",
    ],
  },
  {
    key: "ACCOUNTABILITY",
    name: "אחריות",
    nameEn: "Accountability",
    weight: 25,
    questions: [
      "עמידה בלוחות זמנים ובהתחייבויות",
      "לקיחת בעלות על משימות ותוצאות",
    ],
  },
  {
    key: "TEAMWORK",
    name: "עבודת צוות",
    nameEn: "Teamwork",
    weight: 20,
    questions: [
      "שיתוף פעולה עם עמיתים וממשקים",
      "שיתוף ידע ותמיכה בחברי הצוות",
    ],
  },
  {
    key: "INITIATIVE",
    name: "יוזמה",
    nameEn: "Initiative",
    weight: 15,
    questions: [
      "הצעת רעיונות ושיפורים לתהליכי עבודה",
      "פעולה עצמאית ללא צורך בהכוונה צמודה",
    ],
  },
  {
    key: "SERVICE",
    name: "שירות פנים/חוץ ארגוני",
    nameEn: "Customer/Internal Service",
    weight: 10,
    questions: [
      "יחס ושירות ללקוחות פנימיים וחיצוניים",
      "זמינות ומענה מהיר לפניות",
    ],
  },
];

const OPEN_QUESTIONS_V1: readonly OpenQuestionDefinition[] = [
  { text: "מהם ההישגים המרכזיים שלך בשנה האחרונה?", audience: QuestionAudience.EMPLOYEE },
  { text: "באילו תחומים היית רוצה להתפתח?", audience: QuestionAudience.EMPLOYEE },
  { text: "מהן החוזקות הבולטות של העובד/ת?", audience: QuestionAudience.MANAGER },
  { text: "אילו תחומים דורשים שיפור?", audience: QuestionAudience.MANAGER },
];

const OPEN_QUESTIONS_V2: readonly OpenQuestionDefinition[] = [
  ...OPEN_QUESTIONS_V1,
  { text: "איזו תמיכה תעזור לך להצליח יותר בשנה הבאה?", audience: QuestionAudience.EMPLOYEE },
  { text: "האם העובד/ת מוכן/ה לתפקיד בעל אחריות רחבה יותר? פרט/י.", audience: QuestionAudience.MANAGER },
];

interface SeededTemplate {
  id: string;
  ratingQuestions: { id: string; categoryKey: string }[];
  openQuestions: { id: string; audience: QuestionAudience }[];
}

async function createTemplate(
  version: number,
  description: string,
  openQuestions: readonly OpenQuestionDefinition[],
): Promise<SeededTemplate> {
  const template = await prisma.questionnaireTemplate.create({
    data: {
      name: "שאלון הערכה שנתי",
      version,
      description,
      isLocked: true,
    },
  });

  const ratingQuestions: SeededTemplate["ratingQuestions"] = [];
  let questionOrder = 1;

  for (const [categoryIndex, definition] of CATEGORY_DEFINITIONS.entries()) {
    const category = await prisma.category.create({
      data: {
        templateId: template.id,
        key: definition.key,
        name: definition.name,
        nameEn: definition.nameEn,
        weight: definition.weight,
        order: categoryIndex + 1,
      },
    });

    for (const text of definition.questions) {
      const question = await prisma.question.create({
        data: {
          templateId: template.id,
          categoryId: category.id,
          text,
          type: QuestionType.RATING,
          audience: QuestionAudience.BOTH,
          helpText: "1 = לא עומד בציפיות · 3 = עומד בציפיות · 5 = מעל ומעבר",
          order: questionOrder++,
        },
      });
      ratingQuestions.push({ id: question.id, categoryKey: definition.key });
    }
  }

  const seededOpenQuestions: SeededTemplate["openQuestions"] = [];
  for (const definition of openQuestions) {
    const question = await prisma.question.create({
      data: {
        templateId: template.id,
        text: definition.text,
        type: QuestionType.OPEN_TEXT,
        audience: definition.audience,
        isRequired: false,
        order: questionOrder++,
      },
    });
    seededOpenQuestions.push({ id: question.id, audience: definition.audience });
  }

  return { id: template.id, ratingQuestions, openQuestions: seededOpenQuestions };
}

// -----------------------------------------------------------------------------
// ציון משוקלל: ממוצע לכל קטגוריה × משקל הקטגוריה
// -----------------------------------------------------------------------------

function weightedScore(
  ratingQuestions: SeededTemplate["ratingQuestions"],
  scores: Map<string, number>,
): Prisma.Decimal {
  let total = 0;
  for (const definition of CATEGORY_DEFINITIONS) {
    const categoryScores = ratingQuestions
      .filter((question) => question.categoryKey === definition.key)
      .map((question) => scores.get(question.id))
      .filter((score): score is number => score !== undefined);
    const average = categoryScores.reduce((sum, score) => sum + score, 0) / categoryScores.length;
    total += (average * definition.weight) / 100;
  }
  return new Prisma.Decimal(total.toFixed(2));
}

// -----------------------------------------------------------------------------
// טקסטים לדוגמה
// -----------------------------------------------------------------------------

const EMPLOYEE_OPEN_ANSWERS: readonly string[] = [
  "הובלתי את המעבר למערכת החדשה וסיימתי אותו לפני המועד שנקבע.",
  "שיפרתי את זמני הטיפול בפניות בכ-20% באמצעות אוטומציה של דוחות.",
  "חניכה של שני עובדים חדשים בצוות ושילובם המלא בעבודה.",
  "אשמח להעמיק בניהול פרויקטים ולקחת אחריות על ממשקים נוספים.",
  "רוצה להתפתח בתחום ניתוח הנתונים ולעבור הכשרה מקצועית.",
  "הדרכה מסודרת ושעות ייעודיות ללמידה יעזרו לי מאוד.",
];

const MANAGER_OPEN_ANSWERS: readonly string[] = [
  "עובד/ת מקצועי/ת מאוד, אמין/ה ובעל/ת ראייה מערכתית.",
  "מפגין/ה יוזמה ושיתוף פעולה יוצא דופן עם צוותים אחרים.",
  "נדרש שיפור בתיעדוף משימות ובעמידה בלוחות זמנים בתקופות עומס.",
  "מומלץ לחזק מיומנויות הצגה מול הנהלה ולקוחות.",
  "כן – מוכן/ה להוביל צוות קטן במהלך השנה הקרובה.",
  "עדיין לא – נדרשת שנה נוספת של התבססות בתפקיד הנוכחי.",
];

const GOAL_TEMPLATES: readonly { title: string; description: string; kpi: string }[] = [
  {
    title: "שיפור זמני תגובה",
    description: "קיצור זמן הטיפול הממוצע בפניות בתחום האחריות.",
    kpi: "ירידה של 15% בזמן הטיפול הממוצע",
  },
  {
    title: "השלמת הכשרה מקצועית",
    description: "השלמת קורס מקצועי מוכר בתחום והטמעת הנלמד בעבודה.",
    kpi: "תעודת סיום + הצגת יישום לצוות",
  },
  {
    title: "הובלת פרויקט שיפור",
    description: "זיהוי תהליך לא יעיל והובלת שיפור מקצה לקצה.",
    kpi: "חיסכון של 10 שעות עבודה בחודש",
  },
  {
    title: "חניכת עובד חדש",
    description: "ליווי וחניכה של עובד חדש בצוות עד עצמאות מלאה.",
    kpi: "העובד החדש עומד ביעדי קליטה תוך 3 חודשים",
  },
  {
    title: "שביעות רצון לקוחות",
    description: "העלאת שביעות הרצון של לקוחות פנימיים וחיצוניים.",
    kpi: "ציון ממוצע 4.5 ומעלה בסקר שביעות רצון",
  },
];

const GOAL_WEIGHT_SETS: readonly (readonly number[])[] = [
  [40, 35, 25],
  [30, 30, 20, 20],
  [25, 25, 20, 15, 15],
];

// -----------------------------------------------------------------------------
// נתוני משתמשים
// -----------------------------------------------------------------------------

interface UserSeed {
  key: string;
  employeeNumber: string;
  fullName: string;
  email: string;
  jobTitle: string;
  department: string;
  role: Role;
  managerKey: string | null;
  hireDate: Date;
}

const DEPARTMENTS: readonly { code: string; name: string }[] = [
  { code: "MGMT", name: "הנהלה" },
  { code: "HR", name: "משאבי אנוש" },
  { code: "RND", name: "פיתוח" },
  { code: "SALES", name: "מכירות" },
  { code: "SUPPORT", name: "שירות לקוחות" },
  { code: "FIN", name: "כספים" },
];

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "hr.admin@example.com";

const USERS: readonly UserSeed[] = [
  { key: "hr", employeeNumber: "E1001", fullName: "מיכל אברהם", email: ADMIN_EMAIL, jobTitle: "מנהלת משאבי אנוש", department: "HR", role: Role.ADMIN, managerKey: "ceo", hireDate: dateOnly(2018, 3, 1) },
  { key: "ceo", employeeNumber: "E1000", fullName: "דוד לוי", email: "david.levi@example.com", jobTitle: "מנכ\"ל", department: "MGMT", role: Role.MANAGER, managerKey: null, hireDate: dateOnly(2015, 1, 1) },

  { key: "mgrRnd", employeeNumber: "E1010", fullName: "יוסי כהן", email: "yossi.cohen@example.com", jobTitle: "מנהל פיתוח", department: "RND", role: Role.MANAGER, managerKey: "ceo", hireDate: dateOnly(2017, 6, 15) },
  { key: "mgrSales", employeeNumber: "E1020", fullName: "רונית מזרחי", email: "ronit.mizrahi@example.com", jobTitle: "מנהלת מכירות", department: "SALES", role: Role.MANAGER, managerKey: "ceo", hireDate: dateOnly(2019, 2, 10) },
  { key: "mgrSupport", employeeNumber: "E1030", fullName: "אבי פרץ", email: "avi.peretz@example.com", jobTitle: "מנהל שירות לקוחות", department: "SUPPORT", role: Role.MANAGER, managerKey: "ceo", hireDate: dateOnly(2016, 9, 1) },
  { key: "mgrFin", employeeNumber: "E1040", fullName: "שרה ביטון", email: "sara.biton@example.com", jobTitle: "מנהלת כספים", department: "FIN", role: Role.MANAGER, managerKey: "ceo", hireDate: dateOnly(2018, 11, 20) },

  { key: "rnd1", employeeNumber: "E2001", fullName: "נועה פרידמן", email: "noa.friedman@example.com", jobTitle: "מפתחת Full-Stack", department: "RND", role: Role.EMPLOYEE, managerKey: "mgrRnd", hireDate: dateOnly(2020, 4, 1) },
  { key: "rnd2", employeeNumber: "E2002", fullName: "איתי שפירא", email: "itay.shapira@example.com", jobTitle: "מפתח Backend", department: "RND", role: Role.EMPLOYEE, managerKey: "mgrRnd", hireDate: dateOnly(2021, 1, 17) },
  { key: "rnd3", employeeNumber: "E2003", fullName: "תמר גולן", email: "tamar.golan@example.com", jobTitle: "מהנדסת QA", department: "RND", role: Role.EMPLOYEE, managerKey: "mgrRnd", hireDate: dateOnly(2022, 8, 7) },
  { key: "rnd4", employeeNumber: "E2004", fullName: "עומר דהן", email: "omer.dahan@example.com", jobTitle: "מפתח Frontend", department: "RND", role: Role.EMPLOYEE, managerKey: "mgrRnd", hireDate: dateOnly(2023, 3, 12) },
  { key: "rnd5", employeeNumber: "E2005", fullName: "ליאור אזולאי", email: "lior.azulay@example.com", jobTitle: "מהנדס DevOps", department: "RND", role: Role.EMPLOYEE, managerKey: "mgrRnd", hireDate: dateOnly(2019, 10, 1) },

  { key: "sales1", employeeNumber: "E3001", fullName: "שירה רוזן", email: "shira.rosen@example.com", jobTitle: "מנהלת לקוחות", department: "SALES", role: Role.EMPLOYEE, managerKey: "mgrSales", hireDate: dateOnly(2021, 5, 2) },
  { key: "sales2", employeeNumber: "E3002", fullName: "גיא אוחיון", email: "guy.ohayon@example.com", jobTitle: "איש מכירות", department: "SALES", role: Role.EMPLOYEE, managerKey: "mgrSales", hireDate: dateOnly(2022, 2, 14) },
  { key: "sales3", employeeNumber: "E3003", fullName: "מאיה בן דוד", email: "maya.bendavid@example.com", jobTitle: "נציגת פיתוח עסקי", department: "SALES", role: Role.EMPLOYEE, managerKey: "mgrSales", hireDate: dateOnly(2020, 7, 19) },
  { key: "sales4", employeeNumber: "E3004", fullName: "רועי חדד", email: "roei.hadad@example.com", jobTitle: "איש מכירות", department: "SALES", role: Role.EMPLOYEE, managerKey: "mgrSales", hireDate: dateOnly(2024, 1, 7) },

  { key: "sup1", employeeNumber: "E4001", fullName: "הילה וקנין", email: "hila.vaknin@example.com", jobTitle: "נציגת שירות בכירה", department: "SUPPORT", role: Role.EMPLOYEE, managerKey: "mgrSupport", hireDate: dateOnly(2019, 3, 3) },
  { key: "sup2", employeeNumber: "E4002", fullName: "דניאל קפלן", email: "daniel.kaplan@example.com", jobTitle: "נציג שירות", department: "SUPPORT", role: Role.EMPLOYEE, managerKey: "mgrSupport", hireDate: dateOnly(2022, 10, 23) },
  { key: "sup3", employeeNumber: "E4003", fullName: "יעל סלע", email: "yael.sela@example.com", jobTitle: "נציגת תמיכה טכנית", department: "SUPPORT", role: Role.EMPLOYEE, managerKey: "mgrSupport", hireDate: dateOnly(2023, 6, 18) },
  { key: "sup4", employeeNumber: "E4004", fullName: "אלון טל", email: "alon.tal@example.com", jobTitle: "נציג שירות", department: "SUPPORT", role: Role.EMPLOYEE, managerKey: "mgrSupport", hireDate: dateOnly(2021, 12, 5) },

  { key: "fin1", employeeNumber: "E5001", fullName: "אורית נחום", email: "orit.nahum@example.com", jobTitle: "חשבת", department: "FIN", role: Role.EMPLOYEE, managerKey: "mgrFin", hireDate: dateOnly(2017, 1, 15) },
  { key: "fin2", employeeNumber: "E5002", fullName: "משה יוסף", email: "moshe.yosef@example.com", jobTitle: "מנהל חשבונות", department: "FIN", role: Role.EMPLOYEE, managerKey: "mgrFin", hireDate: dateOnly(2022, 4, 24) },
  { key: "fin3", employeeNumber: "E5003", fullName: "רחל עמר", email: "rachel.amar@example.com", jobTitle: "אנליסטית כספים", department: "FIN", role: Role.EMPLOYEE, managerKey: "mgrFin", hireDate: dateOnly(2023, 9, 10) },
];

// -----------------------------------------------------------------------------
// יצירת הערכה בודדת לפי סטטוס יעד
// -----------------------------------------------------------------------------

interface EvaluationScenario {
  cycleId: string;
  cycleStart: Date;
  template: SeededTemplate;
  employeeId: string;
  managerId: string;
  status: EvaluationStatus;
  /// "רמת ביצוע" בסיסית של העובד (1–5) – משפיעה על הציונים
  baseline: number;
  /// הטיית הערכה עצמית ביחס לבסיס (חיובי = העובד מעריך את עצמו גבוה יותר)
  selfBias: number;
  isHighPotential: boolean;
  archived: boolean;
}

interface CreatedEvaluation {
  id: string;
  employeeSubmittedAt: Date | null;
  managerSubmittedAt: Date | null;
}

function buildScores(
  template: SeededTemplate,
  baseline: number,
  bias: number,
  limit: number,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const question of template.ratingQuestions.slice(0, limit)) {
    const noise = random() * 1.4 - 0.7;
    scores.set(question.id, clampScore(baseline + bias + noise));
  }
  return scores;
}

function openAnswersFor(
  template: SeededTemplate,
  respondent: Respondent,
): { questionId: string; text: string }[] {
  const pool = respondent === Respondent.EMPLOYEE ? EMPLOYEE_OPEN_ANSWERS : MANAGER_OPEN_ANSWERS;
  const audience = respondent === Respondent.EMPLOYEE ? QuestionAudience.EMPLOYEE : QuestionAudience.MANAGER;
  return template.openQuestions
    .filter((question) => question.audience === audience || question.audience === QuestionAudience.BOTH)
    .map((question) => ({ questionId: question.id, text: pick(pool) }));
}

const STATUS_RANK: Record<EvaluationStatus, number> = {
  NOT_STARTED: 0,
  EMPLOYEE_IN_PROGRESS: 1,
  EMPLOYEE_COMPLETED: 2,
  MANAGER_IN_PROGRESS: 3,
  MANAGER_COMPLETED: 4,
  WAITING_FOR_FEEDBACK_MEETING: 5,
  COMPLETED: 6,
  ARCHIVED: 7,
};

async function createEvaluation(scenario: EvaluationScenario): Promise<CreatedEvaluation> {
  const rank = STATUS_RANK[scenario.status];
  const totalRatingQuestions = scenario.template.ratingQuestions.length;

  const employeeStarted = rank >= STATUS_RANK.EMPLOYEE_IN_PROGRESS;
  const employeeSubmitted = rank >= STATUS_RANK.EMPLOYEE_COMPLETED;
  const managerStarted = rank >= STATUS_RANK.MANAGER_IN_PROGRESS;
  const managerSubmitted = rank >= STATUS_RANK.MANAGER_COMPLETED;
  const meetingScheduled = rank >= STATUS_RANK.WAITING_FOR_FEEDBACK_MEETING;
  const fullyCompleted = rank >= STATUS_RANK.COMPLETED;

  // ציר זמן: כל האירועים של מחזור פעיל (שנפתח לפני 12 יום) נופלים בעבר
  const employeeStartedAt = employeeStarted ? addDays(scenario.cycleStart, 1) : null;
  const employeeSubmittedAt = employeeSubmitted ? addDays(scenario.cycleStart, 1 + Math.floor(random() * 3)) : null;
  const managerStartedAt = managerStarted && employeeSubmittedAt ? addDays(employeeSubmittedAt, 1) : null;
  const managerSubmittedAt =
    managerSubmitted && managerStartedAt ? addDays(managerStartedAt, Math.floor(random() * 3)) : null;
  const meetingAt = fullyCompleted && managerSubmittedAt ? addDays(managerSubmittedAt, 2) : addDays(NOW, 3);
  const completedAt = fullyCompleted ? addDays(meetingAt, 2) : null;

  const employeeScores = employeeStarted
    ? buildScores(
        scenario.template,
        scenario.baseline,
        scenario.selfBias,
        employeeSubmitted ? totalRatingQuestions : Math.ceil(totalRatingQuestions / 2),
      )
    : new Map<string, number>();

  const managerScores = managerStarted
    ? buildScores(
        scenario.template,
        scenario.baseline,
        0,
        managerSubmitted ? totalRatingQuestions : Math.ceil(totalRatingQuestions / 3),
      )
    : new Map<string, number>();

  const evaluation = await prisma.evaluation.create({
    data: {
      cycleId: scenario.cycleId,
      employeeId: scenario.employeeId,
      managerId: scenario.managerId,
      status: scenario.archived ? EvaluationStatus.ARCHIVED : scenario.status,
      employeeStatus: employeeSubmitted
        ? AssessmentStatus.SUBMITTED
        : employeeStarted
          ? AssessmentStatus.DRAFT
          : AssessmentStatus.NOT_STARTED,
      employeeStartedAt,
      employeeSubmittedAt,
      employeeWeightedScore: employeeSubmitted ? weightedScore(scenario.template.ratingQuestions, employeeScores) : null,
      managerStatus: managerSubmitted
        ? AssessmentStatus.SUBMITTED
        : managerStarted
          ? AssessmentStatus.DRAFT
          : AssessmentStatus.NOT_STARTED,
      managerStartedAt,
      managerSubmittedAt,
      managerWeightedScore: managerSubmitted ? weightedScore(scenario.template.ratingQuestions, managerScores) : null,
      comparisonUnlockedAt: managerSubmittedAt,
      isHighPotential: managerSubmitted && scenario.isHighPotential,
      completedAt,
      archivedAt: scenario.archived ? addDays(scenario.cycleStart, 60) : null,
    },
  });

  const answers: Prisma.AnswerCreateManyInput[] = [];

  for (const [questionId, score] of employeeScores) {
    answers.push({
      evaluationId: evaluation.id,
      questionId,
      respondent: Respondent.EMPLOYEE,
      authorId: scenario.employeeId,
      score,
    });
  }
  if (employeeSubmitted) {
    for (const answer of openAnswersFor(scenario.template, Respondent.EMPLOYEE)) {
      answers.push({
        evaluationId: evaluation.id,
        questionId: answer.questionId,
        respondent: Respondent.EMPLOYEE,
        authorId: scenario.employeeId,
        textAnswer: answer.text,
      });
    }
  }

  for (const [questionId, score] of managerScores) {
    answers.push({
      evaluationId: evaluation.id,
      questionId,
      respondent: Respondent.MANAGER,
      authorId: scenario.managerId,
      score,
    });
  }
  if (managerSubmitted) {
    for (const answer of openAnswersFor(scenario.template, Respondent.MANAGER)) {
      answers.push({
        evaluationId: evaluation.id,
        questionId: answer.questionId,
        respondent: Respondent.MANAGER,
        authorId: scenario.managerId,
        textAnswer: answer.text,
      });
    }
  }

  if (answers.length > 0) {
    await prisma.answer.createMany({ data: answers });
  }

  if (meetingScheduled && managerSubmittedAt) {
    const scheduledAt = meetingAt;
    await prisma.feedbackMeeting.create({
      data: {
        evaluationId: evaluation.id,
        authorId: scenario.managerId,
        status: fullyCompleted ? FeedbackMeetingStatus.ACKNOWLEDGED : FeedbackMeetingStatus.SCHEDULED,
        scheduledAt,
        location: pick(["חדר ישיבות קומה 3", "Microsoft Teams", "משרד המנהל"]),
        heldAt: fullyCompleted ? scheduledAt : null,
        achievements: fullyCompleted ? pick(EMPLOYEE_OPEN_ANSWERS.slice(0, 3)) : null,
        strengths: fullyCompleted ? pick(MANAGER_OPEN_ANSWERS.slice(0, 2)) : null,
        improvementAreas: fullyCompleted ? pick(MANAGER_OPEN_ANSWERS.slice(2, 4)) : null,
        developmentOpportunities: fullyCompleted ? "השתתפות בתוכנית פיתוח מנהלים והובלת פרויקט רוחבי." : null,
        summary: fullyCompleted
          ? "שיחה פתוחה ומועילה. סוכמו יעדים ברורים לשנה הבאה ונקבעו נקודות מעקב רבעוניות."
          : null,
        managerComments: fullyCompleted ? "ממליץ/ה להמשיך במגמת ההתפתחות." : null,
        employeeComments: fullyCompleted ? "מסכים/ה עם הסיכום. מודה על המשוב והליווי." : null,
        approvedAt: fullyCompleted ? addDays(scheduledAt, 1) : null,
        employeeAcknowledgedAt: fullyCompleted ? addDays(scheduledAt, 2) : null,
      },
    });
  }

  if (fullyCompleted) {
    const weights = pick(GOAL_WEIGHT_SETS);
    const dueYear = scenario.cycleStart.getUTCFullYear() + 1;
    await prisma.goal.createMany({
      data: weights.map((weight, index) => {
        const goal = GOAL_TEMPLATES[index];
        const goalStatus = scenario.archived
          ? pick([GoalStatus.ACHIEVED, GoalStatus.PARTIALLY_ACHIEVED, GoalStatus.IN_PROGRESS, GoalStatus.NOT_ACHIEVED])
          : GoalStatus.NOT_STARTED;
        const progressByStatus: Record<GoalStatus, number> = {
          NOT_STARTED: 0,
          IN_PROGRESS: 50,
          ACHIEVED: 100,
          PARTIALLY_ACHIEVED: 70,
          NOT_ACHIEVED: 20,
          CANCELLED: 0,
        };
        return {
          evaluationId: evaluation.id,
          cycleId: scenario.cycleId,
          employeeId: scenario.employeeId,
          createdById: scenario.managerId,
          title: goal.title,
          description: goal.description,
          kpi: goal.kpi,
          weight,
          dueDate: dateOnly(dueYear, 3 * (index % 4) + 3, 30),
          status: goalStatus,
          progress: progressByStatus[goalStatus],
          order: index + 1,
        };
      }),
    });
  }

  return { id: evaluation.id, employeeSubmittedAt, managerSubmittedAt };
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function clearDatabase(): Promise<void> {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.goal.deleteMany(),
    prisma.feedbackMeeting.deleteMany(),
    prisma.answer.deleteMany(),
    prisma.evaluation.deleteMany(),
    prisma.reviewCycle.deleteMany(),
    prisma.question.deleteMany(),
    prisma.category.deleteMany(),
    prisma.questionnaireTemplate.deleteMany(),
    prisma.user.updateMany({ data: { managerId: null } }),
    prisma.user.deleteMany(),
    prisma.department.deleteMany(),
  ]);
}

async function main(): Promise<void> {
  console.log("🧹 מנקה נתונים קיימים...");
  await clearDatabase();

  // --- מחלקות ---
  console.log("🏢 יוצר מחלקות...");
  const departmentIds = new Map<string, string>();
  for (const department of DEPARTMENTS) {
    const created = await prisma.department.create({ data: department });
    departmentIds.set(department.code, created.id);
  }

  // --- משתמשים (שני מעברים: יצירה ואז שיוך מנהל) ---
  console.log("👥 יוצר משתמשים והיררכיה...");
  const userIds = new Map<string, string>();
  for (const user of USERS) {
    const departmentId = departmentIds.get(user.department);
    if (!departmentId) throw new Error(`Unknown department ${user.department}`);
    const created = await prisma.user.create({
      data: {
        employeeNumber: user.employeeNumber,
        fullName: user.fullName,
        email: user.email.toLowerCase(),
        jobTitle: user.jobTitle,
        role: user.role,
        hireDate: user.hireDate,
        departmentId,
      },
    });
    userIds.set(user.key, created.id);
  }

  const idOf = (key: string): string => {
    const id = userIds.get(key);
    if (!id) throw new Error(`Unknown user key ${key}`);
    return id;
  };

  for (const user of USERS) {
    if (user.managerKey) {
      await prisma.user.update({
        where: { id: idOf(user.key) },
        data: { managerId: idOf(user.managerKey) },
      });
    }
  }

  const hrId = idOf("hr");

  // --- שאלונים ---
  console.log("📝 יוצר תבניות שאלון (גרסה 1 ו-2)...");
  const templateV1 = await createTemplate(1, "שאלון 2025 – 5 קטגוריות ליבה ו-4 שאלות פתוחות", OPEN_QUESTIONS_V1);
  const templateV2 = await createTemplate(2, "שאלון 2026 – נוספו שאלות פתוחות על תמיכה ומוכנות לקידום", OPEN_QUESTIONS_V2);

  // --- מחזורים ---
  console.log("📅 יוצר מחזורי הערכה...");
  const cycle2025Start = dateOnly(2025, 11, 2);
  const cycle2025 = await prisma.reviewCycle.create({
    data: {
      name: "הערכה שנתית",
      year: 2025,
      status: CycleStatus.CLOSED,
      startDate: cycle2025Start,
      selfAssessmentDueDate: addDays(cycle2025Start, 14),
      managerAssessmentDueDate: addDays(cycle2025Start, 28),
      endDate: addDays(cycle2025Start, 60),
      openedAt: cycle2025Start,
      closedAt: addDays(cycle2025Start, 60),
      templateId: templateV1.id,
      createdById: hrId,
      closedById: hrId,
    },
  });

  const cycle2026Start = daysAgo(12);
  const cycle2026 = await prisma.reviewCycle.create({
    data: {
      name: "הערכה שנתית",
      year: 2026,
      status: CycleStatus.ACTIVE,
      startDate: cycle2026Start,
      selfAssessmentDueDate: addDays(cycle2026Start, 14),
      managerAssessmentDueDate: addDays(cycle2026Start, 28),
      endDate: addDays(cycle2026Start, 45),
      openedAt: cycle2026Start,
      templateId: templateV2.id,
      createdById: hrId,
    },
  });

  // כל מי שיש לו מנהל ישיר משתתף בהערכה (כולל מנהלים – מוערכים ע"י המנכ"ל)
  const participants = USERS.filter((user) => user.managerKey !== null);

  // --- מחזור 2025: הכל בארכיון ---
  console.log("🗄️  יוצר היסטוריית 2025 (ארכיון)...");
  for (const participant of participants) {
    if (participant.hireDate > cycle2025Start) continue;
    await createEvaluation({
      cycleId: cycle2025.id,
      cycleStart: cycle2025Start,
      template: templateV1,
      employeeId: idOf(participant.key),
      managerId: idOf(participant.managerKey as string),
      status: EvaluationStatus.COMPLETED,
      baseline: 3 + random() * 1.5,
      selfBias: random() * 0.8 - 0.2,
      isHighPotential: random() > 0.75,
      archived: true,
    });
  }

  // --- מחזור 2026: פיזור על כל הסטטוסים הפעילים ---
  console.log("🔄 יוצר מחזור 2026 פעיל...");
  const scenarios2026: Record<string, { status: EvaluationStatus; selfBias: number; isHighPotential: boolean }> = {
    hr: { status: EvaluationStatus.COMPLETED, selfBias: 0, isHighPotential: false },
    mgrRnd: { status: EvaluationStatus.MANAGER_COMPLETED, selfBias: 0.2, isHighPotential: true },
    mgrSales: { status: EvaluationStatus.EMPLOYEE_COMPLETED, selfBias: 0.3, isHighPotential: false },
    mgrSupport: { status: EvaluationStatus.EMPLOYEE_IN_PROGRESS, selfBias: 0, isHighPotential: false },
    mgrFin: { status: EvaluationStatus.NOT_STARTED, selfBias: 0, isHighPotential: false },

    rnd1: { status: EvaluationStatus.COMPLETED, selfBias: 0.1, isHighPotential: true },
    rnd2: { status: EvaluationStatus.WAITING_FOR_FEEDBACK_MEETING, selfBias: 0.6, isHighPotential: false },
    rnd3: { status: EvaluationStatus.MANAGER_COMPLETED, selfBias: 1.5, isHighPotential: false }, // פערים גדולים
    rnd4: { status: EvaluationStatus.MANAGER_IN_PROGRESS, selfBias: 0.4, isHighPotential: false },
    rnd5: { status: EvaluationStatus.EMPLOYEE_COMPLETED, selfBias: 0.2, isHighPotential: false },

    sales1: { status: EvaluationStatus.COMPLETED, selfBias: -0.3, isHighPotential: true },
    sales2: { status: EvaluationStatus.EMPLOYEE_IN_PROGRESS, selfBias: 0.5, isHighPotential: false },
    sales3: { status: EvaluationStatus.WAITING_FOR_FEEDBACK_MEETING, selfBias: 0.2, isHighPotential: false },
    sales4: { status: EvaluationStatus.NOT_STARTED, selfBias: 0, isHighPotential: false },

    sup1: { status: EvaluationStatus.MANAGER_COMPLETED, selfBias: 0, isHighPotential: true },
    sup2: { status: EvaluationStatus.EMPLOYEE_COMPLETED, selfBias: 0.9, isHighPotential: false },
    sup3: { status: EvaluationStatus.NOT_STARTED, selfBias: 0, isHighPotential: false },
    sup4: { status: EvaluationStatus.MANAGER_IN_PROGRESS, selfBias: 0.3, isHighPotential: false },

    fin1: { status: EvaluationStatus.COMPLETED, selfBias: -0.1, isHighPotential: false },
    fin2: { status: EvaluationStatus.EMPLOYEE_IN_PROGRESS, selfBias: 0.4, isHighPotential: false },
    fin3: { status: EvaluationStatus.EMPLOYEE_COMPLETED, selfBias: 1.2, isHighPotential: false },
  };

  const notifications: Prisma.NotificationCreateManyInput[] = [];
  const auditLogs: Prisma.AuditLogCreateManyInput[] = [
    {
      action: AuditAction.CYCLE_CREATED,
      entityType: "ReviewCycle",
      entityId: cycle2026.id,
      actorId: hrId,
      ipAddress: "10.0.0.15",
      metadata: { name: cycle2026.name, year: cycle2026.year },
      createdAt: addDays(cycle2026Start, -2),
    },
    {
      action: AuditAction.CYCLE_OPENED,
      entityType: "ReviewCycle",
      entityId: cycle2026.id,
      actorId: hrId,
      ipAddress: "10.0.0.15",
      metadata: { participants: participants.length },
      createdAt: cycle2026Start,
    },
    {
      action: AuditAction.CYCLE_CLOSED,
      entityType: "ReviewCycle",
      entityId: cycle2025.id,
      actorId: hrId,
      ipAddress: "10.0.0.15",
      metadata: { year: 2025 },
      createdAt: addDays(cycle2025Start, 60),
    },
  ];

  for (const participant of participants) {
    const scenario = scenarios2026[participant.key];
    if (!scenario) throw new Error(`Missing 2026 scenario for ${participant.key}`);

    const employeeId = idOf(participant.key);
    const managerId = idOf(participant.managerKey as string);

    const evaluation = await createEvaluation({
      cycleId: cycle2026.id,
      cycleStart: cycle2026Start,
      template: templateV2,
      employeeId,
      managerId,
      status: scenario.status,
      baseline: 3 + random() * 1.5,
      selfBias: scenario.selfBias,
      isHighPotential: scenario.isHighPotential,
      archived: false,
    });

    // יום 0 – מייל פתיחה לכל עובד
    notifications.push({
      type: NotificationType.CYCLE_OPENED,
      status: NotificationStatus.SENT,
      dedupeKey: `${evaluation.id}:${NotificationType.CYCLE_OPENED}:${employeeId}`,
      subject: "נפתח מחזור הערכת עובדים 2026",
      body: "מחזור ההערכה השנתי נפתח. יש למלא את ההערכה העצמית עד תאריך היעד בקישור האישי.",
      recipientId: employeeId,
      cycleId: cycle2026.id,
      evaluationId: evaluation.id,
      scheduledAt: cycle2026Start,
      sentAt: cycle2026Start,
      attempts: 1,
    });

    // יום 4 / יום 7 – תזכורות לעובד שטרם הגיש לפני אותו יום
    const reminderDays: { day: number; type: NotificationType }[] = [
      { day: 4, type: NotificationType.EMPLOYEE_REMINDER_1 },
      { day: 7, type: NotificationType.EMPLOYEE_REMINDER_2 },
    ];
    for (const reminder of reminderDays) {
      const reminderDate = addDays(cycle2026Start, reminder.day);
      const notSubmittedYet = !evaluation.employeeSubmittedAt || evaluation.employeeSubmittedAt > reminderDate;
      if (notSubmittedYet && reminderDate <= NOW) {
        notifications.push({
          type: reminder.type,
          status: NotificationStatus.SENT,
          dedupeKey: `${evaluation.id}:${reminder.type}:${employeeId}`,
          subject: "תזכורת: הערכה עצמית ממתינה למילוי",
          body: "טרם הושלמה ההערכה העצמית שלך. נא להשלים אותה עד תאריך היעד.",
          recipientId: employeeId,
          cycleId: cycle2026.id,
          evaluationId: evaluation.id,
          scheduledAt: reminderDate,
          sentAt: reminderDate,
          attempts: 1,
        });
      }
    }

    if (evaluation.employeeSubmittedAt) {
      const submittedAt = evaluation.employeeSubmittedAt;
      notifications.push({
        type: NotificationType.EMPLOYEE_SUBMITTED,
        status: NotificationStatus.SENT,
        dedupeKey: `${evaluation.id}:${NotificationType.EMPLOYEE_SUBMITTED}:${managerId}`,
        subject: "עובד השלים הערכה עצמית",
        body: "העובד השלים את ההערכה העצמית. כעת נדרש למלא הערכת מנהל.",
        recipientId: managerId,
        cycleId: cycle2026.id,
        evaluationId: evaluation.id,
        scheduledAt: submittedAt,
        sentAt: submittedAt,
        attempts: 1,
      });
      auditLogs.push({
        action: AuditAction.SELF_ASSESSMENT_SUBMITTED,
        entityType: "Evaluation",
        entityId: evaluation.id,
        actorId: employeeId,
        ipAddress: "10.0.1." + Math.floor(random() * 200 + 20),
        createdAt: submittedAt,
      });

      const managerReminders: { day: number; type: NotificationType }[] = [
        { day: 4, type: NotificationType.MANAGER_REMINDER_1 },
        { day: 7, type: NotificationType.MANAGER_REMINDER_2 },
      ];
      for (const reminder of managerReminders) {
        const reminderDate = addDays(submittedAt, reminder.day);
        const managerNotDone = !evaluation.managerSubmittedAt || evaluation.managerSubmittedAt > reminderDate;
        if (managerNotDone && reminderDate <= NOW) {
          notifications.push({
            type: reminder.type,
            status: NotificationStatus.SENT,
            dedupeKey: `${evaluation.id}:${reminder.type}:${managerId}`,
            subject: "תזכורת: הערכת מנהל ממתינה",
            body: "העובד השלים הערכה עצמית וטרם הושלמה הערכת המנהל.",
            recipientId: managerId,
            cycleId: cycle2026.id,
            evaluationId: evaluation.id,
            scheduledAt: reminderDate,
            sentAt: reminderDate,
            attempts: 1,
          });
        }
      }
    }

    if (evaluation.managerSubmittedAt) {
      const managerSubmittedAt = evaluation.managerSubmittedAt;
      for (const recipientId of [employeeId, managerId]) {
        notifications.push({
          type: NotificationType.ASSESSMENTS_COMPLETED,
          status: NotificationStatus.SENT,
          dedupeKey: `${evaluation.id}:${NotificationType.ASSESSMENTS_COMPLETED}:${recipientId}`,
          subject: "הערכות הושלמו - יש לתאם שיחת משוב",
          body: "ההערכה העצמית והערכת המנהל הושלמו. יש לתאם שיחת משוב.",
          recipientId,
          cycleId: cycle2026.id,
          evaluationId: evaluation.id,
          scheduledAt: managerSubmittedAt,
          sentAt: managerSubmittedAt,
          attempts: 1,
        });
      }
      auditLogs.push(
        {
          action: AuditAction.MANAGER_ASSESSMENT_SUBMITTED,
          entityType: "Evaluation",
          entityId: evaluation.id,
          actorId: managerId,
          ipAddress: "10.0.2." + Math.floor(random() * 200 + 20),
          createdAt: managerSubmittedAt,
        },
        {
          action: AuditAction.COMPARISON_VIEWED,
          entityType: "Evaluation",
          entityId: evaluation.id,
          actorId: managerId,
          ipAddress: "10.0.2." + Math.floor(random() * 200 + 20),
          createdAt: addDays(managerSubmittedAt, 1),
        },
      );
    }

    if (scenario.status === EvaluationStatus.COMPLETED && evaluation.managerSubmittedAt) {
      auditLogs.push({
        action: AuditAction.FEEDBACK_APPROVED,
        entityType: "Evaluation",
        entityId: evaluation.id,
        actorId: managerId,
        ipAddress: "10.0.2.50",
        createdAt: addDays(evaluation.managerSubmittedAt, 3),
      });
    }
  }

  // דוגמה לשליחה שנכשלה (לבדיקת מנגנון ניסיון חוזר ב-Cron): תזכורת שיחת משוב למנהל
  const pendingEvaluation = await prisma.evaluation.findFirst({
    where: { cycleId: cycle2026.id, status: EvaluationStatus.WAITING_FOR_FEEDBACK_MEETING },
    select: { id: true, managerId: true },
  });
  if (pendingEvaluation) {
    notifications.push({
      type: NotificationType.FEEDBACK_MEETING_REMINDER,
      status: NotificationStatus.FAILED,
      dedupeKey: `${pendingEvaluation.id}:${NotificationType.FEEDBACK_MEETING_REMINDER}:${pendingEvaluation.managerId}`,
      subject: "תזכורת: שיחת משוב מתקרבת",
      body: "שיחת המשוב עם העובד/ת נקבעה. יש להכין את טופס הסיכום.",
      recipientId: pendingEvaluation.managerId,
      cycleId: cycle2026.id,
      evaluationId: pendingEvaluation.id,
      scheduledAt: daysAgo(1),
      attempts: 3,
      lastError: "SMTP 451: Temporary local problem",
    });
  }

  await prisma.notification.createMany({ data: notifications });
  await prisma.auditLog.createMany({ data: auditLogs });

  // --- סיכום ---
  const [users, evaluations, answers, goals, meetings, notificationCount, auditCount] = await Promise.all([
    prisma.user.count(),
    prisma.evaluation.count(),
    prisma.answer.count(),
    prisma.goal.count(),
    prisma.feedbackMeeting.count(),
    prisma.notification.count(),
    prisma.auditLog.count(),
  ]);

  const statusBreakdown = await prisma.evaluation.groupBy({
    by: ["status"],
    where: { cycleId: cycle2026.id },
    _count: { _all: true },
  });

  console.log("✅ Seed הושלם בהצלחה");
  console.table({ users, evaluations, answers, goals, meetings, notifications: notificationCount, auditLogs: auditCount });
  console.table(
    Object.fromEntries(statusBreakdown.map((row) => [row.status, row._count._all])),
  );
  console.log(`🔑 משתמש HR: ${ADMIN_EMAIL}`);
}

main()
  .catch((error: unknown) => {
    console.error("❌ Seed נכשל:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
