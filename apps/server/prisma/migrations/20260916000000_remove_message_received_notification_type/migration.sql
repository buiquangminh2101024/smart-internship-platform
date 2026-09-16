/*
  Warnings:

  - The values [MESSAGE_RECEIVED] on the enum `NotificationType` will be removed. If these variants are still used in the database, this will fail.

  An toàn: MESSAGE_RECEIVED chưa từng có call site (Phase 10) nên không có
  notification nào mang type này — xem docs/06-backend/phase-09-realtime-communication/PLAN.md mục 2.1.
*/
-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('APPLICATION_STATUS_CHANGED', 'JOB_POST_APPROVED', 'JOB_POST_REJECTED', 'JOB_POST_TAKEN_DOWN', 'COMPANY_VERIFIED', 'COMPANY_REJECTED');
ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "NotificationType_old";
COMMIT;
