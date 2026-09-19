-- CreateEnum
CREATE TYPE "CvExtractionStatus" AS ENUM ('NOT_STARTED', 'PROCESSING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "cvs" ADD COLUMN     "extractedAt" TIMESTAMP(3),
ADD COLUMN     "extractedData" JSONB,
ADD COLUMN     "extractionStatus" "CvExtractionStatus" NOT NULL DEFAULT 'NOT_STARTED';
