import "server-only";
import ExcelJS from "exceljs";
import { AssessmentStatus, AuditAction, CycleStatus, Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/domain/labels";
import { validationError } from "@/lib/errors";
import { addKeyValueSheet, addTableSheet, createWorkbook, workbookToBytes, type ColumnSpec } from "@/lib/excel/workbook";
import { recordAudit } from "@/lib/dal/audit";
import { requireAdmin } from "@/lib/dal/session";

/**
 * ייבוא עובדים ומנהלים מ-Excel (SPEC §3).
 *
 * תהליך דו-שלבי: previewEmployeeImport (בדיקה בלבד, ללא שינוי) → applyEmployeeImport (הכל או כלום).
 * התאמה לעובד קיים לפי "מספר עובד". מחלקות חסרות נוצרות אוטומטית.
 * מנהל ישיר מזוהה לפי אימייל – מתוך הקובץ או מהמערכת – וחייב להיות בהרשאת "מנהל" או "מנהל מערכת".
 * עובדים שלא מופיעים בקובץ לא משתנים (אין השבתה אוטומטית).
 */

export const MAX_IMPORT_FILE_BYTES = 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;

export const IMPORT_COLUMNS = {
  employeeNumber: { header: "מספר עובד", aliases: ["מספר עובד", "employee id", "employee number", "מס עובד"] },
  fullName: { header: "שם מלא", aliases: ["שם מלא", "full name", "name", "שם"] },
  email: { header: "אימייל", aliases: ["אימייל", "email", "דואר אלקטרוני", "מייל"] },
  jobTitle: { header: "תפקיד", aliases: ["תפקיד", "job title", "title"] },
  department: { header: "מחלקה", aliases: ["מחלקה", "department"] },
  hireDate: { header: "תאריך תחילת עבודה", aliases: ["תאריך תחילת עבודה", "hire date", "תאריך קליטה"] },
  managerEmail: { header: "אימייל מנהל ישיר", aliases: ["אימייל מנהל ישיר", "אימייל מנהל", "manager email", "manager"] },
  role: { header: "הרשאה במערכת", aliases: ["הרשאה במערכת", "הרשאה", "role", "תפקיד במערכת"] },
} as const;

type ImportField = keyof typeof IMPORT_COLUMNS;

export { ROLE_LABELS };

const ROLE_BY_LABEL: Readonly<Record<string, Role>> = {
  "מנהל מערכת": Role.ADMIN,
  "hr": Role.ADMIN,
  "admin": Role.ADMIN,
  "מנהל": Role.MANAGER,
  "manager": Role.MANAGER,
  "עובד": Role.EMPLOYEE,
  "employee": Role.EMPLOYEE,
};

export type ImportRowAction = "CREATE" | "UPDATE" | "UNCHANGED" | "ERROR";

export interface ImportRowResult {
  rowNumber: number;
  employeeNumber: string;
  fullName: string;
  email: string;
  department: string;
  managerEmail: string | null;
  role: Role | null;
  action: ImportRowAction;
  errors: string[];
}

export interface ImportPreview {
  rows: ImportRowResult[];
  departmentsToCreate: string[];
  summary: { total: number; create: number; update: number; unchanged: number; errors: number };
  canApply: boolean;
}

export interface ImportApplyResult {
  created: number;
  updated: number;
  unchanged: number;
  departmentsCreated: number;
  reassignedEvaluations: number;
}

// -----------------------------------------------------------------------------
// קריאת הקובץ
// -----------------------------------------------------------------------------

interface ParsedRow {
  rowNumber: number;
  employeeNumber: string;
  fullName: string;
  email: string;
  jobTitle: string;
  department: string;
  hireDate: Date | null;
  hireDateRaw: string;
  managerEmail: string | null;
  role: Role | null;
  roleRaw: string;
}

function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value && value.result !== undefined && value.result !== null) return String(value.result).trim();
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("").trim();
  }
  return String(cell.text ?? value).trim();
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

