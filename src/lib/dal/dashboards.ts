import "server-only";
import { AssessmentStatus, EvaluationStatus, NotificationStatus } from "@/generated/prisma/enums";
import { decimalToNumber, prisma } from "@/lib/db";
import { CYCLE_STATUS_LABELS, EVALUATION_STATUS_LABELS } from "@/lib/domain/evaluation-state";
import { getCurrentOrLatestCycleId } from "@/lib/dal/cycles";
import { requireAdmin } from "@/lib/dal/session";

/**
 * דשבורד HR (SPEC §7): KPI, התפלגות סטטוסים וציונים, פילוח לפי מנהלים ומחלקות.
 * החישובים מבוססים על מצב כל צד (employeeStatus/managerStatus/completedAt) ולא רק על הסטטוס,
 * כך שהדשבורד נכון גם למחזור סגור (בו כל הרשומות ARCHIVED).
 */

export interface HrDashboardDTO {
  cycles: { id: string; label: string }[];
  cycle: { id: string; name: string; year: number; status: string; statusLabel: string; selfAssessmentDueDate: Date; managerAssessmentDueDate: Date } | null;
  kpis: {
    total: number;
    notStarted: number;
    employeeInProgress: number;
    awaitingManager: number;
    feedbackStage: number;
    completed: number;
  };
  statusCounts: { label: string; count: number }[];
  scoreDistribution: { range: string; count: number }[];
  averageManagerScore: number | null;
  byManager: { name: string; total: number; employeeSubmitted: number; managerSubmitted: number; completed: number }[];
  byDepartment: { name: string; total: number; completed: number; averageManagerScore: number | null }[];
  notifications: { pending: number; failed: number };
}

const STATUS_ORDER: EvaluationStatus[] = [
  EvaluationStatus.NOT_STARTED,
  EvaluationStatus.EMPLOYEE_IN_PROGRESS,
  EvaluationStatus.EMPLOYEE_COMPLETED,
  EvaluationStatus.MANAGER_IN_PROGRESS,
  EvaluationStatus.MANAGER_COMPLETED,
  EvaluationStatus.WAITING_FOR_FEEDBACK_MEETING,
  EvaluationStatus.COMPLETED,
  EvaluationStatus.ARCHIVED,
];

const SCORE_BINS: readonly { range: string; min: number; max: number }[] = [
  { range: "1–2", min: 1, max: 2 },
  { range: "2–2.5", min: 2, max: 2.5 },
  { range: "2.5–3", min: 2.5, max: 3 },
  { range: "3–3.5", min: 3, max: 3.5 },
  { range: "3.5–4", min: 3.5, max: 4 },
  { range: "4–4.5", min: 4, max: 4.5 },
  { range: "4.5–5", min: 4.5, max: 5.01 },
];

