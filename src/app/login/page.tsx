import type { Metadata } from "next";
import { Suspense } from "react";
import { demoMode, devLoginAvailable, entraConfigured } from "@/auth";
import { DEMO_ACCOUNTS } from "@/lib/demo";
import { Alert, inputClass } from "@/components/ui/kit";
import { signInWithEmail, signInWithMicrosoft } from "./actions";

export const metadata: Metadata = { title: "התחברות" };

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "המשתמש שלך לא רשום במערכת או שהגישה הושבתה. פנו למשאבי אנוש.",
  CredentialsSignin: "לא נמצא משתמש פעיל עם האימייל הזה.",
  Configuration: "שגיאת הגדרה בשרת. פנו למנהל המערכת.",
};

export default function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground">ה</div>
          <h1 className="text-2xl font-bold">מערכת הערכת עובדים</h1>
          <p className="mt-1 text-sm text-muted-foreground">התחברו עם חשבון העבודה שלכם</p>
        </div>
        <Suspense fallback={<div className="h-28 animate-pulse rounded-lg bg-muted" />}>
          <LoginForms searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function LoginForms({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : "/";

  return (
    <div className="space-y-5">
      {error ? <Alert tone="danger">{ERROR_MESSAGES[error] ?? "ההתחברות נכשלה. נסו שוב."}</Alert> : null}

      {entraConfigured ? (
        <form action={signInWithMicrosoft}>
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-lg border bg-background px-4 py-3 text-sm font-semibold shadow-xs transition hover:bg-muted"
          >
            <svg aria-hidden="true" viewBox="0 0 21 21" className="size-5">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            התחברות עם Microsoft
          </button>
        </form>
      ) : demoMode ? (
        <Alert tone="muted" title="גרסת הדגמה">
          כל השמות והנתונים באתר פיקטיביים. בחרו משתמש כדי לראות את המערכת מנקודת המבט שלו.
        </Alert>
      ) : (
        <Alert tone="warning" title="התחברות Microsoft טרם הוגדרה">
          יש למלא את פרטי האפליקציה מ-Azure בקובץ ההגדרות (AUTH_MICROSOFT_ENTRA_ID_*).
        </Alert>
      )}

      {demoMode ? (
        <div className="space-y-2">
          {DEMO_ACCOUNTS.map((account) => (
            <form key={account.email} action={signInWithEmail}>
              <input type="hidden" name="callbackUrl" value={callbackUrl} />
              <input type="hidden" name="email" value={account.email} />
              <button
                type="submit"
                className="flex w-full items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3 text-start transition hover:border-primary hover:bg-muted"
              >
                <span>
                  <span className="block text-sm font-semibold">
                    {account.name} · {account.role}
                  </span>
                  <span className="block text-xs text-muted-foreground">{account.hint}</span>
                </span>
                <span aria-hidden="true" className="text-primary">
                  ←
                </span>
              </button>
            </form>
          ))}
        </div>
      ) : null}

      {devLoginAvailable ? (
        <form action={signInWithEmail} className="space-y-3 border-t pt-5">
          <p className="text-xs font-medium text-muted-foreground">{demoMode ? "או כניסה עם אימייל של משתמש אחר מנתוני ההדגמה" : "כניסת פיתוח (זמינה רק בסביבת פיתוח)"}</p>
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <label htmlFor="email" className="sr-only">
            אימייל
          </label>
          <input id="email" name="email" type="email" required placeholder="name@example.com" dir="ltr" className={inputClass} />
          <button
            type="submit"
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            {demoMode ? "כניסה" : "כניסת פיתוח"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
