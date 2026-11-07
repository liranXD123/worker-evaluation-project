"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions/result";
import type { FieldErrors } from "@/lib/errors";

/**
 * הפעלת Server Action מקומפוננטת לקוח: מצב טעינה, הודעת שגיאה/הצלחה ושגיאות לפי שדה.
 */
export function useActionRunner<Input, Output>(action: (input: Input) => Promise<ActionResult<Output>>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [success, setSuccess] = useState<string | null>(null);

  function run(input: Input, options: { successMessage?: string; onSuccess?: (data: Output) => void } = {}) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const result = await action(input);
        if (result.ok) {
          setFieldErrors({});
          if (options.successMessage) setSuccess(options.successMessage);
          options.onSuccess?.(result.data);
          router.refresh();
        } else {
          setError(result.error.message);
          setFieldErrors(result.error.fieldErrors ?? {});
        }
      } catch {
        setError("לא ניתן היה להשלים את הפעולה. בדקו את החיבור ונסו שוב.");
      }
    });
  }

  return { run, pending, error, fieldErrors, success, setSuccess };
}

export function FormMessages({ error, success }: { error: string | null; success?: string | null }) {
  if (error) {
    return (
      <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
        {error}
      </p>
    );
  }
  if (success) {
    return (
      <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200">
        {success}
      </p>
    );
  }
  return null;
}

/** כפתור פעולה עם אישור ("האם אתם בטוחים?") */
export function ConfirmActionButton<Output>({
  action,
  confirmText,
  successMessage,
  variant = "default",
  size = "default",
  children,
}: {
  action: () => Promise<ActionResult<Output>>;
  confirmText?: string;
  successMessage?: string;
  variant?: "default" | "outline" | "secondary" | "destructive" | "ghost";
  size?: "default" | "sm" | "xs" | "lg";
  children: ReactNode;
}) {
  const { run, pending, error, success } = useActionRunner<void, Output>(action);
  return (
    <div className="inline-flex flex-col gap-2">
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={pending}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          run(undefined, { successMessage });
        }}
      >
        {pending ? "מבצע…" : children}
      </Button>
      <FormMessages error={error} success={success} />
    </div>
  );
}
