import type { Metadata } from "next";
import { closeCycleAction, openCycleAction } from "@/app/actions/admin-actions";
import { listCycles } from "@/lib/dal/cycles";
import { listTemplates } from "@/lib/dal/questionnaires";
import { formatDate, formatPercent, toDateInputValue } from "@/lib/format";
import { loadPage } from "@/lib/page-guard";
import { ConfirmActionButton } from "@/components/ui/action-form";
import { Badge, Card, CardTitle, EmptyState, ErrorState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui/kit";
import { CreateCycleForm } from "@/components/admin/create-cycle-form";

// דף אישי לפי המשתמש המחובר – נטען בשרת בכל בקשה
export const instant = false;

export const metadata: Metadata = { title: "מחזורי הערכה" };

export default async function CyclesPage() {
  const result = await loadPage(async () => {
    const [cycles, templates] = await Promise.all([listCycles(), listTemplates()]);
    return { cycles, templates, today: toDateInputValue(new Date()) };
  });
  if (!result.ok) return <ErrorState message={result.message} />;
  const { cycles, templates, today } = result.data;
  const hasActive = cycles.some((cycle) => cycle.status === "ACTIVE");

  return (
    <div className="space-y-6">
      <PageHeader title="מחזורי הערכה" description="יצירה, פתיחה וסגירה של מחזורי הערכה שנתיים" />

      <Card>
        <CardTitle>איך זה עובד</CardTitle>
        <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
          <li>יוצרים מחזור חדש (נשמר כטיוטה) ובוחרים שאלון.</li>
          <li>לוחצים &quot;פתיחת מחזור&quot; – כל עובד שיש לו מנהל ישיר מקבל מייל עם קישור אישי לשאלון.</li>
          <li>המערכת שולחת תזכורות אוטומטיות ומעדכנת את המנהלים בכל שלב.</li>
          <li>בסיום לוחצים &quot;סגירת מחזור&quot; – כל הנתונים נשמרים בארכיון לקריאה בלבד.</li>
        </ol>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">כל המחזורים</h2>
        {cycles.length === 0 ? (
          <EmptyState title="אין עדיין מחזורי הערכה" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>מחזור</Th>
                <Th>סטטוס</Th>
                <Th>תאריכים</Th>
                <Th>שאלון</Th>
                <Th>השלמה</Th>
                <Th>פעולות</Th>
              </tr>
            </thead>
            <tbody>
              {cycles.map((cycle) => (
                <tr key={cycle.id}>
                  <Td className="font-medium">
                    {cycle.name} {cycle.year}
                  </Td>
                  <Td>
                    <Badge tone={cycle.status === "ACTIVE" ? "success" : cycle.status === "DRAFT" ? "warning" : "muted"}>{cycle.statusLabel}</Badge>
                  </Td>
                  <Td className="text-xs">
                    <p>פתיחה: {formatDate(cycle.startDate)}</p>
                    <p>עצמית עד: {formatDate(cycle.selfAssessmentDueDate)}</p>
                    <p>מנהל עד: {formatDate(cycle.managerAssessmentDueDate)}</p>
                  </Td>
                  <Td className="text-sm">
                    {cycle.template.name} (גרסה {cycle.template.version})
                  </Td>
                  <Td className="text-sm">
                    {cycle.status === "DRAFT" ? "—" : `${cycle.completed} / ${cycle.participants} (${formatPercent(cycle.completed, cycle.participants)})`}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      {cycle.status === "DRAFT" ? (
                        <ConfirmActionButton
                          action={openCycleAction.bind(null, { cycleId: cycle.id })}
                          size="sm"
                          confirmText={`לפתוח את "${cycle.name} ${cycle.year}"? כל העובדים יקבלו מייל עם קישור לשאלון, והשאלון יינעל לעריכה.`}
                          successMessage="המחזור נפתח והמיילים נשלחים."
                        >
                          פתיחת מחזור
                        </ConfirmActionButton>
                      ) : null}
                      {cycle.status === "ACTIVE" ? (
                        <ConfirmActionButton
                          action={closeCycleAction.bind(null, { cycleId: cycle.id })}
                          size="sm"
                          variant="destructive"
                          confirmText="לסגור את המחזור? כל ההערכות יעברו לארכיון ולא ניתן יהיה לערוך אותן יותר. פעולה זו אינה הפיכה."
                          successMessage="המחזור נסגר."
                        >
                          סגירת מחזור
                        </ConfirmActionButton>
                      ) : null}
                      {cycle.status !== "DRAFT" ? (
                        <LinkButton href={`/admin?cycle=${cycle.id}`} size="sm" variant="outline">
                          דשבורד
                        </LinkButton>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <Card>
        <CardTitle>יצירת מחזור חדש</CardTitle>
        {hasActive ? (
          <p className="mb-4 text-sm text-amber-700">יש כרגע מחזור פעיל. ניתן ליצור טיוטה, אך לפתוח אותה רק אחרי סגירת המחזור הפעיל.</p>
        ) : null}
        <CreateCycleForm
          templates={templates.map((template) => ({ id: template.id, label: `${template.name} – גרסה ${template.version}${template.isLocked ? "" : " (טיוטה)"}` }))}
          today={today}
        />
      </Card>
    </div>
  );
}
