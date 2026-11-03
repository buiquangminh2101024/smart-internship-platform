-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SCAM', 'CHARGING_FEE', 'INAPPROPRIATE', 'MISLEADING', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'RESOLVED', 'REJECTED');

-- CreateTable
CREATE TABLE "job_reports" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "description" TEXT,
    "evidenceUrls" TEXT[],
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_reports_jobId_idx" ON "job_reports"("jobId");

-- CreateIndex
CREATE INDEX "job_reports_status_idx" ON "job_reports"("status");

-- CreateIndex
CREATE INDEX "job_reports_reporterId_idx" ON "job_reports"("reporterId");

-- AddForeignKey
ALTER TABLE "job_reports" ADD CONSTRAINT "job_reports_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_reports" ADD CONSTRAINT "job_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
