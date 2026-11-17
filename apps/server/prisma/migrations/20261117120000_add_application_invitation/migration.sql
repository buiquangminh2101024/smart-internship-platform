-- Nhận lời mời = ứng tuyển vào tin (0.7, AD-28). Chỉ thêm mới: 1 cột cho phép
-- null, 1 unique index, 1 khoá ngoại; không đụng dữ liệu hiện có, không backfill
-- (lời mời đã ACCEPTED trước thay đổi này không có đơn — ứng viên tự bấm
-- "Ứng tuyển ngay").
-- docs/06-backend/invitation-apply/PLAN.md (Bước 1)

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "invitationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "applications_invitationId_key" ON "applications"("invitationId");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "candidate_outreach_invitations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
