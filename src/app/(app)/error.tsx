"use client";

import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-xl font-semibold">משהו השתבש</h1>
      <p className="mt-2 text-sm text-muted-foreground">אירעה שגיאה בטעינת הדף. נסו שוב, ואם הבעיה חוזרת פנו למנהל המערכת.</p>
      <Button className="mt-6" onClick={reset}>
        נסו שוב
      </Button>
    </div>
  );
}
