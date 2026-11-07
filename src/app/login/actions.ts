"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";

/** מונע הפניה לאתר חיצוני אחרי התחברות: רק נתיב פנימי שמתחיל ב-"/" */
function safeCallback(value: FormDataEntryValue | null): string {
  const path = typeof value === "string" ? value : "/";
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

export async function signInWithMicrosoft(formData: FormData): Promise<void> {
  await signIn("microsoft-entra-id", { redirectTo: safeCallback(formData.get("callbackUrl")) });
}

export async function signInWithEmail(formData: FormData): Promise<void> {
  const callbackUrl = safeCallback(formData.get("callbackUrl"));
  try {
    await signIn("dev-login", { email: String(formData.get("email") ?? ""), redirectTo: callbackUrl });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/login?error=${encodeURIComponent(error.type)}&callbackUrl=${encodeURIComponent(callbackUrl)}`);
    }
    throw error;
  }
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