function average(values: number[]): number | null {
  return values.length === 0 ? null : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

export async function getHrDashboard(cycleId?: string): Promise<HrDashboardDTO> {
  await requireAdmin();

  const allCycles = await prisma.reviewCycle.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, year: true, status: true, selfAssessmentDueDate: true, managerAssessmentDueDate: true },
  });
  const targetId = cycleId ?? (await getCurrentOrLatestCycleId()) ?? allCycles[0]?.id ?? null;
  const cycle = allCycles.find((item) => item.id === targetId) ?? null;

  const empty: HrDashboardDTO = {
    cycles: allCycles.map((item) => ({ id: item.id, label: `${item.name} ${item.year} (${CYCLE_STATUS_LABELS[item.status]})` })),
    cycle: null,
    kpis: { total: 0, notStarted: 0, employeeInProgress: 0, awaitingManager: 0, feedbackStage: 0, completed: 0 },
    statusCounts: [],
    scoreDistribution: SCORE_BINS.map((bin) => ({ range: bin.range, count: 0 })),
    averageManagerScore: null,
    byManager: [],
    byDepartment: [],
    notifications: { pending: 0, failed: 0 },
  };
  if (!cycle) return empty;

  const [evaluations, pending, failed] = await Promise.all([
    prisma.evaluation.findMany({
      where: { cycleId: cycle.id },
      select: {
        status: true,
        employeeStatus: true,
        managerStatus: true,
        managerWeightedScore: true,
        completedAt: true,
        manager: { select: { id: true, fullName: true } },
        employee: { select: { department: { select: { name: true } } } },
      },
    }),
    prisma.notification.count({ where: { cycleId: cycle.id, status: NotificationStatus.PENDING } }),
    prisma.notification.count({ where: { cycleId: cycle.id, status: NotificationStatus.FAILED } }),
  ]);

  const managerScores = evaluations
    .map((evaluation) => decimalToNumber(evaluation.managerWeightedScore))
    .filter((score): score is number => score !== null);

  const kpis = {
    total: evaluations.length,
    notStarted: evaluations.filter((e) => e.employeeStatus === AssessmentStatus.NOT_STARTED).length,
    employeeInProgress: evaluations.filter((e) => e.employeeStatus === AssessmentStatus.DRAFT).length,
    awaitingManager: evaluations.filter((e) => e.employeeStatus === AssessmentStatus.SUBMITTED && e.managerStatus !== AssessmentStatus.SUBMITTED).length,
    feedbackStage: evaluations.filter((e) => e.managerStatus === AssessmentStatus.SUBMITTED && e.completedAt === null).length,
    completed: evaluations.filter((e) => e.completedAt !== null).length,
  };

  const statusCounts = STATUS_ORDER.map((status) => ({
    label: EVALUATION_STATUS_LABELS[status],
    count: evaluations.filter((evaluation) => evaluation.status === status).length,
  })).filter((row) => row.count > 0);

  const managers = new Map<string, HrDashboardDTO["byManager"][number]>();
  const departments = new Map<string, { total: number; completed: number; scores: number[] }>();
  for (const evaluation of evaluations) {
    const manager = managers.get(evaluation.manager.id) ?? { name: evaluation.manager.fullName, total: 0, employeeSubmitted: 0, managerSubmitted: 0, completed: 0 };
    manager.total++;
    if (evaluation.employeeStatus === AssessmentStatus.SUBMITTED) manager.employeeSubmitted++;
    if (evaluation.managerStatus === AssessmentStatus.SUBMITTED) manager.managerSubmitted++;
    if (evaluation.completedAt) manager.completed++;
    managers.set(evaluation.manager.id, manager);

    const departmentName = evaluation.employee.department.name;
    const department = departments.get(departmentName) ?? { total: 0, completed: 0, scores: [] };
    department.total++;
    if (evaluation.completedAt) department.completed++;
    const score = decimalToNumber(evaluation.managerWeightedScore);
    if (score !== null) department.scores.push(score);
    departments.set(departmentName, department);
  }

  return {
    ...empty,
    cycle: {
      id: cycle.id,
      name: cycle.name,
      year: cycle.year,
      status: cycle.status,
      statusLabel: CYCLE_STATUS_LABELS[cycle.status],
      selfAssessmentDueDate: cycle.selfAssessmentDueDate,
      managerAssessmentDueDate: cycle.managerAssessmentDueDate,
    },
    kpis,
    statusCounts,
    scoreDistribution: SCORE_BINS.map((bin) => ({
      range: bin.range,
      count: managerScores.filter((score) => score >= bin.min && score < bin.max).length,
    })),
    averageManagerScore: average(managerScores),
    byManager: [...managers.values()].sort((a, b) => a.name.localeCompare(b.name, "he")),
    byDepartment: [...departments.entries()]
      .map(([name, data]) => ({ name, total: data.total, completed: data.completed, averageManagerScore: average(data.scores) }))
      .sort((a, b) => a.name.localeCompare(b.name, "he")),
    notifications: { pending, failed },
  };
}