function parseDate(cell: ExcelJS.Cell): { date: Date | null; raw: string } {
  const value = cell.value;
  if (value instanceof Date) {
    return { date: new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())), raw: value.toISOString().slice(0, 10) };
  }
  if (typeof value === "number" && value > 0 && value < 100000) {
    const date = new Date(EXCEL_EPOCH_MS + Math.round(value) * 86400000);
    return { date, raw: String(value) };
  }
  const raw = cellText(cell);
  if (!raw) return { date: null, raw };
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const local = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  const parts = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : local ? [Number(local[3]), Number(local[2]), Number(local[1])] : null;
  if (!parts) return { date: null, raw };
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return { date: valid ? date : null, raw };
}

async function parseWorkbook(bytes: Uint8Array): Promise<ParsedRow[]> {
  if (bytes.byteLength === 0) throw validationError("הקובץ ריק.");
  if (bytes.byteLength > MAX_IMPORT_FILE_BYTES) throw validationError("הקובץ גדול מדי (מקסימום 1MB).");

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  } catch {
    throw validationError("לא ניתן לקרוא את הקובץ. יש להעלות קובץ Excel בפורמט ‎.xlsx.");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw validationError("בקובץ אין גיליונות.");

  const columnIndex = new Map<ImportField, number>();
  sheet.getRow(1).eachCell((cell, columnNumber) => {
    const header = normalizeHeader(cellText(cell));
    for (const [field, spec] of Object.entries(IMPORT_COLUMNS) as [ImportField, (typeof IMPORT_COLUMNS)[ImportField]][]) {
      if (!columnIndex.has(field) && spec.aliases.some((alias) => normalizeHeader(alias) === header)) {
        columnIndex.set(field, columnNumber);
      }
    }
  });

  const required: ImportField[] = ["employeeNumber", "fullName", "email", "jobTitle", "department", "hireDate"];
  const missing = required.filter((field) => !columnIndex.has(field));
  if (missing.length > 0) {
    throw validationError(`חסרות עמודות חובה בשורת הכותרת: ${missing.map((field) => IMPORT_COLUMNS[field].header).join(", ")}.`);
  }

  const rows: ParsedRow[] = [];
  const cellOf = (row: ExcelJS.Row, field: ImportField) => row.getCell(columnIndex.get(field) ?? 0);

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const text = (field: ImportField) => (columnIndex.has(field) ? cellText(cellOf(row, field)) : "");
    const values = (Object.keys(IMPORT_COLUMNS) as ImportField[]).map(text);
    if (values.every((value) => value === "")) continue;
    if (rows.length >= MAX_IMPORT_ROWS) throw validationError(`ניתן לייבא עד ${MAX_IMPORT_ROWS} שורות בקובץ אחד.`);

    const { date, raw } = parseDate(cellOf(row, "hireDate"));
    const roleRaw = text("role");
    rows.push({
      rowNumber,
      employeeNumber: text("employeeNumber"),
      fullName: text("fullName"),
      email: text("email").toLowerCase(),
      jobTitle: text("jobTitle"),
      department: text("department").replace(/\s+/g, " "),
      hireDate: date,
      hireDateRaw: raw,
      managerEmail: text("managerEmail").toLowerCase() || null,
      role: roleRaw ? (ROLE_BY_LABEL[normalizeHeader(roleRaw)] ?? null) : null,
      roleRaw,
    });
  }

  if (rows.length === 0) throw validationError("לא נמצאו שורות נתונים בקובץ.");
  return rows;
}

// -----------------------------------------------------------------------------
// ניתוח מול מצב המערכת
// -----------------------------------------------------------------------------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ExistingUser {
  id: string;
  employeeNumber: string;
  fullName: string;
  email: string;
  jobTitle: string;
  hireDate: Date;
  role: Role;
  isActive: boolean;
  managerId: string | null;
  departmentId: string;
}

interface Analysis {
  preview: ImportPreview;
  parsed: ParsedRow[];
  existingByNumber: Map<string, ExistingUser>;
  existingByEmail: Map<string, ExistingUser>;
  departmentIdByName: Map<string, string>;
  finalRoleByEmail: Map<string, Role>;
}

