-- CreateEnum
CREATE TYPE "MajorRelevance" AS ENUM ('PRIMARY', 'RELATED');

-- AlterTable
ALTER TABLE "job_post_skills" ADD COLUMN     "minYears" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "job_posts" ADD COLUMN     "requirementsConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "requirementsExtra" JSONB;

-- CreateTable
CREATE TABLE "job_post_majors" (
    "jobPostId" TEXT NOT NULL,
    "majorId" TEXT NOT NULL,
    "relevance" "MajorRelevance" NOT NULL DEFAULT 'PRIMARY',

    CONSTRAINT "job_post_majors_pkey" PRIMARY KEY ("jobPostId","majorId")
);

-- AddForeignKey
ALTER TABLE "job_post_majors" ADD CONSTRAINT "job_post_majors_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post_majors" ADD CONSTRAINT "job_post_majors_majorId_fkey" FOREIGN KEY ("majorId") REFERENCES "majors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
