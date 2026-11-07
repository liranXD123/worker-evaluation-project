"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { inputClass } from "@/components/ui/kit";

export interface CycleOption {
  id: string;
  label: string;
}

/** בחירת מחזור הערכה – מעדכנת את הפרמטר ?cycle= בכתובת */
export function CycleSelect({ cycles, value }: { cycles: CycleOption[]; value: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (cycles.length === 0) return null;
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">מחזור:</span>
      <select
        className={`${inputClass} w-auto py-1.5`}
        value={value ?? ""}
        onChange={(event) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set("cycle", event.target.value);
          router.push(`${pathname}?${params.toString()}`);
        }}
      >
        {cycles.map((cycle) => (
          <option key={cycle.id} value={cycle.id}>
            {cycle.label}
          </option>
        ))}
      </select>
    </label>
  );
}
