# Project Engineering Rules & Skills

## 1. Tech Stack & Commands
- Framework: Next.js (App Router), TypeScript (Strict mode), Tailwind CSS.
- Database: PostgreSQL with Prisma ORM.
- UI Components: shadcn/ui (Radix) + Lucide Icons + Recharts.
- Useful Commands:
  - `npx prisma validate` - Run after modifying schema.prisma.
  - `npx prisma generate` - Run to update Prisma Client types.
  - `npm run typecheck` (or `npx tsc --noEmit`) - Always run after creating/editing files to verify zero TypeScript errors.

## 2. Strict Architecture & Security Rules
- **Data Access Layer (DAL):** Never query `prisma` directly inside React Components. Create dedicated functions inside `src/lib/dal/` or `src/services/`.
- **Blind Assessment Enforcement:** In any DAL function returning evaluation data to a Manager, if `evaluation.managerStatus !== 'SUBMITTED'`, explicitly omit or nullify `employeeAnswers` and `employeeScores` at the backend level.
- **Hierarchy Isolation:** Every manager query MUST include `where: { employee: { managerId: session.user.id } }`.

## 3. RTL & Hebrew UI Standards
- Root `<html>` tag must have `dir="rtl"` and `lang="he"`.
- Use logical Tailwind properties ONLY: use `ms-*` / `me-*` instead of `ml-*` / `mr-*`, and `ps-*` / `pe-*` instead of `pl-*` / `pr-*`.
- Use `text-start` and `text-end` instead of `text-left` and `text-right`.