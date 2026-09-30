-- AD-16 — Dashboard Employer & Admin, migration M2 (Interview) + D13.
-- Sinh bằng `prisma migrate diff --from-migrations … --to-schema-datamodel …` trên shadow DB tạm,
-- thêm backfill ở cuối. Các giá trị NotificationType mới KHÔNG được dùng trong file này
-- (PostgreSQL không cho dùng giá trị enum vừa ADD VALUE trong cùng transaction).

-- CreateEnum
CREATE TYPE "InterviewMode" AS ENUM ('ONLINE', 'ONSITE');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'INTERVIEW_SCHEDULED';
ALTER TYPE "NotificationType" ADD VALUE 'INTERVIEW_RESCHEDULED';
ALTER TYPE "NotificationType" ADD VALUE 'INTERVIEW_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE 'INTERVIEW_REMINDER';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "verificationSubmittedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "interviews" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 45,
    "mode" "InterviewMode" NOT NULL,
    "location" TEXT,
    "note" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "cancelReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interviews_applicationId_idx" ON "interviews"("applicationId");

-- CreateIndex
CREATE INDEX "interviews_status_scheduledAt_idx" ON "interviews"("status", "scheduledAt");

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (D13): chỉ công ty đang chờ xác minh cần mốc chờ. Lấy lần gửi hồ sơ gần nhất
-- trong nhật ký (ghi từ M1), không có thì dùng updatedAt như cách tính trước đây.
UPDATE "companies" c
SET "verificationSubmittedAt" = COALESCE(
  (SELECT MAX(l."createdAt") FROM "audit_logs" l
   WHERE l."entityType" = 'Company' AND l."entityId" = c."id" AND l."action" = 'COMPANY_SUBMITTED'),
  c."updatedAt")
WHERE c."verificationStatus" = 'PENDING' AND c."verificationSubmittedAt" IS NULL;
