-- Chấm lại theo ứng viên gần thời gian thực (0.6, AD-27). Chỉ thêm mới: 2 cột
-- cho phép null và 1 index, không đụng dữ liệu hiện có, không ghi dữ liệu.
-- Ứng viên cũ nhận dấu null (không chờ chấm): bảng điểm hiện có đã đúng với hồ
-- sơ hiện tại nhờ lượt đêm.
-- Index thường thay cho index một phần `WHERE … IS NOT NULL` trong plan: Prisma
-- 6.19 không khai báo được index một phần trong schema, nếu tạo bằng SQL thì
-- `migrate diff` các phase sau sẽ đòi xoá. Câu lấy người có dấu
-- (`IS NOT NULL ORDER BY … LIMIT`) vẫn dùng được index này.
-- Bước 0 mục 2: không cần index `job_post_skills("skillId")`.
-- docs/06-backend/live-rescore/PLAN.md (Bước 1)

-- AlterTable: dấu cần chấm lại (D1) và lần cuối hồ sơ đổi (Q2)
ALTER TABLE "candidates" ADD COLUMN     "matchProfileChangedAt" TIMESTAMP(3),
ADD COLUMN     "matchRescoreRequestedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "candidates_matchRescoreRequestedAt_idx" ON "candidates"("matchRescoreRequestedAt");