function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

async function analyze(bytes: Uint8Array, adminId: string): Promise<Analysis> {
  const parsed = await parseWorkbook(bytes);

  const [users, departments] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        employeeNumber: true,
        fullName: true,
        email: true,
        jobTitle: true,
        hireDate: true,
        role: true,
        isActive: true,
        managerId: true,
        departmentId: true,
      },
    }),
    prisma.department.findMany({ select: { id: true, name: true } }),
  ]);

  const existingByNumber = new Map(users.map((user) => [user.employeeNumber, user]));
  const existingByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));
  const existingById = new Map(users.map((user) => [user.id, user]));
  const departmentIdByName = new Map(departments.map((department) => [department.name.trim(), department.id]));

  const numberCounts = new Map<string, number>();
  const emailCounts = new Map<string, number>();
  for (const row of parsed) {
    numberCounts.set(row.employeeNumber, (numberCounts.get(row.employeeNumber) ?? 0) + 1);
    emailCounts.set(row.email, (emailCounts.get(row.email) ?? 0) + 1);
  }

  // תפקיד סופי לכל אימייל (קובץ גובר על מערכת; תפקיד ריק בעדכון = שמירת הקיים)
  const finalRoleByEmail = new Map<string, Role>(users.map((user) => [user.email.toLowerCase(), user.role]));
  for (const row of parsed) {
    const existing = existingByNumber.get(row.employeeNumber);
    finalRoleByEmail.set(row.email, row.role ?? existing?.role ?? Role.EMPLOYEE);
  }

  // גרף מנהלים סופי (לפי אימייל) לבדיקת מעגלים
  const managerEmailOf = new Map<string, string | null>();
  for (const user of users) {
    const manager = user.managerId ? existingById.get(user.managerId) : null;
    managerEmailOf.set(user.email.toLowerCase(), manager?.email.toLowerCase() ?? null);
  }
  for (const row of parsed) {
    const existing = existingByNumber.get(row.employeeNumber);
    if (existing && existing.email.toLowerCase() !== row.email) managerEmailOf.delete(existing.email.toLowerCase());
    managerEmailOf.set(row.email, row.managerEmail);
  }

  const fileEmails = new Set(parsed.map((row) => row.email));
  const departmentsToCreate = new Set<string>();

  const results: ImportRowResult[] = parsed.map((row) => {
    const errors: string[] = [];
    const existing = existingByNumber.get(row.employeeNumber);

    if (!row.employeeNumber) errors.push("חסר מספר עובד");
    if (row.fullName.length < 2) errors.push("חסר שם מלא");
    if (!EMAIL_PATTERN.test(row.email)) errors.push("אימייל לא תקין");
    if (!row.jobTitle) errors.push("חסר תפקיד");
    if (!row.department) errors.push("חסרה מחלקה");
    if (!row.hireDate) errors.push(row.hireDateRaw ? `תאריך תחילת עבודה לא תקין (${row.hireDateRaw})` : "חסר תאריך תחילת עבודה");
    if (row.roleRaw && !row.role) errors.push(`הרשאה לא מוכרת "${row.roleRaw}" (ערכים אפשריים: עובד / מנהל / מנהל מערכת)`);
    if (row.employeeNumber && (numberCounts.get(row.employeeNumber) ?? 0) > 1) errors.push("מספר העובד מופיע יותר מפעם אחת בקובץ");
    if (row.email && (emailCounts.get(row.email) ?? 0) > 1) errors.push("האימייל מופיע יותר מפעם אחת בקובץ");

    const emailOwner = existingByEmail.get(row.email);
    if (emailOwner && emailOwner.employeeNumber !== row.employeeNumber) {
      errors.push(`האימייל כבר שייך לעובד אחר במערכת (מספר ${emailOwner.employeeNumber})`);
    }

    const finalRole = finalRoleByEmail.get(row.email) ?? Role.EMPLOYEE;
    if (existing?.id === adminId && finalRole !== Role.ADMIN) {
      errors.push("לא ניתן להסיר הרשאת מנהל מערכת מהמשתמש שלך");
    }

    if (row.managerEmail) {
      if (row.managerEmail === row.email) {
        errors.push("עובד לא יכול להיות המנהל של עצמו");
      } else {
        const managerInSystem = existingByEmail.get(row.managerEmail);
        const managerInFile = fileEmails.has(row.managerEmail);
        if (!managerInFile && !managerInSystem) {
          errors.push(`המנהל ${row.managerEmail} לא נמצא בקובץ או במערכת`);
        } else if (!managerInFile && managerInSystem && !managerInSystem.isActive) {
          errors.push(`המנהל ${row.managerEmail} מושבת במערכת`);
        } else if (finalRoleByEmail.get(row.managerEmail) === Role.EMPLOYEE) {
          errors.push(`למנהל ${row.managerEmail} יש הרשאת "עובד" – יש לעדכן אותה ל"מנהל"`);
        }
      }
      // בדיקת מעגל במבנה הארגוני
      const visited = new Set<string>([row.email]);
      let cursor: string | null | undefined = row.managerEmail;
      while (cursor) {
        if (visited.has(cursor)) {
          if (cursor === row.email) errors.push("השיוך יוצר מעגל במבנה הארגוני");
          break;
        }
        visited.add(cursor);
        cursor = managerEmailOf.get(cursor);
      }
    }

    // מי שנשאר עם כפיפים לא יכול לקבל הרשאת "עובד"
    if (finalRole === Role.EMPLOYEE) {
      const hasReports = [...managerEmailOf.entries()].some(([email, managerEmail]) => managerEmail === row.email && email !== row.email);
      if (hasReports) errors.push('לעובד זה יש כפיפים – לא ניתן לתת לו הרשאת "עובד"');
    }

    if (row.department && !departmentIdByName.has(row.department)) departmentsToCreate.add(row.department);

    let action: ImportRowAction;
    if (errors.length > 0) {
      action = "ERROR";
    } else if (!existing) {
      action = "CREATE";
    } else {
      const manager = row.managerEmail ? existingByEmail.get(row.managerEmail) : null;
      const unchanged =
        existing.fullName === row.fullName &&
        existing.email.toLowerCase() === row.email &&
        existing.jobTitle === row.jobTitle &&
        existing.departmentId === departmentIdByName.get(row.department) &&
        row.hireDate !== null &&
        sameDay(existing.hireDate, row.hireDate) &&
        existing.role === finalRole &&
        existing.isActive &&
        (existing.managerId ?? null) === (row.managerEmail ? (manager?.id ?? "__new__") : null);
      action = unchanged ? "UNCHANGED" : "UPDATE";
    }

    return {
      rowNumber: row.rowNumber,
      employeeNumber: row.employeeNumber,
      fullName: row.fullName,
      email: row.email,
      department: row.department,
      managerEmail: row.managerEmail,
      role: finalRole,
      action,
      errors,
    };
  });

  const count = (action: ImportRowAction) => results.filter((row) => row.action === action).length;
  const summary = {
    total: results.length,
    create: count("CREATE"),
    update: count("UPDATE"),
    unchanged: count("UNCHANGED"),
    errors: count("ERROR"),
  };

  return {
    preview: { rows: results, departmentsToCreate: [...departmentsToCreate], summary, canApply: summary.errors === 0 },
    parsed,
    existingByNumber,
    existingByEmail,
    departmentIdByName,
    finalRoleByEmail,
  };
}

