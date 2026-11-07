import "server-only";
import { AssessmentStatus, AuditAction, FeedbackMeetingStatus, Role } from "@/generated/prisma/enums";
import { decimalToNumber, prisma } from "@/lib/db";
import { forbidden, notFound } from "@/lib/errors";
import { EVALUATION_STATUS_LABELS } from "@/lib/domain/evaluation-state";
import { addKeyValueSheet, addTableSheet, createWorkbook, workbookToBytes, type ColumnSpec } from "@/lib/excel/workbook";
import { renderEvaluationReportHtml } from "@/lib/exports/evaluation-report";
import { safeFilename } from "@/lib/http/responses";
import { embeddedFontCss, renderPdf } from "@/lib/pdf/render";
import { recordAudit } from "@/lib/dal/audit";
import { addRoleValidation, EMPLOYEE_SHEET_COLUMNS, type EmployeeSheetRow } from "@/lib/dal/employee-import";
import { getEvaluationDetail } from "@/lib/dal/evaluations";
import { getFeedbackMeeting } from "@/lib/dal/feedback";
import { getGoals } from "@/lib/dal/goals";
import { requireAdmin, requireUser } from "@/lib/dal/session";

/**
 * ייצוא קבצים. כל ייצוא עובר דרך אותן בדיקות הרשאה של ה-DAL ונרשם ב-Audit (REPORT_EXPORTED).
 */

export interface ExportFile {
  filename: string;
  bytes: Uint8Array;
}

// -----------------------------------------------------------------------------
// PDF – דוח עובד
// -----------------------------------------------------------------------------

export async function exportEvaluationPdf(evaluationId: string): Promise<ExportFile> {
  const user = await requireUser();
  const detail = await getEvaluationDetail(evaluationId);
  const [feedback, goals, fontCss] = await Promise.all([
    detail.permissions.canViewFeedback ? getFeedbackMeeting(evaluationId) : Promise.resolve(null),
    detail.permissions.canViewGoals ? getGoals(evaluationId) : Promise.resolve(null),
    embeddedFontCss(),
  ]);

  const html = renderEvaluationReportHtml({ detail, feedback, goals, generatedAt: new Date(), generatedBy: user.fullName, fontCss });
  const bytes = await renderPdf(html);

  await recordAudit({
    action: AuditAction.REPORT_EXPORTED,
    entityType: "Evaluation",
    entityId: evaluationId,
    actorId: user.id,
    metadata: { report: "evaluation-summary", format: "pdf", relation: detail.relation },
  });

  return { filename: safeFilename(`הערכת עובד - ${detail.employee.fullName} - ${detail.cycle.year}.pdf`), bytes };
}

// -----------------------------------------------------------------------------
// Excel – סטטוס מחזור (HR: כל הארגון; מנהל: כפיפים ישירים בלבד)
// -----------------------------------------------------------------------------

interface CycleStatusRow {
  employeeNumber: string;
  fullName: string;
  department: string;
  manager: string;
  status: string;
  employeeSubmittedAt: Date | null;
  managerSubmittedAt: Date | null;
  employeeScore: number | null;
  managerScore: number | null;
  gap: number | null;
  highPotential: string;
  meeting: string;
  goals: number;
  completedAt: Date | null;
}

const FEEDBACK_LABELS: Readonly<Record<FeedbackMeetingStatus, string>> = {
  SCHEDULED: "נקבעה",
  DRAFT: "סיכום בכתיבה",
  APPROVED: "אושרה",
  ACKNOWLEDGED: "העובד אישר",
};

const CYCLE_STATUS_COLUMNS: readonly ColumnSpec<CycleStatusRow>[] = [
  { header: "מספר עובד", key: "employeeNumber", width: 12, value: (row) => row.employeeNumber },
  { header: "שם מלא", key: "fullName", width: 22, value: (row) => row.fullName },
  { header: "מחלקה", key: "department", width: 16, value: (row) => row.department },
  { header: "מנהל ישיר", key: "manager", width: 20, value: (row) => row.manager },
  { header: "סטטוס", key: "status", width: 22, value: (row) => row.status },
  { header: "הגשת הערכה עצמית", key: "employeeSubmittedAt", width: 18, value: (row) => row.employeeSubmittedAt, numFmt: "dd/mm/yyyy" },
  { header: "הגשת הערכת מנהל", key: "managerSubmittedAt", width: 18, value: (row) => row.managerSubmittedAt, numFmt: "dd/mm/yyyy" },
  { header: "ציון עובד", key: "employeeScore", width: 11, value: (row) => row.employeeScore, numFmt: "0.00" },
  { header: "ציון מנהל", key: "managerScore", width: 11, value: (row) => row.managerScore, numFmt: "0.00" },
  { header: "פער", key: "gap", width: 9, value: (row) => row.gap, numFmt: "+0.00;-0.00;0.00" },
  { header: "פוטנציאל גבוה", key: "highPotential", width: 13, value: (row) => row.highPotential },
  { header: "שיחת משוב", key: "meeting", width: 15, value: (row) => row.meeting },
  { header: "מספר יעדים", key: "goals", width: 11, value: (row) => row.goals },
  { header: "הושלם", key: "completedAt", width: 14, value: (row) => row.completedAt, numFmt: "dd/mm/yyyy" },
];

