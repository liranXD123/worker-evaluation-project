import type { Metadata } from "next";
import { triggerRemindersAction } from "@/app/actions/admin-actions";
import { getHrDashboard } from "@/lib/dal/dashboards";
import { formatDate, formatPercent, formatScore } from "@/lib/format";
import { loadPage } from "@/lib/page-guard";
import { ConfirmActionButton } from "@/components/ui/action-form";
import { Alert, Card, CardTitle, EmptyState, ErrorState, LinkButton, PageHeader, ProgressBar, StatCard, Table, Td, Th } from "@/components/ui/kit";
import { CycleSelect } from "@/components/app/cycle-select";
import { ScoreDistributionChart, StatusChart } from "@/components/admin/hr-charts";

// דף אישי לפי המשתמש המחובר – נטען בשרת בכל בקשה
export const instant = false;

export const metadata: Metadata = { title: "דשבורד HR" };

export default async function HrDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const result = await loadPage(() => getHrDashboard(typeof query.cycle === "string" ? query.cycle : undefined));
  if (!result.ok) return <ErrorState message={result.message} />;
  const data = result.data;

  if (!data.cycle) {
    return (
      <div className="space-y-6">
        <PageHeader title="דשבורד HR" />
        <EmptyState title="עדיין לא נוצר מחזור הערכה">
          <LinkButton href="/admin/cycles" className="mt-3">
            יצירת מחזור ראשון
          </LinkButton>
        </EmptyState>
      </div>
    );
  }

  const { kpis, cycle } = data;
  const isActive = cycle.status === "ACTIVE";

  return (
    <div className="space-y-6">
      <PageHeader
        title="דשבורד HR"
        description={`${cycle.name} ${cycle.year} · ${cycle.statusLabel} · הערכה עצמית עד ${formatDate(cycle.selfAssessmentDueDate)} · הערכת מנהל עד ${formatDate(cycle.managerAssessmentDueDate)}`}
        actions={
          <>
            <CycleSelect cycles={data.cycles} value={cycle.id} />
            <LinkButton href={`/api/exports/cycles/${cycle.id}/status`} variant="outline">
              ייצוא סטטוס ל-Excel
            </LinkButton>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="עובדים בתהליך" value={kpis.total} />
        <StatCard label="אחוז השלמה" value={formatPercent(kpis.completed, kpis.total)} tone="success" hint={`${kpis.completed} השלימו תהליך מלא`} />
        <StatCard label="טרם התחילו" value={kpis.notStarted} tone={kpis.notStarted > 0 ? "warning" : "neutral"} hint={`${kpis.employeeInProgress} נוספים באמצע מילוי`} />
        <StatCard label="ממתינים להערכת מנהל" value={kpis.awaitingManager} tone={kpis.awaitingManager > 0 ? "warning" : "neutral"} />
        <StatCard label="בשלב שיחת משוב" value={kpis.feedbackStage} tone="info" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium">התקדמות כללית</span>
          <span className="ltr-nums text-muted-foreground">
            {kpis.completed} / {kpis.total}
          </span>
        </div>
        <ProgressBar value={kpis.completed} max={kpis.total} className="mt-2 h-3" />
      </Card>

      {isActive ? (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-semibold">תזכורות</p>
            <p className="text-sm text-muted-foreground">
              התזכורות נשלחות אוטומטית כל בוקר (ימים 4 ו-7). אפשר גם לשלוח עכשיו את כל מה שהגיע זמנו.
              {data.notifications.failed > 0 ? ` · ${data.notifications.failed} מיילים נכשלו בשליחה` : ""}
            </p>
          </div>
          <ConfirmActionButton
            action={triggerRemindersAction}
            variant="outline"
            confirmText="להריץ עכשיו את התזכורות ולשלוח את כל ההודעות הממתינות?"
            successMessage="התזכורות הופעלו."
          >
            הפעלת תזכורות עכשיו
          </ConfirmActionButton>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>התפלגות סטטוסים</CardTitle>
          {data.statusCounts.length > 0 ? <StatusChart data={data.statusCounts} /> : <p className="text-sm text-muted-foreground">אין נתונים</p>}
        </Card>
        <Card>
          <CardTitle>התפלגות ציוני מנהל{data.averageManagerScore !== null ? ` · ממוצע ${formatScore(data.averageManagerScore)}` : ""}</CardTitle>
          <ScoreDistributionChart data={data.scoreDistribution} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">פילוח לפי מנהלים</h2>
          <Table>
            <thead>
              <tr>
                <Th>מנהל/ת</Th>
                <Th>עובדים</Th>
                <Th>הערכה עצמית</Th>
                <Th>הערכת מנהל</Th>
                <Th>הושלמו</Th>
              </tr>
            </thead>
            <tbody>
              {data.byManager.map((row) => (
                <tr key={row.name}>
                  <Td className="font-medium">{row.name}</Td>
                  <Td className="ltr-nums text-start">{row.total}</Td>
                  <Td className="ltr-nums text-start">{row.employeeSubmitted}</Td>
                  <Td className={row.managerSubmitted < row.employeeSubmitted ? "font-semibold text-amber-700 ltr-nums text-start" : "ltr-nums text-start"}>{row.managerSubmitted}</Td>
                  <Td className="ltr-nums text-start">{formatPercent(row.completed, row.total)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">פילוח לפי מחלקות</h2>
          <Table>
            <thead>
              <tr>
                <Th>מחלקה</Th>
                <Th>עובדים</Th>
                <Th>הושלמו</Th>
                <Th>ממוצע ציון מנהל</Th>
              </tr>
            </thead>
            <tbody>
              {data.byDepartment.map((row) => (
                <tr key={row.name}>
                  <Td className="font-medium">{row.name}</Td>
                  <Td className="ltr-nums text-start">{row.total}</Td>
                  <Td className="ltr-nums text-start">{formatPercent(row.completed, row.total)}</Td>
                  <Td className="ltr-nums text-start">{formatScore(row.averageManagerScore)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      </div>

      {kpis.awaitingManager > 0 && isActive ? (
        <Alert tone="warning">
          מנהלים שמסומנים בכתום בטבלה ממתינים להשלמת הערכות מנהל. הם מקבלים תזכורות אוטומטיות 4 ו-7 ימים אחרי הגשת העובד.
        </Alert>
      ) : null}
    </div>
  );
}
