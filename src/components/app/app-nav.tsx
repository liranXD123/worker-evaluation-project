import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Role } from "@/generated/prisma/enums";
import { ROLE_LABELS } from "@/lib/domain/labels";
import { getCurrentUser } from "@/lib/dal/session";
import { signOutAction } from "@/app/login/actions";
import { NavLinks, type NavItem } from "@/components/app/nav-links";

/** תפריט ראשי לפי תפקיד: עובד / מנהל / מנהל מערכת */
export async function AppNav() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const items: NavItem[] = [{ href: "/", label: "דף הבית", exact: true }];
  if (user.role === Role.MANAGER || user.role === Role.ADMIN) {
    items.push({ href: "/team", label: "הצוות שלי" });
  }
  if (user.role === Role.ADMIN) {
    items.push(
      { href: "/admin", label: "דשבורד HR", exact: true },
      { href: "/admin/cycles", label: "מחזורי הערכה" },
      { href: "/admin/employees", label: "עובדים" },
      { href: "/admin/questionnaires", label: "שאלונים" },
      { href: "/admin/reports", label: "דוחות" },
      { href: "/admin/audit", label: "יומן פעולות" },
    );
  }

  return (
    <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
      <NavLinks items={items} />
      <div className="flex items-center gap-3 text-sm">
        <div className="text-end leading-tight">
          <p className="font-medium">{user.fullName}</p>
          <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
        </div>
        <form action={signOutAction}>
          <button type="submit" className="rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-muted">
            התנתקות
          </button>
        </form>
      </div>
    </div>
  );
}
