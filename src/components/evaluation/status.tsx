import { EvaluationStatus } from "@/generated/prisma/enums";
import { EVALUATION_STATUS_LABELS } from "@/lib/domain/evaluation-state";
import { EVALUATION_STATUS_TONE } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/kit";

export function StatusBadge({ status }: { status: EvaluationStatus }) {
  return <Badge tone={EVALUATION_STATUS_TONE[status]}>{EVALUATION_STATUS_LABELS[status]}</Badge>;
}

const STEPS = ["הערכה עצמית", "הערכת מנהל", "שיחת משוב ויעדים", "הושלם"] as const;

function currentStep(status: EvaluationStatus): number {
  switch (status) {
    case EvaluationStatus.NOT_STARTED:
    case EvaluationStatus.EMPLOYEE_IN_PROGRESS:
      return 0;
    case EvaluationStatus.EMPLOYEE_COMPLETED:
    case EvaluationStatus.MANAGER_IN_PROGRESS:
      return 1;
    case EvaluationStatus.MANAGER_COMPLETED:
    case EvaluationStatus.WAITING_FOR_FEEDBACK_MEETING:
      return 2;
    case EvaluationStatus.COMPLETED:
    case EvaluationStatus.ARCHIVED:
      return 4;
  }
}

/** פס התקדמות: 4 שלבי התהליך */
export function EvaluationSteps({ status }: { status: EvaluationStatus }) {
  const active = currentStep(status);
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="שלבי ההערכה">
      {STEPS.map((label, index) => {
        const done = index < active;
        const current = index === active;
        return (
          <li key={label} className="flex flex-col gap-1.5">
            <div className={cn("h-1.5 rounded-full", done ? "bg-primary" : current ? "bg-primary/40" : "bg-muted")} />
            <span className={cn("text-xs", done || current ? "font-medium text-foreground" : "text-muted-foreground")}>
              {done ? "✓ " : ""}
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
