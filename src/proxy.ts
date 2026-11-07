import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Proxy (לשעבר Middleware ב-Next.js 16): בדיקה אופטימית שהמשתמש מחובר.
 * זו אינה שכבת ההרשאות – כל פונקציית DAL ו-Server Action מאמתת מחדש מול ה-DB.
 */
export default auth((request) => {
  if (request.auth?.user?.id) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const signInUrl = new URL("/login", request.nextUrl.origin);
  signInUrl.searchParams.set("callbackUrl", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(signInUrl);
});

export const config = {
  matcher: [
    // הכל חוץ מ: מסך ההתחברות, נתיבי Auth.js, Cron (מאובטח במפתח), קבצים סטטיים
    "/((?!login|api/auth|api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
