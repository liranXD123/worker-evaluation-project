-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "CycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('NOT_STARTED', 'EMPLOYEE_IN_PROGRESS', 'EMPLOYEE_COMPLETED', 'MANAGER_IN_PROGRESS', 'MANAGER_COMPLETED', 'WAITING_FOR_FEEDBACK_MEETING', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('NOT_STARTED', 'DRAFT', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "Respondent" AS ENUM ('EMPLOYEE', 'MANAGER');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('RATING', 'OPEN_TEXT');

-- CreateEnum
CREATE TYPE "QuestionAudience" AS ENUM ('EMPLOYEE', 'MANAGER', 'BOTH');

-- CreateEnum
CREATE TYPE "FeedbackMeetingStatus" AS ENUM ('SCHEDULED', 'DRAFT', 'APPROVED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'ACHIEVED', 'PARTIALLY_ACHIEVED', 'NOT_ACHIEVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CYCLE_OPENED', 'EMPLOYEE_REMINDER_1', 'EMPLOYEE_REMINDER_2', 'EMPLOYEE_SUBMITTED', 'MANAGER_REMINDER_1', 'MANAGER_REMINDER_2', 'ASSESSMENTS_COMPLETED', 'FEEDBACK_MEETING_REMINDER', 'FEEDBACK_APPROVED', 'CYCLE_CLOSED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGOUT', 'USER_CREATED', 'USER_UPDATED', 'USER_DEACTIVATED', 'ROLE_CHANGED', 'MANAGER_ASSIGNED', 'EMPLOYEES_IMPORTED', 'QUESTIONNAIRE_CREATED', 'QUESTIONNAIRE_UPDATED', 'CYCLE_CREATED', 'CYCLE_OPENED', 'CYCLE_CLOSED', 'SELF_ASSESSMENT_SAVED', 'SELF_ASSESSMENT_SUBMITTED', 'MANAGER_ASSESSMENT_SAVED', 'MANAGER_ASSESSMENT_SUBMITTED', 'COMPARISON_VIEWED', 'FEEDBACK_MEETING_SCHEDULED', 'FEEDBACK_SAVED', 'FEEDBACK_APPROVED', 'FEEDBACK_ACKNOWLEDGED', 'GOAL_CREATED', 'GOAL_UPDATED', 'GOAL_DELETED', 'EVALUATION_COMPLETED', 'REMINDERS_TRIGGERED', 'REPORT_VIEWED', 'REPORT_EXPORTED', 'ACCESS_DENIED');

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "hireDate" DATE NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "entraObjectId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "departmentId" TEXT NOT NULL,
    "managerId" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaire_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "description" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questionnaire_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "templateId" TEXT NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "helpText" TEXT,
    "type" "QuestionType" NOT NULL,
    "audience" "QuestionAudience" NOT NULL DEFAULT 'BOTH',
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,
    "templateId" TEXT NOT NULL,
    "categoryId" TEXT,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_cycles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "CycleStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" DATE NOT NULL,
    "selfAssessmentDueDate" DATE NOT NULL,
    "managerAssessmentDueDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "closedById" TEXT,

    CONSTRAINT "review_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" TEXT NOT NULL,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "cycleId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "employeeStatus" "AssessmentStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "employeeStartedAt" TIMESTAMP(3),
    "employeeSubmittedAt" TIMESTAMP(3),
    "employeeWeightedScore" DECIMAL(4,2),
    "managerStatus" "AssessmentStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "managerStartedAt" TIMESTAMP(3),
    "managerSubmittedAt" TIMESTAMP(3),
    "managerWeightedScore" DECIMAL(4,2),
    "comparisonUnlockedAt" TIMESTAMP(3),
    "isHighPotential" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" TEXT NOT NULL,
    "respondent" "Respondent" NOT NULL,
    "score" SMALLINT,
    "textAnswer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_meetings" (
    "id" TEXT NOT NULL,
    "status" "FeedbackMeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3),
    "location" TEXT,
    "heldAt" TIMESTAMP(3),
    "achievements" TEXT,
    "strengths" TEXT,
    "improvementAreas" TEXT,
    "developmentOpportunities" TEXT,
    "summary" TEXT,
    "managerComments" TEXT,
    "employeeComments" TEXT,
    "approvedAt" TIMESTAMP(3),
    "employeeAcknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "feedback_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kpi" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipientId" TEXT NOT NULL,
    "cycleId" TEXT,
    "evaluationId" TEXT,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeNumber_key" ON "users"("employeeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_entraObjectId_key" ON "users"("entraObjectId");

-- CreateIndex
CREATE INDEX "users_managerId_idx" ON "users"("managerId");

-- CreateIndex
CREATE INDEX "users_departmentId_idx" ON "users"("departmentId");

-- CreateIndex
CREATE INDEX "users_role_isActive_idx" ON "users"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "questionnaire_templates_name_version_key" ON "questionnaire_templates"("name", "version");

-- CreateIndex
CREATE INDEX "categories_templateId_order_idx" ON "categories"("templateId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "categories_templateId_key_key" ON "categories"("templateId", "key");

-- CreateIndex
CREATE INDEX "questions_templateId_order_idx" ON "questions"("templateId", "order");

-- CreateIndex
CREATE INDEX "questions_categoryId_idx" ON "questions"("categoryId");

-- CreateIndex
CREATE INDEX "review_cycles_status_idx" ON "review_cycles"("status");

-- CreateIndex
CREATE UNIQUE INDEX "review_cycles_name_year_key" ON "review_cycles"("name", "year");

-- CreateIndex
CREATE INDEX "evaluations_managerId_cycleId_idx" ON "evaluations"("managerId", "cycleId");

-- CreateIndex
CREATE INDEX "evaluations_cycleId_status_idx" ON "evaluations"("cycleId", "status");

-- CreateIndex
CREATE INDEX "evaluations_employeeId_idx" ON "evaluations"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_cycleId_employeeId_key" ON "evaluations"("cycleId", "employeeId");

-- CreateIndex
CREATE INDEX "answers_evaluationId_respondent_idx" ON "answers"("evaluationId", "respondent");

-- CreateIndex
CREATE UNIQUE INDEX "answers_evaluationId_questionId_respondent_key" ON "answers"("evaluationId", "questionId", "respondent");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_meetings_evaluationId_key" ON "feedback_meetings"("evaluationId");

-- CreateIndex
CREATE INDEX "feedback_meetings_status_idx" ON "feedback_meetings"("status");

-- CreateIndex
CREATE INDEX "goals_employeeId_cycleId_idx" ON "goals"("employeeId", "cycleId");

-- CreateIndex
CREATE INDEX "goals_evaluationId_idx" ON "goals"("evaluationId");

-- CreateIndex
CREATE INDEX "goals_status_dueDate_idx" ON "goals"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");

-- CreateIndex
CREATE INDEX "notifications_status_scheduledAt_idx" ON "notifications"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "notifications_recipientId_idx" ON "notifications"("recipientId");

-- CreateIndex
CREATE INDEX "notifications_evaluationId_type_idx" ON "notifications"("evaluationId", "type");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "questionnaire_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "questionnaire_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "questionnaire_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "review_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_meetings" ADD CONSTRAINT "feedback_meetings_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_meetings" ADD CONSTRAINT "feedback_meetings_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "review_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "review_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