export async function exportCycleStatusWorkbook(cycleId: string): Promise<ExportFile> {
  const user = await requireUser();
  if (user.role === Role.EMPLOYEE) throw forbidden();
  const isAdmin = user.role === Role.ADMIN;

  const cycle = await prisma.reviewCycle.findUnique({ where: { id: cycleId }, select: { id: true, name: true, year: true } });
  if (!cycle) throw notFound("מחזור ההערכה");

  const scope = isAdmin ? { cycleId } : { cycleId, employee: { managerId: user.id } };
  const evaluations = await prisma.evaluation.findMany({
    where: scope,
    orderBy: [{ employee: { department: { name: "asc" } } }, { employee: { fullName: "asc" } }],
    select: {
      id: true,
      status: true,
      employeeSubmittedAt: true,
      managerSubmittedAt: true,
      managerWeightedScore: true,
      isHighPotential: true,
      completedAt: true,
      employee: { select: { employeeNumber: true, fullName: true, department: { select: { name: true } } } },
      manager: { select: { fullName: true } },
      feedbackMeeting: { select: { status: true } },
      _count: { select: { goals: true } },
    },
  });

  // חוק הסודיות: ציון העובד מוצג רק אם המנהל הישיר הגיש. HR רואה הכל – חוץ מעובדים שהוא עצמו המנהל הישיר שלהם.
  const employeeScores = await prisma.evaluation.findMany({
    where: {
      ...scope,
      OR: [
        { managerStatus: AssessmentStatus.SUBMITTED },
        ...(isAdmin ? [{ employee: { managerId: { not: user.id } } }, { employee: { managerId: null } }] : []),
      ],
    },
    select: { id: true, employeeWeightedScore: true },
  });
  const employeeScoreById = new Map(employeeScores.map((row) => [row.id, decimalToNumber(row.employeeWeightedScore)]));

  const rows: CycleStatusRow[] = evaluations.map((evaluation) => {
    const employeeScore = employeeScoreById.get(evaluation.id) ?? null;
    const managerScore = decimalToNumber(evaluation.managerWeightedScore);
    return {
      employeeNumber: evaluation.employee.employeeNumber,
      fullName: evaluation.employee.fullName,
      department: evaluation.employee.department.name,
      manager: evaluation.manager.fullName,
      status: EVALUATION_STATUS_LABELS[evaluation.status],
      employeeSubmittedAt: evaluation.employeeSubmittedAt,
      managerSubmittedAt: evaluation.managerSubmittedAt,
      employeeScore,
      managerScore,
      gap: employeeScore !== null && managerScore !== null ? Math.round((employeeScore - managerScore) * 100) / 100 : null,
      highPotential: evaluation.isHighPotential ? "כן" : "",
      meeting: evaluation.feedbackMeeting ? FEEDBACK_LABELS[evaluation.feedbackMeeting.status] : "",
      goals: evaluation._count.goals,
      completedAt: evaluation.completedAt,
    };
  });

  const workbook = createWorkbook();
  addTableSheet(workbook, "סטטוס הערכות", CYCLE_STATUS_COLUMNS, rows);

  const statusCounts = new Map<string, number>();
  for (const row of rows) statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
  const completed = evaluations.filter((evaluation) => evaluation.completedAt !== null).length;
  addKeyValueSheet(workbook, "סיכום", [
    ["מחזור", `${cycle.name} ${cycle.year}`],
    ["היקף", isAdmin ? "כל הארגון" : "כפיפים ישירים"],
    ["מספר עובדים בתהליך", rows.length],
    ["השלימו תהליך מלא", completed],
    ["אחוז השלמה", rows.length ? `${Math.round((completed / rows.length) * 100)}%` : "0%"],
    ...[...statusCounts.entries()].map(([status, count]) => [`סטטוס: ${status}`, count] as const),
    ["הופק", new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jerusalem" }).format(new Date())],
  ]);

  const bytes = await workbookToBytes(workbook);
  await recordAudit({
    action: AuditAction.REPORT_EXPORTED,
    entityType: "ReviewCycle",
    entityId: cycleId,
    actorId: user.id,
    metadata: { report: "cycle-status", format: "xlsx", scope: isAdmin ? "company" : "team", rows: rows.length },
  });

  return { filename: safeFilename(`סטטוס הערכות - ${cycle.name} ${cycle.year}.xlsx`), bytes };
}

// -----------------------------------------------------------------------------
// Excel – רשימת עובדים (באותו פורמט של קובץ הייבוא, כך שאפשר לערוך ולייבא חזרה)
// -----------------------------------------------------------------------------

export async function exportEmployeesWorkbook(): Promise<ExportFile> {
  const admin = await requireAdmin();
  const users = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: [{ department: { name: "asc" } }, { fullName: "asc" }],
    select: {
      employeeNumber: true,
      fullName: true,
      email: true,
      jobTitle: true,
      hireDate: true,
      role: true,
      department: { select: { name: true } },
      manager: { select: { email: true } },
    },
  });

  const rows: EmployeeSheetRow[] = users.map((user) => ({
    employeeNumber: user.employeeNumber,
    fullName: user.fullName,
    email: user.email,
    jobTitle: user.jobTitle,
    department: user.department.name,
    hireDate: user.hireDate,
    managerEmail: user.manager?.email ?? null,
    role: user.role,
  }));

  const workbook = createWorkbook();
  const sheet = addTableSheet(workbook, "עובדים", EMPLOYEE_SHEET_COLUMNS, rows);
  addRoleValidation(sheet, Math.max(rows.length + 50, 200));
  const bytes = await workbookToBytes(workbook);

  await recordAudit({
    action: AuditAction.REPORT_EXPORTED,
    entityType: "User",
    actorId: admin.id,
    metadata: { report: "employees", format: "xlsx", rows: rows.length },
  });
  return { filename: "עובדים.xlsx", bytes };
}