// -----------------------------------------------------------------------------
// API
// -----------------------------------------------------------------------------

export async function previewEmployeeImport(bytes: Uint8Array): Promise<ImportPreview> {
  const admin = await requireAdmin();
  const { preview } = await analyze(bytes, admin.id);
  return preview;
}

export async function applyEmployeeImport(bytes: Uint8Array): Promise<ImportApplyResult> {
  const admin = await requireAdmin();
  const analysis = await analyze(bytes, admin.id);
  const { preview, parsed, existingByNumber, departmentIdByName, finalRoleByEmail } = analysis;
  if (!preview.canApply) {
    throw validationError(`בקובץ יש ${preview.summary.errors} שורות עם שגיאות. יש לתקן ולהעלות מחדש.`);
  }

  const actionByRow = new Map(preview.rows.map((row) => [row.rowNumber, row.action]));
  const toWrite = parsed.filter((row) => actionByRow.get(row.rowNumber) !== "UNCHANGED");

  return prisma.$transaction(
    async (tx) => {
      // 1. מחלקות חדשות
      const departmentIds = new Map(departmentIdByName);
      let departmentsCreated = 0;
      const existingCodes = new Set((await tx.department.findMany({ select: { code: true } })).map((d) => d.code));
      for (const name of preview.departmentsToCreate) {
        let index = existingCodes.size + 1;
        while (existingCodes.has(`DEPT${index}`)) index++;
        const code = `DEPT${index}`;
        existingCodes.add(code);
        const department = await tx.department.create({ data: { name, code }, select: { id: true } });
        departmentIds.set(name, department.id);
        departmentsCreated++;
      }

      // 2. יצירה / עדכון עובדים (ללא מנהל – נקבע בשלב 3)
      const idByEmail = new Map<string, string>();
      for (const user of await tx.user.findMany({ select: { id: true, email: true } })) {
        idByEmail.set(user.email.toLowerCase(), user.id);
      }
      let created = 0;
      let updated = 0;
      for (const row of toWrite) {
        const existing = existingByNumber.get(row.employeeNumber);
        const data = {
          fullName: row.fullName,
          email: row.email,
          jobTitle: row.jobTitle,
          departmentId: departmentIds.get(row.department) as string,
          hireDate: row.hireDate as Date,
          role: finalRoleByEmail.get(row.email) ?? Role.EMPLOYEE,
          isActive: true,
        };
        if (existing) {
          await tx.user.update({ where: { id: existing.id }, data });
          idByEmail.set(row.email, existing.id);
          updated++;
        } else {
          const user = await tx.user.create({ data: { ...data, employeeNumber: row.employeeNumber }, select: { id: true } });
          idByEmail.set(row.email, user.id);
          created++;
        }
      }

      // 3. שיוך מנהלים + העברת הערכות פתוחות במחזור הפעיל למנהל החדש
      let reassignedEvaluations = 0;
      for (const row of toWrite) {
        const userId = idByEmail.get(row.email) as string;
        const managerId = row.managerEmail ? (idByEmail.get(row.managerEmail) ?? null) : null;
        const previousManagerId = existingByNumber.get(row.employeeNumber)?.managerId ?? null;
        if (managerId === previousManagerId && existingByNumber.has(row.employeeNumber)) continue;
        await tx.user.update({ where: { id: userId }, data: { managerId } });
        if (managerId && previousManagerId !== managerId) {
          const reassigned = await tx.evaluation.updateMany({
            where: {
              employeeId: userId,
              cycle: { status: CycleStatus.ACTIVE },
              managerStatus: { not: AssessmentStatus.SUBMITTED },
            },
            data: { managerId },
          });
          reassignedEvaluations += reassigned.count;
        }
      }

      const result: ImportApplyResult = {
        created,
        updated,
        unchanged: preview.summary.unchanged,
        departmentsCreated,
        reassignedEvaluations,
      };
      await recordAudit(
        { action: AuditAction.EMPLOYEES_IMPORTED, entityType: "User", actorId: admin.id, metadata: { ...result } },
        tx,
      );
      return result;
    },
    { timeout: 30_000 },
  );
}

