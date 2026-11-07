"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ComparisonChartRow {
  label: string;
  employee: number | null;
  manager: number | null;
}

/** גרף עמודות: ציון עובד מול ציון מנהל לכל קטגוריה */
export function ComparisonChart({ rows }: { rows: ComparisonChartRow[] }) {
  return (
    <div className="h-72 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={0} reversed />
          <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 12 }} orientation="right" />
          <Tooltip formatter={(value) => (typeof value === "number" ? value.toFixed(2) : value)} />
          <Legend formatter={(value) => (value === "employee" ? "הערכה עצמית" : "הערכת מנהל")} />
          <Bar dataKey="employee" name="employee" fill="#93c5fd" radius={[4, 4, 0, 0]} />
          <Bar dataKey="manager" name="manager" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
