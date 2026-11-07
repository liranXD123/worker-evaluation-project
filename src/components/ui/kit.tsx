import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/** רכיבי תצוגה משותפים (Server-safe). כל המרווחים לוגיים (ms/me/ps/pe) לתמיכה ב-RTL. */

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-xl border bg-card p-5 shadow-sm", className)} {...props} />;
}

export function CardTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">{children}</h2>
      {actions}
    </div>
  );
}

type Tone = "neutral" | "info" | "warning" | "success" | "muted" | "danger";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  info: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  warning: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  muted: "bg-muted text-muted-foreground",
  danger: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", TONE_CLASSES[tone], className)}>
      {children}
    </span>
  );
}

export function Alert({ tone = "info", title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  return (
    <div className={cn("rounded-lg px-4 py-3 text-sm", TONE_CLASSES[tone])} role={tone === "danger" ? "alert" : "status"}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-1" : undefined}>{children}</div> : null}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = "neutral" }: { label: string; value: ReactNode; hint?: string; tone?: Tone }) {
  const accent: Record<Tone, string> = {
    neutral: "text-foreground",
    info: "text-blue-700",
    warning: "text-amber-700",
    success: "text-emerald-700",
    muted: "text-muted-foreground",
    danger: "text-red-700",
  };
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-3xl font-bold ltr-nums text-start", accent[tone])}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function ProgressBar({ value, max = 100, className }: { value: number; max?: number; className?: string }) {
  const percent = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed bg-card px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-2 text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}

export function LinkButton({
  href,
  variant = "default",
  size = "default",
  className,
  children,
  prefetch,
  download,
}: {
  href: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "xs";
  className?: string;
  children: ReactNode;
  prefetch?: boolean;
  download?: boolean;
}) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (download || href.startsWith("/api/")) {
    return (
      <a href={href} className={classes} download={download ? "" : undefined}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} prefetch={prefetch}>
      {children}
    </Link>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border bg-card", className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("bg-muted/60 px-3 py-2.5 text-start font-semibold whitespace-nowrap", className)}>{children}</th>;
}

export function Td({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn("border-t px-3 py-2.5 align-middle", className)}>
      {children}
    </td>
  );
}

export function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor?: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

export const inputClass =
  "block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60";

export function PageLoading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="טוען">
      <div className="h-8 w-56 rounded-md bg-muted" />
      <div className="h-4 w-80 rounded-md bg-muted" />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="h-24 rounded-xl bg-muted" />
        <div className="h-24 rounded-xl bg-muted" />
        <div className="h-24 rounded-xl bg-muted" />
      </div>
      <div className="h-64 rounded-xl bg-muted" />
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-lg py-12">
      <Alert tone="danger" title="לא ניתן להציג את הדף">
        {message}
      </Alert>
      <div className="mt-4">
        <LinkButton href="/" variant="outline">
          חזרה לדף הבית
        </LinkButton>
      </div>
    </div>
  );
}
