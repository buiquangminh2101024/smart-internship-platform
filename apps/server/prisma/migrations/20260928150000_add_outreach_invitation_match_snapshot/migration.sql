-- Tách "Gợi ý"/"Đã mời" + lưu điểm lúc gửi lời mời (B3, AD-15 mục 8 — D6/D7).
-- Additive hoàn toàn: 2 cột nullable không default + 1 index. Bảng
-- candidate_outreach_invitations vừa tạo ở migration trước, chưa có dữ liệu
-- cần backfill. docs/06-backend/candidate-outreach/PLAN.md

-- AlterTable
ALTER TABLE "candidate_outreach_invitations" ADD COLUMN "matchScore" INTEGER,
ADD COLUMN "matchWeightsVersion" TEXT;

-- CreateIndex
CREATE INDEX "candidate_outreach_invitations_jobPostId_createdAt_idx" ON "candidate_outreach_invitations"("jobPostId", "createdAt");
