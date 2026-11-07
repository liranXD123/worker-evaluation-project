"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, inputClass } from "@/components/ui/kit";

export interface EmployeeRow {
  id: string;
  employeeNumber: string;
  fullName: string;
  email: string;
  jobTitle: string;
  roleLabel: string;
  role: string;
  isActive: boolean;
  department: string;
  manager: string | null;
  directReportsCount: number;
  lastLogin: string;
}

export function EmployeesTable({ rows }: { rows: EmployeeRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.fullName, row.email, row.employeeNumber, row.department, row.jobTitle, row.manager ?? ""].some((value) => value.toLowerCase().includes(term)),
    );
  }, [rows, query]);

  return (
    <div className="space-y-3">
      <input
        type="search"
        placeholder="חיפוש לפי שם, אימייל, מחלקה או מנהל…"
        className={`${inputClass} max-w-md`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="חיפוש עובדים"
      />
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {["מס׳ עובד", "שם", "תפקיד", "מחלקה", "מנהל ישיר", "הרשאה", "כניסה אחרונה", ""].map((header) => (
                <th key={header} className="bg-muted/60 px-3 py-2.5 text-start font-semibold whitespace-nowrap">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className={row.isActive ? "" : "opacity-60"}>
                <td className="border-t px-3 py-2.5 ltr-nums text-start">{row.employeeNumber}</td>
                <td className="border-t px-3 py-2.5">
                  <p className="font-medium">{row.fullName}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {row.email}
                  </p>
                </td>
                <td className="border-t px-3 py-2.5">{row.jobTitle}</td>
                <td className="border-t px-3 py-2.5">{row.department}</td>
                <td className="border-t px-3 py-2.5">{row.manager ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="border-t px-3 py-2.5">
                  <Badge tone={row.role === "ADMIN" ? "info" : row.role === "MANAGER" ? "success" : "neutral"}>{row.roleLabel}</Badge>
                  {row.directReportsCount > 0 ? <span className="ms-1 text-xs text-muted-foreground">({row.directReportsCount} כפיפים)</span> : null}
                  {!row.isActive ? <Badge tone="muted" className="ms-1">מושבת</Badge> : null}
                </td>
                <td className="border-t px-3 py-2.5 text-xs text-muted-foreground">{row.lastLogin}</td>
                <td className="border-t px-3 py-2.5 text-end">
                  <Link href={`/admin/employees/${row.id}`} className="text-sm font-medium text-primary hover:underline">
                    עריכה
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="border-t px-3 py-6 text-center text-muted-foreground">
                  לא נמצאו עובדים
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        מוצגים {filtered.length} מתוך {rows.length}
      </p>
    </div>
  );
}
