import type { Metadata } from "next";
import Link from "next/link";
import { AssessmentStatus, EvaluationStatus } from "@/generated/prisma/enums";
import { approveFeedbackAction } from "@/app/actions/evaluation-actions";
import { getComparisonReport } from "@/lib/dal/comparison";
import { getEvaluationDetail, type EvaluationDetailDTO } from "@/lib/dal/evaluations";
import { getFeedbackMeeting } from "@/lib/dal/feedback";
import { getGoals } from "@/lib/dal/goals";
import { formatDate } from "@/lib/format";
import { loadPage } from "@/lib/page-guard";
import { cn } from "@/lib/utils";
import { ConfirmActionButton } from "@/components/ui/action-form";
import { Alert, Card, CardTitle, ErrorState, LinkButton } from "@/components/ui/kit";
import { AnswersView } from "@/components/evaluation/answers-view";
import { AssessmentForm } from "@/components/evaluation/assessment-form";
import { ComparisonView } from "@/components/evaluation/comparison-view";
import { AcknowledgeForm, FeedbackSummaryForm, GoalsEditor, ScheduleMeetingForm } from "@/components/evaluation/feedback-forms";
import { FeedbackView, GoalsView } from "@/components/evaluation/feedback-view";
import { EvaluationSteps, StatusBadge } from "@/components/evaluation/status";

// דף אישי לפי המשתמש המחובר – נטען בשרת בכל בקשה
export const instant = false;

export const metadata: Metadata = { title: "הערכת עובד" };

type Tab = "questionnaire" | "comparison" | "feedback";
const TABS: readonly { id: Tab; label: string }[] = [
  { id: "questionnaire", label: "שאלון ההערכה" },
  { id: "comparison", label: "דוח השוואתי" },
  { id: "feedback", label: "שיחת משוב ויעדים" },
];

