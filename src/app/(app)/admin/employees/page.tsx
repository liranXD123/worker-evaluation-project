import type { Metadata } from "next";
import { listUsers } from "@/lib/dal/users";
import { ROLE_LABELS } from "@/lib/domain/labels";
import { formatDate } from "@/lib/format";
import { loadPage } from "@/lib/page-guard";
import { ErrorState, LinkButton, PageHeader } from "@/components/ui/kit";
import { EmployeesTable } from "@/components/admin/employees-table";

// דף אישי לפי המשתמש המחובר – נטען בשרת בכל בקשה
export const instant = false;

export const metadata: Metadata = { title: "עובדים" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const showAll = query.show === "all";
  const result = await loadPage(() => listUsers({ includeInactive: showAll }));
  if (!result.ok) return <ErrorState message={result.message} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="עובדים ומבנה ארגוני"
        description="ניהול עובדים, שיוך למנהלים והרשאות"
        actions={
          <>
            <LinkButton href="/admin/employees/new">הוספת עובד</LinkButton>
            <LinkButton href="/admin/employees/import" variant="outline">
              ייבוא מ-Excel
            </LinkButton>
            <LinkButton href="/api/exports/users" variant="outline">
              ייצוא ל-Excel
            </LinkButton>
            <LinkButton href={showAll ? "/admin/employees" : "/admin/employees?show=all"} variant="ghost">
              {showAll ? "הצגת פעילים בלבד" : "הצגת מושבתים"}
            </LinkButton>
          </>
        }
      />
      <EmployeesTable
        rows={result.data.map((user) => ({
          id: user.id,
          employeeNumber: user.employeeNumber,
          fullName: user.fullName,
          email: user.email,
          jobTitle: user.jobTitle,
          role: user.role,
          roleLabel: ROLE_LABELS[user.role],
          isActive: user.isActive,
          department: user.department.name,
          manager: user.manager?.fullName ?? null,
          directReportsCount: user.directReportsCount,
          lastLogin: user.lastLoginAt ? formatDate(user.lastLoginAt) : "טרם התחבר/ה",
        }))}
      />
    </div>
  );
}
