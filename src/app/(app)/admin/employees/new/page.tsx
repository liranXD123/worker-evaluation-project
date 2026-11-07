import type { Metadata } from "next";
import { listDepartments, listUsers } from "@/lib/dal/users";
import { ROLE_LABELS } from "@/lib/domain/labels";
import { toDateInputValue } from "@/lib/format";
import { loadPage } from "@/lib/page-guard";
import { Card, ErrorState, PageHeader } from "@/components/ui/kit";
import { EmployeeForm } from "@/components/admin/employee-form";

// דף אישי לפי המשתמש המחובר – נטען בשרת בכל בקשה
export const instant = false;

export const metadata: Metadata = { title: "הוספת עובד" };

export default async function NewEmployeePage() {
  const result = await loadPage(async () => {
    const [users, departments] = await Promise.all([listUsers(), listDepartments()]);
    return { users, departments, today: toDateInputValue(new Date()) };
  });
  if (!result.ok) return <ErrorState message={result.message} />;
  const { users, departments, today } = result.data;

  return (
    <div className="space-y-6">
      <PageHeader title="הוספת עובד" description="עובד חדש יוכל להתחבר עם חשבון ה-Microsoft שלו לפי כתובת האימייל" />
      <Card>
        <EmployeeForm
          initial={{ employeeNumber: "", fullName: "", email: "", jobTitle: "", departmentId: "", role: "EMPLOYEE", managerId: "", hireDate: today }}
          departments={departments}
          managers={users
            .filter((user) => user.role !== "EMPLOYEE")
            .map((user) => ({ id: user.id, label: `${user.fullName} (${ROLE_LABELS[user.role]})` }))}
        />
      </Card>
    </div>
  );
}
