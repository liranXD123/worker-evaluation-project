import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource/heebo/400.css";
import "@fontsource/heebo/500.css";
import "@fontsource/heebo/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "מערכת הערכת עובדים", template: "%s · מערכת הערכת עובדים" },
  description: "ניהול תהליך הערכת עובדים שנתי: הערכה עצמית, הערכת מנהל, שיחת משוב ויעדים",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
