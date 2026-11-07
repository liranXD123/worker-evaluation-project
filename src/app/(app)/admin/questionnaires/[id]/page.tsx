import type { Metadata } from "next";
import { getTemplate } from "@/lib/dal/questionnaires";
import { loadPage } from "@/lib/page-guard";
import { Alert, Card, ErrorState, LinkButton, PageHeader } from "@/components/ui/kit";
import { TemplateEditor } from "@/components/admin/template-editor";

// דף אישי לפי המשתמש המחובר – נטען בשרת בכל בקשה
export const instant = false;

export const metadata: Metadata = { title: "שאלון" };

const AUDIENCE: Record<string, string> = { EMPLOYEE: "לעובד", MANAGER: "למנהל", BOTH: "לשניהם" };

export default async function QuestionnairePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await loadPage(() => getTemplate(id));
  if (!result.ok) return <ErrorState message={result.message} />;
  const template = result.data;
  const ratingQuestions = template.questions.filter((question) => question.type === "RATING");
  const openQuestions = template.questions.filter((question) => question.type === "OPEN_TEXT");

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${template.name} – גרסה ${template.version}`}
        description={template.description ?? undefined}
        actions={
          <LinkButton href="/admin/questionnaires" variant="outline">
            חזרה לשאלונים
          </LinkButton>
        }
      />
      {template.isLocked ? (
        <>
          <Alert tone="muted">השאלון שויך למחזור הערכה ולכן נעול. לשינויים – צרו גרסה חדשה מרשימת השאלונים.</Alert>
          {template.categories.map((category) => (
            <Card key={category.id}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">{category.name}</h2>
                <span className="text-sm text-muted-foreground ltr-nums">{category.weight}%</span>
              </div>
              <ul className="list-inside list-disc space-y-1 text-sm">
                {ratingQuestions
                  .filter((question) => question.categoryId === category.id)
                  .map((question) => (
                    <li key={question.id}>{question.text}</li>
                  ))}
              </ul>
            </Card>
          ))}
          {openQuestions.length > 0 ? (
            <Card>
              <h2 className="mb-2 text-lg font-semibold">שאלות פתוחות</h2>
              <ul className="list-inside list-disc space-y-1 text-sm">
                {openQuestions.map((question) => (
                  <li key={question.id}>
                    {question.text} <span className="text-muted-foreground">({AUDIENCE[question.audience]})</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : (
        <Card>
          <TemplateEditor
            templateId={template.templateId}
            initial={{
              name: template.name,
              description: template.description,
              categories: template.categories.map((category) => ({
                key: category.key,
                name: category.name,
                nameEn: category.nameEn,
                weight: category.weight,
                questions: ratingQuestions
                  .filter((question) => question.categoryId === category.id)
                  .map((question) => ({ text: question.text, helpText: question.helpText })),
              })),
              openQuestions: openQuestions.map((question) => ({ text: question.text, audience: question.audience })),
            }}
          />
        </Card>
      )}
    </div>
  );
}
