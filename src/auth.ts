import NextAuth, { type NextAuthConfig, type Profile } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { AuditAction } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/dal/audit";

/**
 * אימות: Microsoft Entra ID (Azure AD) דרך Auth.js v5, אסטרטגיית JWT (ללא טבלאות Session).
 *
 * - רק משתמש שקיים בטבלת users ופעיל (isActive) יכול להתחבר – Entra מאמת זהות, המערכת קובעת הרשאה.
 * - בהתחברות הראשונה נשמר ה-oid של Entra ב-entraObjectId; מאז ההתאמה נעשית לפיו.
 * - ה-token מכיל רק userId. התפקיד נטען מה-DB בכל בקשה (src/lib/dal/session.ts),
 *   כך ששינוי הרשאות או השבתת משתמש נכנסים לתוקף מיד.
 *
 * כניסת פיתוח (dev-login): ספק Credentials לפי אימייל, פעיל רק כאשר
 * NODE_ENV !== "production" וגם AUTH_DEV_LOGIN="true". מיועד לבדיקה עם נתוני ה-seed לפני חיבור Entra.
 */

const ENTRA_PROVIDER_ID = "microsoft-entra-id";
const DEV_PROVIDER_ID = "dev-login";

const devLoginEnabled = process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_LOGIN === "true";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

interface EntraIdentity {
  objectId: string | null;
  email: string | null;
}

function readEntraIdentity(profile: Profile | undefined, fallbackEmail: string | null | undefined): EntraIdentity {
  const objectId = readString(profile?.oid);
  const email = readString(profile?.email) ?? readString(profile?.preferred_username) ?? readString(fallbackEmail);
  return { objectId, email: email?.toLowerCase() ?? null };
}

async function findUserForEntraIdentity(identity: EntraIdentity) {
  const conditions = [
    ...(identity.objectId ? [{ entraObjectId: identity.objectId }] : []),
    ...(identity.email ? [{ email: identity.email }] : []),
  ];
  if (conditions.length === 0) return null;
  return prisma.user.findFirst({
    where: { OR: conditions },
    select: { id: true, isActive: true, entraObjectId: true },
  });
}

const providers: NextAuthConfig["providers"] = [
  MicrosoftEntraID({
    clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
    clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
    issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
  }),
];

if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: DEV_PROVIDER_ID,
      name: "כניסת פיתוח (לפי אימייל)",
      credentials: { email: { label: "אימייל", type: "email" } },
      async authorize(credentials) {
        const email = readString(credentials?.email)?.toLowerCase();
        if (!email) return null;
        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, fullName: true, isActive: true },
        });
        if (!user || !user.isActive) return null;
        return { id: user.id, email: user.email, name: user.fullName };
      },
    }),
  );
}

/** האם כפתור "התחברות עם Microsoft" זמין (הוגדר App Registration ב-Entra) */
export const entraConfigured = Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET);
export const devLoginAvailable = devLoginEnabled;

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === DEV_PROVIDER_ID) {
        return devLoginEnabled && Boolean(user.id);
      }
      if (account?.provider !== ENTRA_PROVIDER_ID) {
        return false;
      }

      const identity = readEntraIdentity(profile, user.email);
      const dbUser = await findUserForEntraIdentity(identity);

      const objectIdMismatch =
        dbUser?.entraObjectId !== null && dbUser?.entraObjectId !== undefined && identity.objectId !== null && dbUser.entraObjectId !== identity.objectId;

      if (!dbUser || !dbUser.isActive || objectIdMismatch) {
        await recordAudit({
          action: AuditAction.ACCESS_DENIED,
          entityType: "Auth",
          actorId: dbUser?.id ?? null,
          metadata: {
            reason: !dbUser ? "USER_NOT_REGISTERED" : !dbUser.isActive ? "USER_INACTIVE" : "ENTRA_OBJECT_ID_MISMATCH",
            email: identity.email,
          },
        });
        return false;
      }

      await prisma.user.update({
        where: { id: dbUser.id },
        data: { entraObjectId: identity.objectId ?? dbUser.entraObjectId, lastLoginAt: new Date() },
      });
      return true;
    },

    async jwt({ token, user, account, profile }) {
      if (!account) return token;

      let userId: string | null = null;
      if (account.provider === DEV_PROVIDER_ID) {
        userId = readString(user?.id);
        if (userId) {
          await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
        }
      } else if (account.provider === ENTRA_PROVIDER_ID) {
        const dbUser = await findUserForEntraIdentity(readEntraIdentity(profile, user?.email));
        userId = dbUser?.isActive ? dbUser.id : null;
      }

      if (userId) {
        token.userId = userId;
        await recordAudit({
          action: AuditAction.LOGIN,
          entityType: "User",
          entityId: userId,
          actorId: userId,
          metadata: { provider: account.provider },
        });
      }
      return token;
    },

    async session({ session, token }) {
      if (typeof token.userId === "string" && session.user) {
        session.user.id = token.userId;
      }
      return session;
    },
  },
});
