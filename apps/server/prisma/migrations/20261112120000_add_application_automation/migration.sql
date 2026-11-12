-- Tự xử lý hồ sơ chờ lâu (0.4, AD-25). Chỉ thêm mới, mọi cột đều có mặc định,
-- không mất dữ liệu, không ghi dữ liệu.
-- `ALTER TYPE … ADD VALUE` không dùng được giá trị mới trong cùng transaction,
-- nên migration này không có câu nào dùng 'JOB_CLOSED' hay
-- 'APPLICATIONS_NEED_ATTENTION'.
-- Tin cũ nhận autoReviewEnabled = true (Q1), rejectSuggestBelowScore = 50,
-- autoCloseInterviewedEnabled = false. Lúc viết (2026-11-12) mọi tin trên Neon có
-- autoOutreachMinScore = 80 nên không tin nào vi phạm Y < X; service vẫn kẹp
-- Y = X − 1 lúc đọc.
-- docs/06-backend/application-automation/PLAN.md (Bước 1)

-- AlterEnum: trạng thái cuối "Tin đã đóng", chỉ hệ thống chuyển
ALTER TYPE "ApplicationStatus" ADD VALUE 'JOB_CLOSED';

-- AlterEnum: nhắc hằng tuần về hồ sơ tồn cho employer
ALTER TYPE "NotificationType" ADD VALUE 'APPLICATIONS_NEED_ATTENTION';

-- AlterTable: cài đặt tự xử lý hồ sơ theo tin
ALTER TABLE "job_posts" ADD COLUMN     "autoCloseInterviewedEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoReviewEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rejectSuggestBelowScore" INTEGER NOT NULL DEFAULT 50;
