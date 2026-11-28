-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'JOB_REPORT_RESOLVED';

-- AlterTable
ALTER TABLE "job_reports" ADD COLUMN "evidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
