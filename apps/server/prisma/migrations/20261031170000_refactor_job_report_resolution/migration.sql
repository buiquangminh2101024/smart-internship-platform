-- CreateEnum
CREATE TYPE "ReportResolution" AS ENUM ('TAKE_DOWN', 'DISMISS');

-- AlterTable: Add resolution, resolvedAt, resolvedById to job_reports
ALTER TABLE "job_reports" ADD COLUMN "resolution" "ReportResolution";
ALTER TABLE "job_reports" ADD COLUMN "resolvedAt" TIMESTAMP(3);
ALTER TABLE "job_reports" ADD COLUMN "resolvedById" TEXT;

-- Drop evidenceUrls column if exists
ALTER TABLE "job_reports" DROP COLUMN IF EXISTS "evidenceUrls";

-- Migrate any existing rows:
-- If status was RESOLVED, set resolution = TAKE_DOWN
UPDATE "job_reports" SET "resolution" = 'TAKE_DOWN', "resolvedAt" = "updatedAt" WHERE "status" = 'RESOLVED';
-- If status was REJECTED, set resolution = DISMISS
UPDATE "job_reports" SET "resolution" = 'DISMISS', "resolvedAt" = "updatedAt" WHERE "status" = 'REJECTED';

-- Alter ReportStatus enum to remove REJECTED
ALTER TABLE "job_reports" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "job_reports" ALTER COLUMN "status" TYPE TEXT USING ("status"::TEXT);
UPDATE "job_reports" SET "status" = 'RESOLVED' WHERE "status" != 'PENDING';
DROP TYPE "ReportStatus";
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'RESOLVED');
ALTER TABLE "job_reports" ALTER COLUMN "status" TYPE "ReportStatus" USING ("status"::"ReportStatus");
ALTER TABLE "job_reports" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "job_reports_resolution_idx" ON "job_reports"("resolution");

-- AddForeignKey
ALTER TABLE "job_reports" ADD CONSTRAINT "job_reports_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
