import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-20 text-center">
      <p className="text-5xl font-bold text-muted-foreground ltr-nums">404</p>
      <h1 className="text-xl font-semibold">הדף לא נמצא או שאין לך גישה אליו</h1>
      <Link href="/" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        חזרה לדף הבית
      </Link>
    </main>
  );
}
