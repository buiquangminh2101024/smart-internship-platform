-- Ứng viên thấy nhiều việc phù hợp, xếp theo ưu tiên (0.5, AD-26). Chỉ thêm mới:
-- 2 giá trị enum, 3 cột có mặc định, 1 bảng rỗng, 1 index. Không ghi dữ liệu.
-- `ALTER TYPE … ADD VALUE` không dùng được giá trị mới trong cùng transaction,
-- nên migration này không có câu nào dùng 'JOB_ALERT' hay 'PROFILE_SKILLS_REMINDER'.
-- Ứng viên cũ nhận jobAlertEnabled = true, jobAlertEmailEnabled = true,
-- jobAlertSameCityOnly = false (Q4: bật sẵn, tắt được).
-- Index (candidateId, score DESC): bước 0 đo lần lạnh 230 ms khi quét khoá chính
-- theo cột thứ hai (~132k dòng).
-- docs/06-backend/job-discovery/PLAN.md (Bước 1)

-- AlterEnum: thông báo job alert (gộp theo ngày) và nhắc một lần thêm kỹ năng
ALTER TYPE "NotificationType" ADD VALUE 'JOB_ALERT';
ALTER TYPE "NotificationType" ADD VALUE 'PROFILE_SKILLS_REMINDER';

-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "jobAlertEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "jobAlertEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "jobAlertSameCityOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "job_alerts" (
    "candidateId" TEXT NOT NULL,
    "jobPostId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailedAt" TIMESTAMP(3),

    CONSTRAINT "job_alerts_pkey" PRIMARY KEY ("candidateId","jobPostId")
);

-- CreateIndex
CREATE INDEX "job_alerts_emailedAt_createdAt_idx" ON "job_alerts"("emailedAt", "createdAt");

-- CreateIndex
CREATE INDEX "job_candidate_match_scores_candidateId_score_idx" ON "job_candidate_match_scores"("candidateId", "score" DESC);

-- AddForeignKey
ALTER TABLE "job_alerts" ADD CONSTRAINT "job_alerts_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_alerts" ADD CONSTRAINT "job_alerts_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

