-- CreateEnum
CREATE TYPE "SkillStatus" AS ENUM ('APPROVED', 'PENDING');

-- CreateEnum
CREATE TYPE "SkillAliasSource" AS ENUM ('SEED', 'ADMIN_MERGE', 'LLM_MERGE');

-- AlterTable
ALTER TABLE "skills" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "embedding" vector(384),
ADD COLUMN     "pendingMatchSkillId" TEXT,
ADD COLUMN     "status" "SkillStatus" NOT NULL DEFAULT 'APPROVED';

-- CreateTable
CREATE TABLE "skill_aliases" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "source" "SkillAliasSource" NOT NULL DEFAULT 'ADMIN_MERGE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "skill_aliases_alias_key" ON "skill_aliases"("alias");

-- CreateIndex
CREATE INDEX "skills_status_idx" ON "skills"("status");

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_pendingMatchSkillId_fkey" FOREIGN KEY ("pendingMatchSkillId") REFERENCES "skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_aliases" ADD CONSTRAINT "skill_aliases_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
