-- CreateEnum
CREATE TYPE "SkillImportance" AS ENUM ('REQUIRED', 'PREFERRED');

-- AlterTable
ALTER TABLE "job_post_skills" ADD COLUMN     "importance" "SkillImportance" NOT NULL DEFAULT 'REQUIRED';

-- AlterTable
ALTER TABLE "job_posts" ADD COLUMN     "minExperienceYears" DOUBLE PRECISION;