export default async function EvaluationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const tab: Tab = TABS.some((item) => item.id === query.tab) ? (query.tab as Tab) : "questionnaire";

  const result = await loadPage(() => getEvaluationDetail(id));
  if (!result.ok) return <ErrorState message={result.message} />;
  const detail = result.data;
  const isSelf = detail.relation === "SELF";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {detail.cycle.name} {detail.cycle.year}
            {isSelf ? " · ההערכה שלי" : ""}
          </p>
          <h1 className="mt-1 text-2xl font-bold">{detail.employee.fullName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail.employee.jobTitle} · {detail.employee.department} · מנהל/ת ישיר/ה: {detail.manager.fullName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={detail.status} />
          <LinkButton href={`/api/exports/evaluations/${detail.id}/pdf`} variant="outline" size="sm">
            הורדת PDF
          </LinkButton>
        </div>
      </div>

      <Card className="py-4">
        <EvaluationSteps status={detail.status} />
        {detail.cycle.status !== "ACTIVE" ? (
          <p className="mt-3 text-sm text-muted-foreground">מחזור ההערכה סגור – הנתונים מוצגים לקריאה בלבד.</p>
        ) : null}
      </Card>

      <nav aria-label="לשוניות" className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((item) => (
          <Link
            key={item.id}
            href={`/evaluations/${detail.id}?tab=${item.id}`}
            scroll={false}
            aria-current={tab === item.id ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition",
              tab === item.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {tab === "questionnaire" ? <QuestionnaireTab detail={detail} /> : null}
      {tab === "comparison" ? <ComparisonTab detail={detail} /> : null}
      {tab === "feedback" ? <FeedbackTab detail={detail} /> : null}
    </div>
  );
}

// -----------------------------------------------------------------------------

function QuestionnaireTab({ detail }: { detail: EvaluationDetailDTO }) {
  const { permissions, relation } = detail;

  if (permissions.canEditSelfAssessment) {
    return (
      <div className="space-y-4">
        <Alert tone="info" title="מילוי הערכה עצמית">
          דרגו כל היגד בסולם 1–5 וענו על השאלות הפתוחות. אפשר לשמור טיוטה ולחזור בכל עת. יש להשלים עד{" "}
          {formatDate(detail.cycle.selfAssessmentDueDate)}. לאחר השליחה ההערכה ננעלת והמנהל/ת יקבל/תקבל הודעה.
        </Alert>
        <AssessmentForm
          mode="EMPLOYEE"
          evaluationId={detail.id}
          categories={detail.categories}
          questions={detail.questions.filter((question) => question.audience !== "MANAGER")}
          initialAnswers={detail.employeeAnswers ?? []}
        />
      </div>
    );
  }

  if (relation === "MANAGER" && detail.employeeStatus !== AssessmentStatus.SUBMITTED && detail.cycle.status === "ACTIVE") {
    return (
      <Alert tone="warning" title="ממתין להערכה העצמית של העובד/ת">
        ניתן יהיה למלא את הערכת המנהל לאחר ש{detail.employee.fullName} ישלים/תשלים את ההערכה העצמית. תקבל/י על כך הודעה במייל.
      </Alert>
    );
  }

  if (permissions.canEditManagerAssessment) {
    return (
      <div className="space-y-4">
        <Alert tone="info" title="מילוי הערכת מנהל">
          מלא/י את ההערכה באופן עצמאי. מטעמי סודיות, תשובות העובד/ת יוצגו לך רק לאחר שתשלח/י את הערכתך. יש להשלים עד{" "}
          {formatDate(detail.cycle.managerAssessmentDueDate)}.
        </Alert>
        <AssessmentForm
          mode="MANAGER"
          evaluationId={detail.id}
          categories={detail.categories}
          questions={detail.questions.filter((question) => question.audience !== "EMPLOYEE")}
          initialAnswers={detail.managerAnswers ?? []}
          initialHighPotential={detail.isHighPotential ?? false}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {relation === "SELF" && detail.employeeStatus === AssessmentStatus.SUBMITTED ? (
        <Alert tone="success" title="ההערכה העצמית נשלחה">
          נשלחה ב-{formatDate(detail.employeeSubmittedAt)}. הערכת המנהל וסיכום השיחה יוצגו לאחר שיחת המשוב.
        </Alert>
      ) : null}
      {relation === "SELF" && detail.employeeStatus !== AssessmentStatus.SUBMITTED ? (
        <Alert tone="muted">ההערכה לא נשלחה במחזור זה.</Alert>
      ) : null}
      <AnswersView detail={detail} />
    </div>
  );
}

async function ComparisonTab({ detail }: { detail: EvaluationDetailDTO }) {
  if (!detail.permissions.canViewComparison) {
    return (
      <Alert tone="info" title="הדוח ההשוואתי עדיין לא זמין">
        {detail.relation === "SELF"
          ? "הדוח יוצג לאחר שיחת המשוב ואישור הסיכום על ידי המנהל/ת."
          : "הדוח נפתח רק לאחר שגם העובד/ת וגם המנהל/ת שלחו את ההערכות."}
      </Alert>
    );
  }
  const report = await getComparisonReport(detail.id);
  return <ComparisonView report={report} />;
}

async function FeedbackTab({ detail }: { detail: EvaluationDetailDTO }) {
  const { permissions, relation } = detail;
  const [feedback, goals] = await Promise.all([
    permissions.canViewFeedback ? getFeedbackMeeting(detail.id) : Promise.resolve(null),
    permissions.canViewGoals ? getGoals(detail.id) : Promise.resolve(null),
  ]);
  const published = feedback?.status === "APPROVED" || feedback?.status === "ACKNOWLEDGED";

  if (relation === "SELF" && !published) {
    return (
      <Alert tone="info" title="סיכום השיחה והיעדים עדיין לא זמינים">
        לאחר שיחת המשוב, המנהל/ת יכתוב/תכתוב סיכום ויגדיר/תגדיר יעדים לשנה הבאה. תקבל/י הודעה במייל כשהם יאושרו.
      </Alert>
    );
  }

  if (relation === "MANAGER" && !published) {
    const beforeManagerSubmit =
      detail.status !== EvaluationStatus.MANAGER_COMPLETED && detail.status !== EvaluationStatus.WAITING_FOR_FEEDBACK_MEETING;
    if (beforeManagerSubmit) {
      return (
        <Alert tone="info" title="שיחת המשוב תיפתח לאחר שליחת הערכת המנהל">
          שלב זה כולל קביעת מועד, סיכום השיחה והגדרת 3–5 יעדים לשנה הבאה.
        </Alert>
      );
    }
    const defaultDue = `${detail.cycle.year + 1}-12-31`;
    return (
      <div className="space-y-6">
        {permissions.canScheduleMeeting ? (
          <Card>
            <CardTitle>1. קביעת מועד לשיחת משוב</CardTitle>
            <ScheduleMeetingForm evaluationId={detail.id} scheduledAt={feedback?.scheduledAt ?? null} location={feedback?.location ?? null} />
          </Card>
        ) : null}

        <Card>
          <CardTitle>2. סיכום השיחה</CardTitle>
          {permissions.canEditFeedback && feedback ? (
            <FeedbackSummaryForm
              evaluationId={detail.id}
              initial={{
                heldAt: feedback.heldAt,
                achievements: feedback.achievements,
                strengths: feedback.strengths,
                improvementAreas: feedback.improvementAreas,
                developmentOpportunities: feedback.developmentOpportunities,
                summary: feedback.summary,
                managerComments: feedback.managerComments,
                employeeComments: feedback.employeeComments,
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">יש לקבוע קודם מועד לשיחה.</p>
          )}
        </Card>

        {permissions.canEditGoals ? (
          <Card>
            <CardTitle>3. יעדים לשנה הבאה (3–5 יעדים, סכום משקלים 100%)</CardTitle>
            <GoalsEditor evaluationId={detail.id} initial={goals ?? []} defaultDueDate={defaultDue} />
          </Card>
        ) : null}

        {permissions.canApproveFeedback ? (
          <Card className="border-primary/40">
            <CardTitle>4. אישור וסיום</CardTitle>
            <p className="mb-4 text-sm text-muted-foreground">
              לאחר האישור ההערכה מסומנת כהושלמה, והעובד/ת יקבל/תקבל גישה לסיכום, ליעדים ולהערכת המנהל. לא ניתן יהיה לערוך אותם.
            </p>
            <ConfirmActionButton
              action={approveFeedbackAction.bind(null, { evaluationId: detail.id })}
              confirmText="לאשר את הסיכום והיעדים ולשתף אותם עם העובד/ת?"
              successMessage="הסיכום אושר וההערכה הושלמה."
            >
              אישור הסיכום ושיתוף עם העובד/ת
            </ConfirmActionButton>
          </Card>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {feedback ? <FeedbackView feedback={feedback} /> : <Alert tone="muted">טרם תועדה שיחת משוב.</Alert>}
      {goals && goals.length > 0 ? <GoalsView goals={goals} /> : null}
      {permissions.canAcknowledgeFeedback ? (
        <Card className="border-primary/40">
          <CardTitle>אישור קריאה</CardTitle>
          <AcknowledgeForm evaluationId={detail.id} />
        </Card>
      ) : null}
    </div>
  );
}