// -----------------------------------------------------------------------------
// דוחות HR נוספים: מחלקות, מעקב יעדים, פוטנציאל גבוה (מנהל מערכת בלבד)
// -----------------------------------------------------------------------------

export const CYCLE_REPORTS = {
  departments: "דוח מחלקות",
  goals: "דוח מעקב יעדים",
  "high-potential": "דוח עובדים בעלי פוטנציאל גבוה",
} as const;

export type CycleReportKey = keyof typeof CYCLE_REPORTS;

export function isCycleReportKey(value: string): value is CycleReportKey {
  return Object.hasOwn(CYCLE_REPORTS, value);
}

function averageOf(values: number[]): number | null {
  return values.length === 0 ? null : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

export async function exportCycleReport(cycleId: string, report: CycleReportKey): Promise<ExportFile> {
  const admin = await requireAdmin();
  const cycle = await prisma.reviewCycle.findUnique({ where: { id: cycleId }, select: { id: true, name: true, year: true } });
  if (!cycle) throw notFound("מחזור ההערכה");

  const workbook = createWorkbook();
  let rowsCount = 0;

  if (report === "departments") {
    const evaluations = await prisma.evaluation.findMany({
      where: { cycleId },
      select: {
        completedAt: true,
        isHighPotential: true,
        managerWeightedScore: true,
        managerStatus: true,
        employeeWeightedScore: true,
        employee: { select: { managerId: true, department: { select: { name: true } } } },
      },
    });
    const byDepartment = new Map<string, { total: number; completed: number; highPotential: number; employee: number[]; manager: number[] }>();
    for (const evaluation of evaluations) {
      const name = evaluation.employee.department.name;
      const entry = byDepartment.get(name) ?? { total: 0, completed: 0, highPotential: 0, employee: [], manager: [] };
      entry.total++;
      if (evaluation.completedAt) entry.completed++;
      if (evaluation.isHighPotential) entry.highPotential++;
      const managerScore = decimalToNumber(evaluation.managerWeightedScore);
      if (managerScore !== null) entry.manager.push(managerScore);
      // חוק הסודיות: ציון עובד שהמנהל הישיר שלו הוא המשתמש הנוכחי נכלל רק אחרי שהגיש
      const employeeVisible = evaluation.managerStatus === AssessmentStatus.SUBMITTED || evaluation.employee.managerId !== admin.id;
      const employeeScore = employeeVisible ? decimalToNumber(evaluation.employeeWeightedScore) : null;
      if (employeeScore !== null) entry.employee.push(employeeScore);
      byDepartment.set(name, entry);
    }
    const rows = [...byDepartment.entries()].sort(([a], [b]) => a.localeCompare(b, "he"));
    rowsCount = rows.length;
    addTableSheet(
      workbook,
      "מחלקות",
      [
        { header: "מחלקה", key: "name", width: 20, value: ([name]) => name },
        { header: "עובדים בתהליך", key: "total", width: 14, value: ([, data]) => data.total },
        { header: "השלימו", key: "completed", width: 10, value: ([, data]) => data.completed },
        { header: "אחוז השלמה", key: "rate", width: 12, value: ([, data]) => (data.total ? data.completed / data.total : 0), numFmt: "0%" },
        { header: "ממוצע הערכה עצמית", key: "employeeAvg", width: 18, value: ([, data]) => averageOf(data.employee), numFmt: "0.00" },
        { header: "ממוצע הערכת מנהל", key: "managerAvg", width: 18, value: ([, data]) => averageOf(data.manager), numFmt: "0.00" },
        { header: "פוטנציאל גבוה", key: "hp", width: 14, value: ([, data]) => data.highPotential },
      ],
      rows,
    );
  }

  if (report === "goals") {
    const goals = await prisma.goal.findMany({
      where: { cycleId },
      orderBy: [{ employee: { fullName: "asc" } }, { order: "asc" }],
      select: {
        title: true,
        description: true,
        kpi: true,
        weight: true,
        dueDate: true,
        status: true,
        progress: true,
        employee: { select: { employeeNumber: true, fullName: true, department: { select: { name: true } }, manager: { select: { fullName: true } } } },
      },
    });
    rowsCount = goals.length;
    const STATUS: Record<string, string> = {
      NOT_STARTED: "טרם התחיל",
      IN_PROGRESS: "בתהליך",
      ACHIEVED: "הושג",
      PARTIALLY_ACHIEVED: "הושג חלקית",
      NOT_ACHIEVED: "לא הושג",
      CANCELLED: "בוטל",
    };
    addTableSheet(
      workbook,
      "יעדים",
      [
        { header: "מספר עובד", key: "number", width: 12, value: (goal) => goal.employee.employeeNumber },
        { header: "שם עובד", key: "name", width: 20, value: (goal) => goal.employee.fullName },
        { header: "מחלקה", key: "department", width: 16, value: (goal) => goal.employee.department.name },
        { header: "מנהל ישיר", key: "manager", width: 18, value: (goal) => goal.employee.manager?.fullName ?? "" },
        { header: "יעד", key: "title", width: 28, value: (goal) => goal.title },
        { header: "תיאור", key: "description", width: 40, value: (goal) => goal.description },
        { header: "מדד הצלחה", key: "kpi", width: 30, value: (goal) => goal.kpi },
        { header: "משקל", key: "weight", width: 8, value: (goal) => goal.weight / 100, numFmt: "0%" },
        { header: "תאריך יעד", key: "due", width: 13, value: (goal) => goal.dueDate, numFmt: "dd/mm/yyyy" },
        { header: "סטטוס", key: "status", width: 13, value: (goal) => STATUS[goal.status] ?? goal.status },
        { header: "התקדמות", key: "progress", width: 10, value: (goal) => goal.progress / 100, numFmt: "0%" },
      ],
      goals,
    );
  }

  if (report === "high-potential") {
    const evaluations = await prisma.evaluation.findMany({
      where: { cycleId, isHighPotential: true },
      orderBy: { managerWeightedScore: "desc" },
      select: {
        managerWeightedScore: true,
        employee: {
          select: { employeeNumber: true, fullName: true, jobTitle: true, hireDate: true, department: { select: { name: true } } },
        },
        manager: { select: { fullName: true } },
      },
    });
    rowsCount = evaluations.length;
    addTableSheet(
      workbook,
      "פוטנציאל גבוה",
      [
        { header: "מספר עובד", key: "number", width: 12, value: (row) => row.employee.employeeNumber },
        { header: "שם עובד", key: "name", width: 22, value: (row) => row.employee.fullName },
        { header: "תפקיד", key: "job", width: 22, value: (row) => row.employee.jobTitle },
        { header: "מחלקה", key: "department", width: 16, value: (row) => row.employee.department.name },
        { header: "מנהל ישיר", key: "manager", width: 18, value: (row) => row.manager.fullName },
        { header: "ציון מנהל", key: "score", width: 11, value: (row) => decimalToNumber(row.managerWeightedScore), numFmt: "0.00" },
        { header: "תאריך תחילת עבודה", key: "hire", width: 18, value: (row) => row.employee.hireDate, numFmt: "dd/mm/yyyy" },
      ],
      evaluations,
    );
  }

  const bytes = await workbookToBytes(workbook);
  await recordAudit({
    action: AuditAction.REPORT_EXPORTED,
    entityType: "ReviewCycle",
    entityId: cycleId,
    actorId: admin.id,
    metadata: { report, format: "xlsx", rows: rowsCount },
  });
  return { filename: safeFilename(`${CYCLE_REPORTS[report]} - ${cycle.name} ${cycle.year}.xlsx`), bytes };
}
