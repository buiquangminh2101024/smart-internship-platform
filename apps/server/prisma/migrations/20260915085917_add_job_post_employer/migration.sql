/*
  Warnings:

  - Made the column `jobPostId` on table `conversations` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `employerId` to the `job_posts` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_jobPostId_fkey";

-- AlterTable
ALTER TABLE "conversations" ALTER COLUMN "jobPostId" SET NOT NULL;

-- AlterTable
ALTER TABLE "job_posts" ADD COLUMN     "employerId" TEXT;

UPDATE "job_posts" jp
SET "employerId" = (
    SELECT e.id 
    FROM "employers" e 
    WHERE e."companyId" = jp."companyId" 
    LIMIT 1
);

DELETE FROM "job_posts" WHERE "employerId" IS NULL;

ALTER TABLE "job_posts" ALTER COLUMN "employerId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "job_posts" ADD CONSTRAINT "job_posts_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "job_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
