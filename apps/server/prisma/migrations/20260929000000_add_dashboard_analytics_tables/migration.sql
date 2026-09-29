-- AD-16 — Dashboard Employer & Admin, migration M1.
-- Sinh bằng `prisma migrate diff` (datamodel trước → sau), thêm backfill ở cuối.
-- Các giá trị NotificationType mới KHÔNG được dùng trong file này (PostgreSQL không cho dùng
-- giá trị enum vừa ADD VALUE trong cùng transaction).

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'APPLICATION_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'JOB_POST_EXPIRING';
ALTER TYPE "NotificationType" ADD VALUE 'SUBSCRIPTION_EXPIRING';
ALTER TYPE "NotificationType" ADD VALUE 'CATALOG_ENTRY_SUGGESTED';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_COMPLETED';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "dedupeKey" TEXT;

-- CreateTable
CREATE TABLE "application_status_history" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fromStatus" "ApplicationStatus",
    "toStatus" "ApplicationStatus" NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_post_daily_stats" (
    "id" TEXT NOT NULL,
    "jobPostId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "job_post_daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" "Role",
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "application_status_history_applicationId_createdAt_idx" ON "application_status_history"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "application_status_history_toStatus_createdAt_idx" ON "application_status_history"("toStatus", "createdAt");

-- CreateIndex
CREATE INDEX "job_post_daily_stats_date_idx" ON "job_post_daily_stats"("date");

-- CreateIndex
CREATE UNIQUE INDEX "job_post_daily_stats_jobPostId_date_key" ON "job_post_daily_stats"("jobPostId", "date");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "job_posts_companyId_status_idx" ON "job_posts"("companyId", "status");

-- CreateIndex
CREATE INDEX "job_posts_status_createdAt_idx" ON "job_posts"("status", "createdAt");

-- CreateIndex
CREATE INDEX "applications_jobPostId_status_idx" ON "applications"("jobPostId", "status");

-- CreateIndex
CREATE INDEX "applications_status_createdAt_idx" ON "applications"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_type_isRead_idx" ON "notifications"("userId", "type", "isRead");

-- AddForeignKey
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post_daily_stats" ADD CONSTRAINT "job_post_daily_stats_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: mỗi hồ sơ hiện có chưa có lịch sử được một dòng khởi tạo
-- (fromStatus = NULL, toStatus = trạng thái hiện tại, createdAt = ngày nộp, actorId = NULL).
-- Dòng fromStatus IS NULL không được tính vào thời gian xử lý (xem AD-16 mục 6).
INSERT INTO "application_status_history" ("id", "applicationId", "fromStatus", "toStatus", "actorId", "createdAt")
SELECT gen_random_uuid()::text, a."id", NULL, a."status", NULL, a."createdAt"
FROM "applications" a
WHERE NOT EXISTS (
  SELECT 1 FROM "application_status_history" h WHERE h."applicationId" = a."id"
);
