import type { AnswerDTO, EvaluationDetailDTO } from "@/lib/dal/evaluations";
import { Card } from "@/components/ui/kit";

/** תצוגת קריאה בלבד של תשובות – רק הצדדים שה-DAL החזיר (חוק הסודיות נאכף שם) */
export function AnswersView({ detail }: { detail: EvaluationDetailDTO }) {
  const employee = new Map((detail.employeeAnswers ?? []).map((answer: AnswerDTO) => [answer.questionId, answer]));
  const manager = new Map((detail.managerAnswers ?? []).map((answer: AnswerDTO) => [answer.questionId, answer]));
  const showEmployee = detail.employeeAnswers !== null;
  const showManager = detail.managerAnswers !== null;
  const ratingQuestions = detail.questions.filter((question) => question.type === "RATING");
  const openQuestions = detail.questions.filter((question) => question.type === "OPEN_TEXT");

  return (
    <div className="space-y-5">
      {detail.categories.map((category) => (
        <Card key={category.id}>
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-lg font-semibold">{category.name}</h3>
            <span className="text-sm text-muted-foreground">
              משקל <span className="ltr-nums">{category.weight}%</span>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="pb-2 text-start font-medium">שאלה</th>
                  {showEmployee ? <th className="w-28 pb-2 text-center font-medium">עובד</th> : null}
                  {showManager ? <th className="w-28 pb-2 text-center font-medium">מנהל</th> : null}
                </tr>
              </thead>
              <tbody>
                {ratingQuestions
                  .filter((question) => question.categoryId === category.id)
                  .map((question) => (
                    <tr key={question.id} className="border-t">
                      <td className="py-2.5">{question.text}</td>
                      {showEmployee ? <td className="py-2.5 text-center text-base font-semibold">{employee.get(question.id)?.score ?? "—"}</td> : null}
                      {showManager ? <td className="py-2.5 text-center text-base font-semibold">{manager.get(question.id)?.score ?? "—"}</td> : null}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      {openQuestions.length > 0 ? (
        <Card>
          <h3 className="mb-3 text-lg font-semibold">שאלות פתוחות</h3>
          <div className="space-y-4">
            {openQuestions.map((question) => {
              const employeeText = employee.get(question.id)?.textAnswer;
              const managerText = manager.get(question.id)?.textAnswer;
              if (!employeeText && !managerText) return null;
              return (
                <div key={question.id} className="border-t pt-3 first:border-t-0 first:pt-0">
                  <p className="font-medium">{question.text}</p>
                  {employeeText ? (
                    <p className="mt-1 whitespace-pre-line text-sm">
                      <span className="text-muted-foreground">עובד: </span>
                      {employeeText}
                    </p>
                  ) : null}
                  {managerText ? (
                    <p className="mt-1 whitespace-pre-line text-sm">
                      <span className="text-muted-foreground">מנהל: </span>
                      {managerText}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
