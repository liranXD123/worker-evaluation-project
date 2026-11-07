import Link from "next/link";
import { connection } from "next/server";
import { demoMode } from "@/auth";

/** פס "גרסת הדגמה" – נקבע בזמן הבקשה (לפי DEMO_MODE בשרת), לא בזמן ה-build */
export async function DemoBanner() {
  await connection();
  if (!demoMode) return null;
  return (
    <div className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
      גרסת הדגמה · כל השמות והנתונים פיקטיביים ·{" "}
      <Link href="/login" className="underline">
        החלפת משתמש
      </Link>
    </div>
  );
}
