import type { Metadata } from "next";
import { cloneTemplateAction } from "@/app/actions/admin-actions";
import { listTemplates } from "@/lib/dal/questionnaires";
import { formatDate } from "@/lib/format";
import { loadPage } from "@/lib/page-guard";
import { ConfirmActionButton } from "@/components/ui/action-form";
import { Alert, Badge, ErrorState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui/kit";

// דף אישי לפי המשתמש המחובר – נטען בשרת בכל בקשה
export const instant = false;

export const metadata: Metadata = { title: "שאלונים" };

export default async function QuestionnairesPage() {
  const result = await loadPage(() => listTemplates());
  if (!result.ok) return <ErrorState message={result.message} />;

  return (
    <div className="space-y-6">
      <PageHeader title="שאלונים" description="כל מחזור הערכה משתמש בגרסה קבועה של שאלון, כך שהיסטוריית השנים הקודמות נשמרת" />
      <Alert tone="info">
        שאלון שכבר שויך למחזור נעול לעריכה. כדי לשנות שאלות לקראת מחזור הבא לחצו &quot;גרסה חדשה&quot;, ערכו אותה ובחרו בה ביצירת המחזור.
      </Alert>
      <Table>
        <thead>
          <tr>
            <Th>שאלון</Th>
            <Th>גרסה</Th>
            <Th>מצב</Th>
            <Th>קטגוריות / שאלות</Th>
            <Th>מחזורים</Th>
            <Th>נוצר</Th>
            <Th>פעולות</Th>
          </tr>
        </thead>
        <tbody>
          {result.data.map((template) => (
            <tr key={template.id}>
              <Td>
                <p className="font-medium">{template.name}</p>
                {template.description ? <p className="text-xs text-muted-foreground">{template.description}</p> : null}
              </Td>
              <Td className="ltr-nums text-start">{template.version}</Td>
              <Td>{template.isLocked ? <Badge tone="muted">נעול</Badge> : <Badge tone="warning">ניתן לעריכה</Badge>}</Td>
              <Td className="ltr-nums text-start">
                {template.categoriesCount} / {template.questionsCount}
              </Td>
              <Td className="ltr-nums text-start">{template.cyclesCount}</Td>
              <Td>{formatDate(template.createdAt)}</Td>
              <Td>
                <div className="flex flex-wrap gap-2">
                  <LinkButton href={`/admin/questionnaires/${template.id}`} size="sm" variant={template.isLocked ? "outline" : "default"}>
                    {template.isLocked ? "צפייה" : "עריכה"}
                  </LinkButton>
                  <ConfirmActionButton action={cloneTemplateAction.bind(null, { templateId: template.id })} size="sm" variant="outline" successMessage="נוצרה גרסה חדשה – היא מופיעה ברשימה.">
                    גרסה חדשה
                  </ConfirmActionButton>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
