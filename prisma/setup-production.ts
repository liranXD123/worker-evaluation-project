/**
 * הקמה ראשונית של מערכת אמיתית (פעם אחת, על מסד נתונים ריק).
 *
 * יוצר – רק אם עוד לא קיימים:
 *  1. מנהל/ת מערכת ראשון/ה (HR) – כדי שיהיה מי שיתחבר וייבא את שאר העובדים מ-Excel
 *  2. שאלון הערכה שנתי ברירת מחדל (5 קטגוריות + שאלות פתוחות) – ניתן לעריכה במסך "שאלונים"
 *
 * לא מוחק דבר ולא יוצר נתוני דמה. בטוח להרצה חוזרת.
 *
 * הרצה:
 *   SETUP_ADMIN_EMAIL="hr@company.co.il" SETUP_ADMIN_NAME="שם מלא" npm run setup
 * (או להגדיר את שני המשתנים בקובץ .env ואז: npm run setup)
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, QuestionAudience, QuestionType, Role } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined.");

const adminEmail = process.env.SETUP_ADMIN_EMAIL?.trim().toLowerCase();
const adminName = process.env.SETUP_ADMIN_NAME?.trim() || "מנהל/ת מערכת";
if (!adminEmail) {
  throw new Error('יש להגדיר SETUP_ADMIN_EMAIL (כתובת המייל הארגונית של מנהל/ת ה-HR), למשל: SETUP_ADMIN_EMAIL="hr@company.co.il"');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const CATEGORIES = [
  { key: "PROFESSIONAL", name: "מקצועיות", nameEn: "Professional Skills", weight: 30, questions: ["רמת הידע המקצועי והשליטה בתחום האחריות", "איכות ודיוק תוצרי העבודה"] },
  { key: "ACCOUNTABILITY", name: "אחריות", nameEn: "Accountability", weight: 25, questions: ["עמידה בלוחות זמנים ובהתחייבויות", "לקיחת בעלות על משימות ותוצאות"] },
  { key: "TEAMWORK", name: "עבודת צוות", nameEn: "Teamwork", weight: 20, questions: ["שיתוף פעולה עם עמיתים וממשקים", "שיתוף ידע ותמיכה בחברי הצוות"] },
  { key: "INITIATIVE", name: "יוזמה", nameEn: "Initiative", weight: 15, questions: ["הצעת רעיונות ושיפורים לתהליכי עבודה", "פעולה עצמאית ללא צורך בהכוונה צמודה"] },
  { key: "SERVICE", name: "שירות פנים/חוץ ארגוני", nameEn: "Customer/Internal Service", weight: 10, questions: ["יחס ושירות ללקוחות פנימיים וחיצוניים", "זמינות ומענה מהיר לפניות"] },
] as const;

const OPEN_QUESTIONS = [
  { text: "מהם ההישגים המרכזיים שלך בשנה האחרונה?", audience: QuestionAudience.EMPLOYEE },
  { text: "באילו תחומים היית רוצה להתפתח?", audience: QuestionAudience.EMPLOYEE },
  { text: "איזו תמיכה תעזור לך להצליח יותר בשנה הבאה?", audience: QuestionAudience.EMPLOYEE },
  { text: "מהן החוזקות הבולטות של העובד/ת?", audience: QuestionAudience.MANAGER },
  { text: "אילו תחומים דורשים שיפור?", audience: QuestionAudience.MANAGER },
  { text: "האם העובד/ת מוכן/ה לתפקיד בעל אחריות רחבה יותר? פרט/י.", audience: QuestionAudience.MANAGER },
] as const;

async function ensureAdmin(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email: adminEmail! } });
  if (existing) {
    if (existing.role !== Role.ADMIN || !existing.isActive) {
      await prisma.user.update({ where: { id: existing.id }, data: { role: Role.ADMIN, isActive: true } });
      console.log(`✅ ${adminEmail} עודכן/ה להרשאת מנהל מערכת`);
    } else {
      console.log(`ℹ️  ${adminEmail} כבר קיים/ת כמנהל/ת מערכת`);
    }
    return;
  }
  const department =
    (await prisma.department.findFirst({ where: { OR: [{ code: "HR" }, { name: "משאבי אנוש" }] } })) ??
    (await prisma.department.create({ data: { name: "משאבי אנוש", code: "HR" } }));
  await prisma.user.create({
    data: {
      employeeNumber: "ADMIN-1",
      fullName: adminName,
      email: adminEmail!,
      jobTitle: "מנהל/ת משאבי אנוש",
      role: Role.ADMIN,
      hireDate: new Date(),
      departmentId: department.id,
    },
  });
  console.log(`✅ נוצר/ה מנהל/ת מערכת: ${adminName} <${adminEmail}>`);
  console.log("   (מספר העובד ADMIN-1 זמני – אפשר לעדכן אותו בייבוא ה-Excel או במסך העובדים)");
}

async function ensureTemplate(): Promise<void> {
  if ((await prisma.questionnaireTemplate.count()) > 0) {
    console.log("ℹ️  כבר קיים שאלון במערכת – לא נוצר שאלון חדש");
    return;
  }
  const template = await prisma.questionnaireTemplate.create({
    data: { name: "שאלון הערכה שנתי", version: 1, description: "5 קטגוריות ליבה ושאלות פתוחות לעובד ולמנהל", isLocked: false },
  });
  let order = 1;
  for (const [index, definition] of CATEGORIES.entries()) {
    const category = await prisma.category.create({
      data: { templateId: template.id, key: definition.key, name: definition.name, nameEn: definition.nameEn, weight: definition.weight, order: index + 1 },
    });
    for (const text of definition.questions) {
      await prisma.question.create({
        data: {
          templateId: template.id,
          categoryId: category.id,
          text,
          type: QuestionType.RATING,
          audience: QuestionAudience.BOTH,
          helpText: "1 = לא עומד בציפיות · 3 = עומד בציפיות · 5 = מעל ומעבר",
          order: order++,
        },
      });
    }
  }
  for (const definition of OPEN_QUESTIONS) {
    await prisma.question.create({
      data: { templateId: template.id, text: definition.text, type: QuestionType.OPEN_TEXT, audience: definition.audience, isRequired: false, order: order++ },
    });
  }
  console.log("✅ נוצר שאלון הערכה שנתי ברירת מחדל (ניתן לעריכה במסך \"שאלונים\")");
}

async function main(): Promise<void> {
  await ensureAdmin();
  await ensureTemplate();
  console.log("\n🎉 ההקמה הושלמה. התחברו עם חשבון Microsoft של מנהל/ת המערכת.");
}

main()
  .catch((error) => {
    console.error("❌", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
