import type { Metadata } from "next";
import { listCycles } from "@/lib/dal/cycles";
import { getCurrentOrLatestCycleId } from "@/lib/dal/cycles";
import { loadPage } from "@/lib/page-guard";
import { Card, EmptyState, ErrorState, LinkButton, PageHeader } from "@/components/ui/kit";
import { CycleSelect } from "@/components/app/cycle-select";

// דף אישי לפי המשתמש המחובר – נטען בשרת בכל בקשה
export const instant = false;

export const metadata: Metadata = { title: "דוחות" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const result = await loadPage(async () => {
    const cycles = await listCycles();
    const requested = typeof query.cycle === "string" ? query.cycle : null;
    const cycleId = requested ?? (await getCurrentOrLatestCycleId());
    return { cycles: cycles.filter((cycle) => cycle.status !== "DRAFT"), cycleId };
  });
  if (!result.ok) return <ErrorState message={result.message} />;
  const { cycles, cycleId } = result.data;

  if (!cycleId) {
    return (
      <div className="space-y-6">
        <PageHeader title="מרכז דוחות" />
        <EmptyState title="אין עדיין מחזורי הערכה פעילים או סגורים" />
      </div>
    );
  }

  const reports = [
    { title: "דוח השלמת תהליך / דוח חברה", description: "סטטוס כל עובד, תאריכי הגשה, ציונים, פערים, שיחות משוב ויעדים, ובגיליון נפרד – סיכום ארגוני.", href: `/api/exports/cycles/${cycleId}/status` },
    { title: "דוח מחלקות", description: "לכל מחלקה: מספר עובדים, אחוז השלמה, ממוצע הערכה עצמית והערכת מנהל, ופוטנציאל גבוה.", href: `/api/exports/cycles/${cycleId}/departments` },
    { title: "דוח מעקב יעדים", description: "כל היעדים שהוגדרו במחזור: עובד, מנהל, מדד הצלחה, משקל, תאריך יעד וסטטוס.", href: `/api/exports/cycles/${cycleId}/goals` },
    { title: "דוח עובדים בעלי פוטנציאל גבוה", description: "העובדים שסומנו ע\"י המנהלים כבעלי פוטנציאל גבוה, ממוינים לפי ציון המנהל.", href: `/api/exports/cycles/${cycleId}/high-potential` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="מרכז דוחות"
        description="כל הדוחות מופקים כקובצי Excel (מימין לשמאל). דוח עובד ודוח השוואתי ב-PDF זמינים בדף ההערכה של כל עובד."
        actions={<CycleSelect cycles={cycles.map((cycle) => ({ id: cycle.id, label: `${cycle.name} ${cycle.year} (${cycle.statusLabel})` }))} value={cycleId} />}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {reports.map((report) => (
          <Card key={report.title} className="flex flex-col justify-between gap-4">
            <div>
              <h2 className="font-semibold">{report.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{report.description}</p>
            </div>
            <div>
              <LinkButton href={report.href} variant="outline">
                הורדה ל-Excel
              </LinkButton>
            </div>
          </Card>
        ))}
        <Card className="flex flex-col justify-between gap-4">
          <div>
            <h2 className="font-semibold">דוח צוות</h2>
            <p className="mt-1 text-sm text-muted-foreground">כל מנהל יכול להוריד את דוח הצוות שלו מדף &quot;הצוות שלי&quot;. דוח עובד בודד (PDF) – מדף ההערכה של העובד.</p>
          </div>
          <div>
            <LinkButton href="/team" variant="ghost">
              לדף הצוות
            </LinkButton>
          </div>
        </Card>
        <Card className="flex flex-col justify-between gap-4">
          <div>
            <h2 className="font-semibold">רשימת עובדים</h2>
            <p className="mt-1 text-sm text-muted-foreground">כל העובדים הפעילים בפורמט קובץ הייבוא – לעריכה וייבוא חוזר.</p>
          </div>
          <div>
            <LinkButton href="/api/exports/users" variant="outline">
              הורדה ל-Excel
            </LinkButton>
          </div>
        </Card>
      </div>
    </div>
  );
}
