-- Tìm & mời ứng viên chưa ứng tuyển (B3, AD-15). Additive hoàn toàn — không
-- mất dữ liệu, không cần backfill (outreachInvitationDailyQuota = null cho
-- mọi gói hiện có, code tự áp ngưỡng mặc định).
-- docs/06-backend/candidate-outreach/PLAN.md

-- AlterEnum: 2 giá trị NotificationType mới
ALTER TYPE "NotificationType" ADD VALUE 'CANDIDATE_OUTREACH_INVITATION_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'CANDIDATE_OUTREACH_INVITATION_RESPONDED';

-- CreateEnum
CREATE TYPE "OutreachInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- AlterTable: cột opt-in ở Candidate
ALTER TABLE "candidates" ADD COLUMN "isOpenToOutreach" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: hạn mức lời mời/ngày theo gói (null = dùng mặc định trong code)
ALTER TABLE "subscription_plans" ADD COLUMN "outreachInvitationDailyQuota" INTEGER;

-- CreateTable
CREATE TABLE "candidate_outreach_invitations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "jobPostId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "status" "OutreachInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "candidate_outreach_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "candidate_outreach_invitations_candidateId_jobPostId_status_idx" ON "candidate_outreach_invitations"("candidateId", "jobPostId", "status");

-- CreateIndex
CREATE INDEX "candidate_outreach_invitations_companyId_createdAt_idx" ON "candidate_outreach_invitations"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "candidate_outreach_invitations" ADD CONSTRAINT "candidate_outreach_invitations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_outreach_invitations" ADD CONSTRAINT "candidate_outreach_invitations_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_outreach_invitations" ADD CONSTRAINT "candidate_outreach_invitations_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "job_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_outreach_invitations" ADD CONSTRAINT "candidate_outreach_invitations_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
