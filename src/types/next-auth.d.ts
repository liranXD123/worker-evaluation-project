import "next-auth/jwt";

declare module "next-auth/jwt" {
  interface JWT {
    /** מזהה המשתמש בטבלת users */
    userId?: string;
  }
}
