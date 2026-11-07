import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { PageLoading } from "@/components/ui/kit";
import { AppNav } from "@/components/app/app-nav";
import { DemoBanner } from "@/components/app/demo-banner";

/**
 * מעטפת האפליקציה למשתמשים מחוברים.
 * Cache Components: החלקים שקוראים את ה-Session (תפריט ותוכן הדף) נטענים בתוך Suspense,
 * והמסגרת הסטטית (כותרת, רקע) מוצגת מיד.
 */
export const instant = false;

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Suspense fallback={null}>
        <DemoBanner />
      </Suspense>
      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">ה</span>
            <span>הערכת עובדים</span>
          </Link>
          <Suspense fallback={<div className="h-8 flex-1 animate-pulse rounded-md bg-muted" />}>
            <AppNav />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-8">
        <Suspense fallback={<PageLoading />}>{children}</Suspense>
      </main>
      <footer className="border-t py-4 text-center text-xs text-muted-foreground">מערכת הערכת עובדים · מידע פנימי וסודי</footer>
    </div>
  );
}
