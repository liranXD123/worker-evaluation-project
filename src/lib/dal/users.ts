import "server-only";
import { AssessmentStatus, AuditAction, CycleStatus, Role } from "@/generated/prisma/enums";
import { isUniqueViolation, prisma, type DbClient } from "@/lib/db";
import { conflict, notFound, validationError } from "@/lib/errors";
import { recordAudit } from "@/lib/dal/audit";
import { requireAdmin, requireUser } from "@/lib/dal/session";
import {
  parseInput,
  updateUserSchema,
  userInputSchema,
  userRefSchema,
  type UserInput,
} from "@/lib/validation/schemas";

/** ניהול עובדים ומבנה ארגוני – מנהל מערכת בלבד (SPEC §3). */

export interface UserRowDTO {
  id: string;
  employeeNumber: string;
  fullName: string;
  email: string;
  jobTitle: string;
  role: Role;
  isActive: boolean;
  hireDate: Date;
  lastLoginAt: Date | null;
  department: { id: string; name: string };
  manager: { id: string; fullName: string } | null;
  directReportsCount: number;
}

export interface DepartmentDTO {
  id: string;
  name: string;
  code: string;
}

export async function listUsers(options: { includeInactive?: boolean } = {}): Promise<UserRowDTO[]> {
  await requireAdmin();
  const users = await prisma.user.findMany({
    where: options.includeInactive ? {} : { isActive: true },
    orderBy: [{ department: { name: "asc" } }, { fullName: "asc" }],
    select: {
      id: true,
      employeeNumber: true,
      fullName: true,
      email: true,
      jobTitle: true,
      role: true,
      isActive: true,
      hireDate: true,
      lastLoginAt: true,
      department: { select: { id: true, name: true } },
      manager: { select: { id: true, fullName: true } },
      _count: { select: { directReports: { where: { isActive: true } } } },
    },
  });
  return users.map(({ _count, ...user }) => ({ ...user, directReportsCount: _count.directReports }));
}

export interface UserEditDTO {
  id: string;
  employeeNumber: string;
  fullName: string;
  email: string;
  jobTitle: string;
  departmentId: string;
  role: Role;
  managerId: string | null;
  hireDate: Date;
  isActive: boolean;
}

export async function getUserForEdit(userId: string): Promise<UserEditDTO> {
  await requireAdmin();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      employeeNumber: true,
      fullName: true,
      email: true,
      jobTitle: true,
      departmentId: true,
      role: true,
      managerId: true,
      hireDate: true,
      isActive: true,
    },
  });
  if (!user) throw notFound("העובד");
  return user;
}

export async function listDepartments(): Promise<DepartmentDTO[]> {
  await requireUser();
  return prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true } });
}

/** מוודא שהמנהל קיים, פעיל, בתפקיד ניהולי, ושהשיוך לא יוצר מעגל בהיררכיה. */
async function assertValidManager(db: DbClient, managerId: string | null, userId: string | null): Promise<void> {
  if (managerId === null) return;
  if (managerId === userId) {
    throw validationError("עובד לא יכול להיות המנהל של עצמו.", { managerId: ["בחירה לא תקינה"] });
  }
  const manager = await db.user.findUnique({ where: { id: managerId }, select: { isActive: true, role: true } });
  if (!manager || !manager.isActive) {
    throw validationError("המנהל שנבחר אינו קיים או אינו פעיל.", { managerId: ["בחירה לא תקינה"] });
  }
  if (manager.role === Role.EMPLOYEE) {
    throw validationError("ניתן לשייך רק למשתמש בתפקיד מנהל או מנהל מערכת.", { managerId: ["בחירה לא תקינה"] });
  }
  if (userId === null) return;

  const visited = new Set<string>();
  let cursor: string | null = managerId;
  while (cursor !== null) {
    if (cursor === userId) {
      throw validationError("השיוך יוצר מעגל במבנה הארגוני.", { managerId: ["בחירה לא תקינה"] });
    }
    if (visited.has(cursor)) break;
    visited.add(cursor);
    const next: { managerId: string | null } | null = await db.user.findUnique({
      where: { id: cursor },
      select: { managerId: true },
    });
    cursor = next?.managerId ?? null;
  }
}

async function assertDepartmentExists(departmentId: string): Promise<void> {
  const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });
  if (!department) throw validationError("המחלקה שנבחרה אינה קיימת.", { departmentId: ["בחירה לא תקינה"] });
}

