import type { Metadata } from "next";
import { AssessmentStatus, EvaluationStatus } from "@/generated/prisma/enums";
import { listCycles } from "@/lib/dal/cycles";
import { listTeamEvaluations, MANAGER_PENDING_ACTION_LABELS } from "@/lib/dal/evaluations";
import { FEEDBACK_STATUS_LABELS } from "@/lib/domain/labels";
import { formatDate, formatDateTime, formatScore } from "@/lib/format";
import { loadPage } from "@/lib/page-guard";
import { Badge, EmptyState, ErrorState, LinkButton, PageHeader, StatCard, Table, Td, Th } from "@/components/ui/kit";
import { CycleSelect } from "@/components/app/cycle-select";
import { StatusBadge } from "@/components/evaluation/status";

// דף אישי לפי המשתמש המחובר – נטען בשרת בכל בקשה
export const instant = false;

export const metadata: Metadata = { title: "הצוות שלי" };

/** דשבורד מנהל: הכפיפים הישירים בלבד */
export default async function TeamPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const requestedCycle = typeof query.cycle === "string" ? query.cycle : undefined;

  const result = await loadPage(async () => {
    const [team, cycles] = await Promise.all([listTeamEvaluations(requestedCycle), listCycles()]);
    return { team, cycles };
  });
  if (!result.ok) return <ErrorState message={result.message} />;
  const { team, cycles } = result.data;
  const rows = team.rows;

  return (
    <div className="space-y-6">
      <PageHeader
        title="הצוות שלי"
        description="סטטוס ההערכות של העובדים הכפופים אליך ישירות"
        actions={
          <>
            <CycleSelect
              cycles={cycles.filter((cycle) => cycle.status !== "DRAFT").map((cycle) => ({ id: cycle.id, label: `${cycle.name} ${cycle.year} (${cycle.statusLabel})` }))}
              value={team.cycleId}
            />
            {team.cycleId ? (
              <LinkButton href={`/api/exports/cycles/${team.cycleId}/status`} variant="outline">
                ייצוא ל-Excel
              </LinkButton>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="עובדים" value={rows.length} />
        <StatCard label="ממתינים להערכת מנהל" value={rows.filter((row) => row.pendingAction === "FILL_MANAGER_ASSESSMENT").length} tone="warning" />
        <StatCard label="שיחות משוב פתוחות" value={rows.filter((row) => row.status === EvaluationStatus.MANAGER_COMPLETED || row.status === EvaluationStatus.WAITING_FOR_FEEDBACK_MEETING).length} tone="info" />
        <StatCard label="הושלמו" value={rows.filter((row) => row.completedAt !== null).length} tone="success" />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="אין עובדים בתהליך במחזור זה">עובדים יופיעו כאן לאחר שמשאבי אנוש יפתחו מחזור הערכה.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>עובד/ת</Th>
              <Th>סטטוס</Th>
              <Th>הערכה עצמית</Th>
              <Th>הערכת מנהל</Th>
              <Th>ציון עובד / מנהל</Th>
              <Th>שיחת משוב</Th>
              <Th>יעדים</Th>
              <Th>פעולה נדרשת</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <Td>
                  <p className="font-medium">{row.employee.fullName}</p>
                  <p className="text-xs text-muted-foreground">{row.employee.jobTitle}</p>
                </Td>
                <Td>
                  <StatusBadge status={row.status} />
                  {row.isHighPotential ? <Badge tone="success" className="ms-1">פוטנציאל גבוה</Badge> : null}
                </Td>
                <Td>{row.employeeStatus === AssessmentStatus.SUBMITTED ? formatDate(row.employeeSubmittedAt) : <span className="text-muted-foreground">טרם נשלחה</span>}</Td>
                <Td>{row.managerStatus === AssessmentStatus.SUBMITTED ? formatDate(row.managerSubmittedAt) : <span className="text-muted-foreground">טרם נשלחה</span>}</Td>
                <Td>
                  <span className="ltr-nums">
                    {row.managerStatus === AssessmentStatus.SUBMITTED ? formatScore(row.employeeWeightedScore) : "🔒"} / {formatScore(row.managerWeightedScore)}
                  </span>
                </Td>
                <Td>
                  {row.feedbackStatus ? (
                    <span className="text-sm">
                      {FEEDBACK_STATUS_LABELS[row.feedbackStatus]}
                      {row.feedbackScheduledAt ? <span className="block text-xs text-muted-foreground">{formatDateTime(row.feedbackScheduledAt)}</span> : null}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Td>
                <Td className="ltr-nums text-start">{row.goalsCount}</Td>
                <Td className="text-sm">{MANAGER_PENDING_ACTION_LABELS[row.pendingAction]}</Td>
                <Td className="text-end">
                  <LinkButton href={`/evaluations/${row.id}`} size="sm" variant={row.pendingAction === "NONE" || row.pendingAction === "WAITING_FOR_EMPLOYEE" ? "outline" : "default"}>
                    פתיחה
                  </LinkButton>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="text-xs text-muted-foreground">🔒 ציון ההערכה העצמית של העובד/ת יוצג רק לאחר שתשלח/י את הערכת המנהל.</p>
    </div>
  );
}