// -----------------------------------------------------------------------------
// קובץ תבנית לייבוא
// -----------------------------------------------------------------------------

export interface EmployeeSheetRow {
  employeeNumber: string;
  fullName: string;
  email: string;
  jobTitle: string;
  department: string;
  hireDate: Date;
  managerEmail: string | null;
  role: Role;
}

export const EMPLOYEE_SHEET_COLUMNS: readonly ColumnSpec<EmployeeSheetRow>[] = [
  { header: IMPORT_COLUMNS.employeeNumber.header, key: "employeeNumber", width: 14, value: (row) => row.employeeNumber },
  { header: IMPORT_COLUMNS.fullName.header, key: "fullName", width: 22, value: (row) => row.fullName },
  { header: IMPORT_COLUMNS.email.header, key: "email", width: 32, value: (row) => row.email },
  { header: IMPORT_COLUMNS.jobTitle.header, key: "jobTitle", width: 22, value: (row) => row.jobTitle },
  { header: IMPORT_COLUMNS.department.header, key: "department", width: 18, value: (row) => row.department },
  { header: IMPORT_COLUMNS.hireDate.header, key: "hireDate", width: 18, value: (row) => row.hireDate, numFmt: "dd/mm/yyyy" },
  { header: IMPORT_COLUMNS.managerEmail.header, key: "managerEmail", width: 32, value: (row) => row.managerEmail },
  { header: IMPORT_COLUMNS.role.header, key: "role", width: 16, value: (row) => ROLE_LABELS[row.role] },
];

