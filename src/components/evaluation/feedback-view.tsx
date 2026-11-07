import type { FeedbackMeetingDTO } from "@/lib/dal/feedback";
import type { GoalDTO } from "@/lib/dal/goals";
import { FEEDBACK_STATUS_LABELS, GOAL_STATUS_LABELS } from "@/lib/domain/labels";
import { formatDate, formatDateTime } from "@/lib/format";
import { Badge, Card, CardTitle } from "@/components/ui/kit";

export function FeedbackView({ feedback }: { feedback: FeedbackMeetingDTO }) {
  const fields: [string, string | null][] = [
    ["הישגים מרכזיים", feedback.achievements],
    ["חוזקות", feedback.strengths],
    ["תחומי שיפור", feedback.improvementAreas],
    ["הזדמנויות פיתוח", feedback.developmentOpportunities],
    ["סיכום שיחה", feedback.summary],
    ["הערות מנהל", feedback.managerComments],
    ["הערות העובד", feedback.employeeComments],
  ];
  return (
    <Card>
      <CardTitle actions={<Badge tone={feedback.status === "ACKNOWLEDGED" || feedback.status === "APPROVED" ? "success" : "info"}>{FEEDBACK_STATUS_LABELS[feedback.status]}</Badge>}>
        סיכום שיחת המשוב
      </CardTitle>
      <p className="mb-4 text-sm text-muted-foreground">
        מועד: {formatDateTime(feedback.heldAt ?? feedback.scheduledAt)}
        {feedback.location ? ` · ${feedback.location}` : ""}
        {feedback.approvedAt ? ` · אושר ב-${formatDate(feedback.approvedAt)}` : ""}
        {feedback.employeeAcknowledgedAt ? ` · העובד אישר קריאה ב-${formatDate(feedback.employeeAcknowledgedAt)}` : ""}
      </p>
      <dl className="grid gap-4 md:grid-cols-2">
        {fields
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 whitespace-pre-line">{value}</dd>
            </div>
          ))}
      </dl>
    </Card>
  );
}

export function GoalsView({ goals }: { goals: GoalDTO[] }) {
  return (
    <Card>
      <CardTitle>יעדים לשנה הבאה</CardTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground">
              <th className="pb-2 text-start font-medium">יעד</th>
              <th className="pb-2 text-start font-medium">מדד הצלחה</th>
              <th className="pb-2 text-center font-medium">משקל</th>
              <th className="pb-2 text-center font-medium">תאריך יעד</th>
              <th className="pb-2 text-center font-medium">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {goals.map((goal) => (
              <tr key={goal.id} className="border-t align-top">
                <td className="py-2.5">
                  <p className="font-medium">{goal.title}</p>
                  <p className="text-muted-foreground">{goal.description}</p>
                </td>
                <td className="py-2.5">{goal.kpi}</td>
                <td className="py-2.5 text-center ltr-nums">{goal.weight}%</td>
                <td className="py-2.5 text-center">{formatDate(goal.dueDate)}</td>
                <td className="py-2.5 text-center">
                  <Badge>{GOAL_STATUS_LABELS[goal.status]}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
