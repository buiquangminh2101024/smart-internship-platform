-- Tự động mời ứng viên theo tin (0.2, AD-23). Chỉ thêm mới, mọi cột đều có
-- mặc định hoặc cho phép null, không mất dữ liệu. Lời mời cũ nhận source = MANUAL,
-- tin cũ nhận autoOutreachEnabled = false (không tự gửi gì cho tới khi nhà tuyển
-- dụng tự bật).
-- docs/06-backend/auto-outreach/PLAN.md (Bước 0)

-- CreateEnum
CREATE TYPE "OutreachInvitationSource" AS ENUM ('MANUAL', 'AUTO');

-- CreateEnum
CREATE TYPE "AutoOutreachExhaustedReason" AS ENUM ('NO_MATCH', 'CANDIDATE_CAP');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'AUTO_OUTREACH_SENT';

-- AlterTable: phần trăm hạn mức/ngày dành cho tự động mời (AD-23 mục 5)
ALTER TABLE "companies" ADD COLUMN     "outreachAutoSharePercent" INTEGER NOT NULL DEFAULT 80;

-- AlterTable: hệ số mời H của gói (null = dùng mặc định trong code)
ALTER TABLE "subscription_plans" ADD COLUMN     "outreachPoolMultiplier" INTEGER;

-- AlterTable: cài đặt tự động mời theo tin
ALTER TABLE "job_posts" ADD COLUMN     "autoOutreachEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoOutreachExhaustedAt" TIMESTAMP(3),
ADD COLUMN     "autoOutreachExhaustedReason" "AutoOutreachExhaustedReason",
ADD COLUMN     "autoOutreachMinScore" INTEGER NOT NULL DEFAULT 80,
ADD COLUMN     "hiringTarget" INTEGER NOT NULL DEFAULT 1;

-- AlterTable: nguồn gửi lời mời
ALTER TABLE "candidate_outreach_invitations" ADD COLUMN     "source" "OutreachInvitationSource" NOT NULL DEFAULT 'MANUAL';

-- CreateIndex: đếm số lời mời ứng viên nhận trong ngày (trần 10 lời mời/ngày)
CREATE INDEX "candidate_outreach_invitations_candidateId_createdAt_idx" ON "candidate_outreach_invitations"("candidateId", "createdAt");

-- Dữ liệu: hạn mức/ngày và hệ số mời của ba gói (AD-23 mục 4).
-- hạn mức/ngày = max(S × C × H / T, C × H), C = 2, T = 14.
-- Phải cập nhật ở đây vì scripts/seed.ts upsert với update: {} nên không ghi đè
-- gói đã có. Gói không tồn tại (tên khác) thì câu UPDATE không làm gì.
UPDATE "subscription_plans" SET "outreachInvitationDailyQuota" = 8,  "outreachPoolMultiplier" = 4 WHERE "name" = 'Cơ bản';
UPDATE "subscription_plans" SET "outreachInvitationDailyQuota" = 14, "outreachPoolMultiplier" = 5 WHERE "name" = 'Tiêu chuẩn';
UPDATE "subscription_plans" SET "outreachInvitationDailyQuota" = 86, "outreachPoolMultiplier" = 6 WHERE "name" = 'Doanh nghiệp';