/** מוסיף רשימה נפתחת לעמודת ההרשאה */
export function addRoleValidation(sheet: ExcelJS.Worksheet, lastRow: number): void {
  const roleColumn = EMPLOYEE_SHEET_COLUMNS.findIndex((column) => column.key === "role") + 1;
  const letter = sheet.getColumn(roleColumn).letter;
  for (let row = 2; row <= lastRow; row++) {
    sheet.getCell(`${letter}${row}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${Object.values(ROLE_LABELS).join(",")}"`],
    };
  }
}

export async function buildImportTemplate(): Promise<Uint8Array> {
  await requireAdmin();
  const departments = await prisma.department.findMany({ orderBy: { name: "asc" }, select: { name: true } });

  const workbook = createWorkbook();
  const examples: EmployeeSheetRow[] = [
    {
      employeeNumber: "E9001",
      fullName: "דוגמה – מנהלת צוות",
      email: "team.lead@example.com",
      jobTitle: "ראש צוות",
      department: departments[0]?.name ?? "פיתוח",
      hireDate: new Date(Date.UTC(2022, 0, 15)),
      managerEmail: null,
      role: Role.MANAGER,
    },
    {
      employeeNumber: "E9002",
      fullName: "דוגמה – עובד",
      email: "employee@example.com",
      jobTitle: "מפתח",
      department: departments[0]?.name ?? "פיתוח",
      hireDate: new Date(Date.UTC(2024, 5, 1)),
      managerEmail: "team.lead@example.com",
      role: Role.EMPLOYEE,
    },
  ];
  const sheet = addTableSheet(workbook, "עובדים", EMPLOYEE_SHEET_COLUMNS, examples);
  addRoleValidation(sheet, 500);

  addKeyValueSheet(workbook, "הוראות", [
    ["איך ממלאים", "שורה לכל עובד. יש למחוק את שורות הדוגמה לפני הייבוא."],
    ["מספר עובד", "חובה. לפיו מזוהה עובד קיים – אם קיים יעודכן, אחרת ייווצר."],
    ["אימייל", "חובה. חייב להיות זהה לאימייל של המשתמש ב-Microsoft 365."],
    ["מחלקה", "חובה. מחלקה שלא קיימת תיווצר אוטומטית."],
    ["תאריך תחילת עבודה", "חובה. פורמט: 15/01/2024 או 2024-01-15."],
    ["אימייל מנהל ישיר", "אימייל של מנהל מהקובץ או מהמערכת. ריק = ללא מנהל (לא ישתתף במחזורי הערכה)."],
    ["הרשאה במערכת", "עובד / מנהל / מנהל מערכת. ריק = עובד (בעובד קיים – ההרשאה לא תשתנה)."],
    ["מחלקות קיימות", departments.map((department) => department.name).join(", ") || "—"],
  ]);

  return workbookToBytes(workbook);
}
