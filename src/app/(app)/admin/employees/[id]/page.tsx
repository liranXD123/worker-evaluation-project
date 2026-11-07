import type { Metadata } from "next";
import { deactivateUserAction } from "@/app/actions/admin-actions";
import { getUserForEdit, listDepartments, listUsers } from "@/lib/dal/users";
import { ROLE_LABELS } from "@/lib/domain/labels";
import { toDateInputValue } from "@/lib/format";
import { loadPage } from "@/lib/page-guard";
import { ConfirmActionButton } from "@/components/ui/action-form";
import { Alert, Card, CardTitle, ErrorState, LinkButton, PageHeader } from "@/components/ui/kit";
import { EmployeeForm } from "@/components/admin/employee-form";

// דף אישי לפי המשתמש המחובר – נטען בשרת בכל בקשה
export const instant = false;

export const metadata: Metadata = { title: "עריכת עובד" };

export default async function EditEmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const result = await loadPage(async () => {
    const [user, users, departments] = await Promise.all([getUserForEdit(id), listUsers(), listDepartments()]);
    return { user, users, departments };
  });
  if (!result.ok) return <ErrorState message={result.message} />;
  const { user, users, departments } = result.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={user.fullName}
        description={user.isActive ? "עריכת פרטי עובד" : "עובד מושבת"}
        actions={
          <LinkButton href="/admin/employees" variant="outline">
            חזרה לרשימה
          </LinkButton>
        }
      />
      {query.created ? <Alert tone="success">העובד נוסף בהצלחה.</Alert> : null}
      <Card>
        <EmployeeForm
          userId={user.id}
          initial={{
            employeeNumber: user.employeeNumber,
            fullName: user.fullName,
            email: user.email,
            jobTitle: user.jobTitle,
            departmentId: user.departmentId,
            role: user.role,
            managerId: user.managerId ?? "",
            hireDate: toDateInputValue(user.hireDate),
          }}
          departments={departments}
          managers={users
            .filter((candidate) => candidate.role !== "EMPLOYEE" && candidate.id !== user.id)
            .map((candidate) => ({ id: candidate.id, label: `${candidate.fullName} (${ROLE_LABELS[candidate.role]})` }))}
        />
      </Card>
      {user.isActive ? (
        <Card>
          <CardTitle>השבתת עובד</CardTitle>
          <p className="mb-4 text-sm text-muted-foreground">עובד מושבת לא יוכל להתחבר ולא ייכלל במחזורי הערכה חדשים. ההיסטוריה שלו נשמרת.</p>
          <ConfirmActionButton
            action={deactivateUserAction.bind(null, { userId: user.id })}
            variant="destructive"
            confirmText={`להשבית את ${user.fullName}?`}
            successMessage="העובד הושבת."
          >
            השבתת עובד
          </ConfirmActionButton>
        </Card>
      ) : null}
    </div>
  );
}
