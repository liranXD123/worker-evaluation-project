"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createUserAction, updateUserAction } from "@/app/actions/admin-actions";
import { Button } from "@/components/ui/button";
import { FormMessages, useActionRunner } from "@/components/ui/action-form";
import { Field, inputClass } from "@/components/ui/kit";

export interface EmployeeFormValues {
  employeeNumber: string;
  fullName: string;
  email: string;
  jobTitle: string;
  departmentId: string;
  role: "ADMIN" | "MANAGER" | "EMPLOYEE";
  managerId: string;
  hireDate: string;
}

export function EmployeeForm({
  userId,
  initial,
  departments,
  managers,
}: {
  userId?: string;
  initial: EmployeeFormValues;
  departments: { id: string; name: string }[];
  managers: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const set = (patch: Partial<EmployeeFormValues>) => setValues((current) => ({ ...current, ...patch }));
  const create = useActionRunner(createUserAction);
  const update = useActionRunner(updateUserAction);
  const runner = userId ? update : create;
  const errorOf = (field: string) => runner.fieldErrors[field]?.[0];

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        const payload = {
          ...values,
          managerId: values.managerId || null,
          hireDate: new Date(`${values.hireDate}T12:00:00Z`).toISOString(),
        };
        if (userId) {
          update.run({ ...payload, userId }, { successMessage: "הפרטים נשמרו." });
        } else {
          create.run(payload, { onSuccess: (data) => router.push(`/admin/employees/${(data as { userId: string }).userId}?created=1`) });
        }
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="מספר עובד" htmlFor="e-number" error={errorOf("employeeNumber")}>
          <input id="e-number" required className={inputClass} value={values.employeeNumber} onChange={(event) => set({ employeeNumber: event.target.value })} />
        </Field>
        <Field label="שם מלא" htmlFor="e-name" error={errorOf("fullName")}>
          <input id="e-name" required className={inputClass} value={values.fullName} onChange={(event) => set({ fullName: event.target.value })} />
        </Field>
        <Field label="אימייל (כפי שמופיע ב-Microsoft 365)" htmlFor="e-email" error={errorOf("email")}>
          <input id="e-email" type="email" required dir="ltr" className={inputClass} value={values.email} onChange={(event) => set({ email: event.target.value })} />
        </Field>
        <Field label="תפקיד" htmlFor="e-job" error={errorOf("jobTitle")}>
          <input id="e-job" required className={inputClass} value={values.jobTitle} onChange={(event) => set({ jobTitle: event.target.value })} />
        </Field>
        <Field label="מחלקה" htmlFor="e-dept" error={errorOf("departmentId")}>
          <select id="e-dept" required className={inputClass} value={values.departmentId} onChange={(event) => set({ departmentId: event.target.value })}>
            <option value="">בחירה…</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="תאריך תחילת עבודה" htmlFor="e-hire" error={errorOf("hireDate")}>
          <input id="e-hire" type="date" required className={inputClass} value={values.hireDate} onChange={(event) => set({ hireDate: event.target.value })} />
        </Field>
        <Field label="מנהל ישיר" htmlFor="e-manager" hint="עובד ללא מנהל ישיר לא ישתתף במחזורי הערכה" error={errorOf("managerId")}>
          <select id="e-manager" className={inputClass} value={values.managerId} onChange={(event) => set({ managerId: event.target.value })}>
            <option value="">ללא</option>
            {managers.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="הרשאה במערכת" htmlFor="e-role" error={errorOf("role")}>
          <select id="e-role" className={inputClass} value={values.role} onChange={(event) => set({ role: event.target.value as EmployeeFormValues["role"] })}>
            <option value="EMPLOYEE">עובד</option>
            <option value="MANAGER">מנהל</option>
            <option value="ADMIN">מנהל מערכת (HR)</option>
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={runner.pending}>
          {runner.pending ? "שומר…" : userId ? "שמירת שינויים" : "הוספת עובד"}
        </Button>
        <FormMessages error={runner.error} success={runner.success} />
      </div>
    </form>
  );
}
