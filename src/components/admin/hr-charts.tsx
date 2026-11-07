"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const PALETTE = ["#cbd5e1", "#93c5fd", "#fcd34d", "#fbbf24", "#60a5fa", "#3b82f6", "#10b981", "#94a3b8"];

export function StatusChart({ data }: { data: { label: string; count: number }[] }) {
  return (
    <div className="h-64 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} reversed />
          <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 12 }} orientation="right" />
          <Tooltip />
          <Bar dataKey="count" name="עובדים" radius={[4, 0, 0, 4]}>
            {data.map((_, index) => (
              <Cell key={index} fill={PALETTE[index % PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ScoreDistributionChart({ data }: { data: { range: string; count: number }[] }) {
  return (
    <div className="h-64 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
          <XAxis dataKey="range" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="count" name="עובדים" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
