-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- DropForeignKey
ALTER TABLE "conversation_participants" DROP CONSTRAINT "conversation_participants_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "conversation_participants" DROP CONSTRAINT "conversation_participants_userId_fkey";

-- DropForeignKey
ALTER TABLE "students" DROP CONSTRAINT "students_majorId_fkey";

-- DropForeignKey
ALTER TABLE "students" DROP CONSTRAINT "students_universityId_fkey";

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "coverLetter" TEXT;

-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "cities" ADD COLUMN     "zipcode" TEXT;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "foundedYear" INTEGER,
ADD COLUMN     "taxCode" TEXT;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "employerId" TEXT NOT NULL,
ADD COLUMN     "employerLastReadAt" TIMESTAMP(3),
ADD COLUMN     "studentId" TEXT NOT NULL,
ADD COLUMN     "studentLastReadAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "educations" DROP COLUMN "major",
DROP COLUMN "school",
ADD COLUMN     "isCurrent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "majorId" TEXT,
ADD COLUMN     "universityId" TEXT;

-- AlterTable
ALTER TABLE "job_posts" ADD COLUMN     "address" TEXT,
ADD COLUMN     "benefits" TEXT,
ADD COLUMN     "isNegotiable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requirements" TEXT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "isWorkingOn" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "students" DROP COLUMN "graduationYear",
DROP COLUMN "majorId",
DROP COLUMN "universityId",
ADD COLUMN     "gender" "Gender";

-- AlterTable
ALTER TABLE "universities" ADD COLUMN     "code" TEXT;

-- DropTable
DROP TABLE "conversation_participants";

-- CreateTable
CREATE TABLE "job_post_skills" (
    "jobPostId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "job_post_skills_pkey" PRIMARY KEY ("jobPostId","skillId")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_taxCode_key" ON "companies"("taxCode");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_studentId_employerId_jobPostId_key" ON "conversations"("studentId", "employerId", "jobPostId");

-- CreateIndex
CREATE UNIQUE INDEX "universities_code_key" ON "universities"("code");

-- AddForeignKey
ALTER TABLE "educations" ADD CONSTRAINT "educations_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educations" ADD CONSTRAINT "educations_majorId_fkey" FOREIGN KEY ("majorId") REFERENCES "majors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post_skills" ADD CONSTRAINT "job_post_skills_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post_skills" ADD CONSTRAINT "job_post_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

