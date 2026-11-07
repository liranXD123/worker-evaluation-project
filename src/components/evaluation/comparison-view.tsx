import type { ComparisonReportDTO } from "@/lib/dal/comparison";
import { formatGap, formatScore } from "@/lib/format";
import { Badge, Card, CardTitle, StatCard } from "@/components/ui/kit";
import { ComparisonChart } from "@/components/evaluation/comparison-chart";

function InsightList({ title, items, tone }: { title: string; items: string[]; tone: "success" | "warning" | "info" }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="mb-2 text-sm font-semibold">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <Badge key={item} tone={tone}>
              {item}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function ComparisonView({ report }: { report: ComparisonReportDTO }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="ציון משוקלל – הערכה עצמית" value={formatScore(report.employeeWeightedScore)} />
        <StatCard label="ציון משוקלל – הערכת מנהל" value={formatScore(report.managerWeightedScore)} tone="info" />
        <StatCard
          label="פער (עובד פחות מנהל)"
          value={formatGap(report.weightedGap)}
          tone={report.weightedGap !== null && Math.abs(report.weightedGap) > 1 ? "warning" : "neutral"}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <InsightList title="חוזקות מוסכמות (4 ומעלה אצל שני הצדדים)" items={report.agreedStrengths} tone="success" />
        <InsightList title="תחומי פיתוח (ציון מנהל 3 ומטה)" items={report.developmentAreas} tone="info" />
        <InsightList title="פערים משמעותיים (מעל נקודה)" items={report.significantGaps} tone="warning" />
      </div>

      <Card>
        <CardTitle>השוואה לפי קטגוריה</CardTitle>
        <ComparisonChart
          rows={report.categories.map((row) => ({ label: row.label, employee: row.employeeScore, manager: row.managerScore }))}
        />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="pb-2 text-start font-medium">קטגוריה</th>
                <th className="pb-2 text-center font-medium">משקל</th>
                <th className="pb-2 text-center font-medium">עובד</th>
                <th className="pb-2 text-center font-medium">מנהל</th>
                <th className="pb-2 text-center font-medium">פער</th>
              </tr>
            </thead>
            <tbody>
              {report.categories.map((row) => (
                <tr key={row.id} className={row.isSignificantGap ? "border-t bg-amber-50" : "border-t"}>
                  <td className="py-2.5 font-medium">{row.label}</td>
                  <td className="py-2.5 text-center ltr-nums">{row.weight}%</td>
                  <td className="py-2.5 text-center ltr-nums">{formatScore(row.employeeScore)}</td>
                  <td className="py-2.5 text-center ltr-nums">{formatScore(row.managerScore)}</td>
                  <td className="py-2.5 text-center">
                    <span className="ltr-nums">{formatGap(row.gap)}</span>
                    {row.isSignificantGap ? <Badge tone="warning" className="ms-2">פער</Badge> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium text-primary">פירוט לפי שאלה</summary>
          <table className="mt-3 w-full">
            <tbody>
              {report.questions.map((row) => (
                <tr key={row.id} className={row.isSignificantGap ? "border-t bg-amber-50" : "border-t"}>
                  <td className="py-2">{row.label}</td>
                  <td className="w-16 py-2 text-center ltr-nums">{row.employeeScore ?? "—"}</td>
                  <td className="w-16 py-2 text-center ltr-nums">{row.managerScore ?? "—"}</td>
                  <td className="w-16 py-2 text-center ltr-nums">{formatGap(row.gap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>

      {report.openAnswers.some((item) => item.employeeAnswer || item.managerAnswer) ? (
        <Card>
          <CardTitle>שאלות פתוחות</CardTitle>
          <div className="space-y-4">
            {report.openAnswers
              .filter((item) => item.employeeAnswer || item.managerAnswer)
              .map((item) => (
                <div key={item.questionId} className="border-t pt-3 first:border-t-0 first:pt-0">
                  <p className="font-medium">{item.text}</p>
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg bg-muted/60 p-3 text-sm">
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">עובד</p>
                      <p className="whitespace-pre-line">{item.employeeAnswer ?? "—"}</p>
                    </div>
                    <div className="rounded-lg bg-accent p-3 text-sm">
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">מנהל</p>
                      <p className="whitespace-pre-line">{item.managerAnswer ?? "—"}</p>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
