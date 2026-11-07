import type { Metadata } from "next";
import { requireAdmin } from "@/lib/dal/session";
import { loadPage } from "@/lib/page-guard";
import { Card, CardTitle, ErrorState, LinkButton, PageHeader } from "@/components/ui/kit";
import { ImportWizard } from "@/components/admin/import-wizard";

// דף אישי לפי המשתמש המחובר – נטען בשרת בכל בקשה
export const instant = false;

export const metadata: Metadata = { title: "ייבוא עובדים" };

export default async function ImportEmployeesPage() {
  const result = await loadPage(() => requireAdmin());
  if (!result.ok) return <ErrorState message={result.message} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="ייבוא עובדים מ-Excel"
        description="הוספה ועדכון של עובדים ומנהלים בבת אחת"
        actions={
          <LinkButton href="/admin/employees" variant="outline">
            חזרה לרשימה
          </LinkButton>
        }
      />
      <Card>
        <CardTitle>שלושה צעדים</CardTitle>
        <ol className="list-inside list-decimal space-y-1.5 text-sm">
          <li>
            הורידו את{" "}
            <a href="/api/imports/employees/template" className="font-medium text-primary hover:underline">
              קובץ התבנית
            </a>{" "}
            (או את{" "}
            <a href="/api/exports/users" className="font-medium text-primary hover:underline">
              רשימת העובדים הנוכחית
            </a>{" "}
            כדי לערוך אותה).
          </li>
          <li>מלאו שורה לכל עובד. עובד קיים מזוהה לפי &quot;מספר עובד&quot; ויעודכן; עובד חדש ייווצר.</li>
          <li>העלו את הקובץ, בדקו את התצוגה המקדימה ולחצו &quot;שמירה במערכת&quot;. אם יש שגיאה – שום דבר לא נשמר.</li>
        </ol>
      </Card>
      <ImportWizard />
    </div>
  );
}
