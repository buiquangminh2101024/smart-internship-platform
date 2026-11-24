-- Chấm điểm chất lượng tin và duyệt / từ chối hàng loạt (AD-29). Chỉ thêm mới:
-- 1 enum, 1 giá trị enum thông báo, 7 cột cho phép null ở job_posts, 3 cột ở
-- job_post_moderation_actions (bulk mặc định false), 2 index. Không xoá / đổi
-- cột nào. Backfill duy nhất: submittedAt lấy từ dòng SUBMITTED mới nhất của
-- mỗi tin. Điểm (quality*) để null — chấm bằng script ở bước 3 / khi gửi duyệt.
-- docs/06-backend/job-quality-moderation/PLAN.md (Bước 1)

-- CreateEnum
CREATE TYPE "JobQualityBand" AS ENUM ('SUGGEST_APPROVE', 'NEEDS_REVIEW', 'SUGGEST_REJECT');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'JOB_POST_QUALITY_DROPPED';

-- AlterTable
ALTER TABLE "job_posts" ADD COLUMN     "qualityBand" "JobQualityBand",
ADD COLUMN     "qualityBreakdown" JSONB,
ADD COLUMN     "qualityScore" INTEGER,
ADD COLUMN     "qualityScoredAt" TIMESTAMP(3),
ADD COLUMN     "qualityVersion" INTEGER,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedContentHash" TEXT;

-- AlterTable
ALTER TABLE "job_post_moderation_actions" ADD COLUMN     "bulk" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "qualityBand" "JobQualityBand",
ADD COLUMN     "qualityScore" INTEGER;

-- CreateIndex
CREATE INDEX "job_posts_status_qualityScore_idx" ON "job_posts"("status", "qualityScore");

-- CreateIndex
CREATE INDEX "job_posts_status_submittedAt_idx" ON "job_posts"("status", "submittedAt");

-- Backfill: lúc gửi duyệt gần nhất của mỗi tin đã từng gửi duyệt.
UPDATE "job_posts" AS jp
SET "submittedAt" = s."lastSubmittedAt"
FROM (
  SELECT "jobPostId", MAX("createdAt") AS "lastSubmittedAt"
  FROM "job_post_moderation_actions"
  WHERE "action" = 'SUBMITTED'
  GROUP BY "jobPostId"
) AS s
WHERE jp."id" = s."jobPostId";