function userData(input: UserInput) {
  return {
    employeeNumber: input.employeeNumber,
    fullName: input.fullName,
    email: input.email,
    jobTitle: input.jobTitle,
    departmentId: input.departmentId,
    role: input.role,
    managerId: input.managerId,
    hireDate: input.hireDate,
  };
}

const DUPLICATE_USER_MESSAGE = "מספר העובד או כתובת האימייל כבר קיימים במערכת.";

export async function createUser(rawInput: unknown): Promise<{ userId: string }> {
  const admin = await requireAdmin();
  const input = parseInput(userInputSchema, rawInput);
  await assertDepartmentExists(input.departmentId);
  await assertValidManager(prisma, input.managerId, null);

  try {
    const user = await prisma.user.create({ data: userData(input), select: { id: true } });
    await recordAudit({
      action: AuditAction.USER_CREATED,
      entityType: "User",
      entityId: user.id,
      actorId: admin.id,
      metadata: { email: input.email, role: input.role, managerId: input.managerId },
    });
    return { userId: user.id };
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict(DUPLICATE_USER_MESSAGE);
    throw error;
  }
}

/**
 * עדכון עובד. בשינוי מנהל ישיר – הערכות פתוחות במחזור הפעיל (שהמנהל עוד לא הגיש) עוברות למנהל החדש.
 */
export async function updateUser(rawInput: unknown): Promise<{ userId: string }> {
  const admin = await requireAdmin();
  const input = parseInput(updateUserSchema, rawInput);

  const existing = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      role: true,
      managerId: true,
      _count: { select: { directReports: { where: { isActive: true } } } },
    },
  });
  if (!existing) throw notFound("העובד");

  if (existing.id === admin.id && input.role !== Role.ADMIN) {
    throw validationError("לא ניתן להסיר הרשאת מנהל מערכת מהמשתמש שלך.", { role: ["בחירה לא תקינה"] });
  }
  if (input.role === Role.EMPLOYEE && existing._count.directReports > 0) {
    throw validationError("לעובד זה יש כפיפים פעילים. יש לשייך אותם למנהל אחר לפני שינוי התפקיד.", { role: ["בחירה לא תקינה"] });
  }
  await assertDepartmentExists(input.departmentId);
  await assertValidManager(prisma, input.managerId, input.userId);

  const roleChanged = existing.role !== input.role;
  const managerChanged = existing.managerId !== input.managerId;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: input.userId }, data: userData(input) });

      let reassignedEvaluations = 0;
      if (managerChanged && input.managerId !== null) {
        const reassigned = await tx.evaluation.updateMany({
          where: {
            employeeId: input.userId,
            cycle: { status: CycleStatus.ACTIVE },
            managerStatus: { not: AssessmentStatus.SUBMITTED },
          },
          data: { managerId: input.managerId },
        });
        reassignedEvaluations = reassigned.count;
      }

      await recordAudit(
        { action: AuditAction.USER_UPDATED, entityType: "User", entityId: input.userId, actorId: admin.id },
        tx,
      );
      if (roleChanged) {
        await recordAudit(
          {
            action: AuditAction.ROLE_CHANGED,
            entityType: "User",
            entityId: input.userId,
            actorId: admin.id,
            metadata: { from: existing.role, to: input.role },
          },
          tx,
        );
      }
      if (managerChanged) {
        await recordAudit(
          {
            action: AuditAction.MANAGER_ASSIGNED,
            entityType: "User",
            entityId: input.userId,
            actorId: admin.id,
            metadata: { from: existing.managerId, to: input.managerId, reassignedEvaluations },
          },
          tx,
        );
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict(DUPLICATE_USER_MESSAGE);
    throw error;
  }

  return { userId: input.userId };
}

export async function deactivateUser(rawInput: unknown): Promise<{ userId: string }> {
  const admin = await requireAdmin();
  const { userId } = parseInput(userRefSchema, rawInput);
  if (userId === admin.id) throw validationError("לא ניתן להשבית את המשתמש שלך.");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, _count: { select: { directReports: { where: { isActive: true } } } } },
  });
  if (!user) throw notFound("העובד");
  if (!user.isActive) return { userId };
  if (user._count.directReports > 0) {
    throw validationError("לעובד זה יש כפיפים פעילים. יש לשייך אותם למנהל אחר לפני ההשבתה.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { isActive: false } });
    await recordAudit({ action: AuditAction.USER_DEACTIVATED, entityType: "User", entityId: userId, actorId: admin.id }, tx);
  });
  return { userId };
}
