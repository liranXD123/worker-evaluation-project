import { EvaluationStatus, Role } from "@/generated/prisma/enums";
import { listMyEvaluations, listTeamEvaluations, MANAGER_PENDING_ACTION_LABELS } from "@/lib/dal/evaluations";
import { requireUser } from "@/lib/dal/session";
import { formatDate, formatScore } from "@/lib/format";
import { loadPage } from "@/lib/page-guard";
import { Card, CardTitle, EmptyState, ErrorState, LinkButton, StatCard, Table, Td, Th } from "@/components/ui/kit";
import { EvaluationSteps, StatusBadge } from "@/components/evaluation/status";

// דף אישי לפי המשתמש המחובר – נטען בשרת בכל בקשה
export const instant = false;

/** דף הבית: ההערכה שלי, משימות כמנהל, וקיצור דרך לדשבורד HR */
export default async function HomePage() {
  const result = await loadPage(async () => {
    const user = await requireUser();
    const [mine, team] = await Promise.all([
      listMyEvaluations(),
      user.role === Role.EMPLOYEE ? Promise.resolve(null) : listTeamEvaluations(),
    ]);
    return { user, mine, team };
  });
  if (!result.ok) return <ErrorState message={result.message} />;
  const { user, mine, team } = result.data;

  const current = mine.find((evaluation) => evaluation.cycle.status === "ACTIVE") ?? null;
  const history = mine.filter((evaluation) => evaluation.id !== current?.id);
  const firstName = user.fullName.split(" ")[0];

  const teamActions = team?.rows.filter((row) => row.pendingAction !== "NONE" && row.pendingAction !== "WAITING_FOR_EMPLOYEE") ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">שלום {firstName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">כאן תמצא/י את כל מה שקשור להערכות העובדים שלך.</p>
      </div>

      <Card>
        <CardTitle>ההערכה שלי</CardTitle>
        {current ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  {current.cycle.name} {current.cycle.year}
                </p>
                <p className="text-sm text-muted-foreground">מועד אחרון להערכה עצמית: {formatDate(current.cycle.selfAssessmentDueDate)}</p>
              </div>
              <StatusBadge status={current.status} />
            </div>
            <EvaluationSteps status={current.status} />
            <MyEvaluationAction id={current.id} status={current.status} feedbackStatus={current.feedbackStatus} />
          </div>
        ) : (
          <EmptyState title="אין כרגע מחזור הערכה פעיל עבורך">כשמחזור חדש ייפתח, תקבל/י על כך מייל עם קישור לשאלון.</EmptyState>
        )}
      </Card>

      {team ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">הצוות שלי</h2>
            <LinkButton href="/team" variant="outline" size="sm">
              לכל הצוות
            </LinkButton>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="עובדים בתהליך" value={team.rows.length} />
            <StatCard label="ממתינים להערכת מנהל" value={team.rows.filter((row) => row.pendingAction === "FILL_MANAGER_ASSESSMENT").length} tone="warning" />
            <StatCard label="לקבוע שיחת משוב / לסכם" value={team.rows.filter((row) => row.pendingAction === "SCHEDULE_FEEDBACK_MEETING" || row.pendingAction === "COMPLETE_FEEDBACK_AND_GOALS").length} tone="info" />
            <StatCard label="הושלמו" value={team.rows.filter((row) => row.status === EvaluationStatus.COMPLETED).length} tone="success" />
          </div>
          {teamActions.length > 0 ? (
            <Card>
              <CardTitle>משימות שמחכות לך</CardTitle>
              <ul className="divide-y">
                {teamActions.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium">{row.employee.fullName}</p>
                      <p className="text-sm text-muted-foreground">{MANAGER_PENDING_ACTION_LABELS[row.pendingAction]}</p>
                    </div>
                    <LinkButton
                      href={`/evaluations/${row.id}${row.pendingAction === "FILL_MANAGER_ASSESSMENT" ? "" : "?tab=feedback"}`}
                      size="sm"
                    >
                      לביצוע
                    </LinkButton>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </section>
      ) : null}

      {user.role === Role.ADMIN ? (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">ניהול מערכת</p>
            <p className="text-sm text-muted-foreground">דשבורד HR, מחזורי הערכה, עובדים, שאלונים ודוחות.</p>
          </div>
          <LinkButton href="/admin">לדשבורד HR</LinkButton>
        </Card>
      ) : null}

      {history.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">היסטוריית הערכות</h2>
          <Table>
            <thead>
              <tr>
                <Th>מחזור</Th>
                <Th>סטטוס</Th>
                <Th>ציון עצמי</Th>
                <Th>ציון מנהל</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {history.map((evaluation) => (
                <tr key={evaluation.id}>
                  <Td>
                    {evaluation.cycle.name} {evaluation.cycle.year}
                  </Td>
                  <Td>
                    <StatusBadge status={evaluation.status} />
                  </Td>
                  <Td className="ltr-nums text-start">{formatScore(evaluation.employeeWeightedScore)}</Td>
                  <Td className="ltr-nums text-start">{formatScore(evaluation.managerWeightedScore)}</Td>
                  <Td className="text-end">
                    <LinkButton href={`/evaluations/${evaluation.id}`} variant="ghost" size="sm">
                      צפייה
                    </LinkButton>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      ) : null}
    </div>
  );
}

function MyEvaluationAction({ id, status, feedbackStatus }: { id: string; status: EvaluationStatus; feedbackStatus: string | null }) {
  if (status === EvaluationStatus.NOT_STARTED || status === EvaluationStatus.EMPLOYEE_IN_PROGRESS) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <LinkButton href={`/evaluations/${id}`} size="lg">
          {status === EvaluationStatus.NOT_STARTED ? "התחלת הערכה עצמית" : "המשך מילוי ההערכה"}
        </LinkButton>
        <p className="text-sm text-muted-foreground">אפשר לשמור טיוטה ולחזור בכל זמן.</p>
      </div>
    );
  }
  if (feedbackStatus === "APPROVED") {
    return (
      <LinkButton href={`/evaluations/${id}?tab=feedback`} size="lg">
        צפייה בסיכום השיחה ובמטרות – ואישור קריאה
      </LinkButton>
    );
  }
  return (
    <LinkButton href={`/evaluations/${id}`} variant="outline">
      צפייה בהערכה
    </LinkButton>
  );
}
