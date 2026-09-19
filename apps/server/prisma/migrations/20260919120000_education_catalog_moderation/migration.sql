-- docs/06-backend/cv-ai-extraction-phase2/PLAN.md — Quyết định #1 + Phần 1.
--
-- Viết tay thay vì để `prisma migrate dev` tự sinh: Prisma coi đổi tên enum là
-- DROP COLUMN + ADD COLUMN, tức mọi Skill PENDING sẽ bị reset về APPROVED (mất
-- trạng thái duyệt) và SkillAlias mất nguồn gốc. RENAME giữ nguyên dữ liệu.

-- RenameEnum
ALTER TYPE "SkillStatus" RENAME TO "CatalogEntryStatus";
ALTER TYPE "SkillAliasSource" RENAME TO "CatalogAliasSource";

-- AlterTable: dữ liệu seed sẵn (scripts/seed.ts, seed-education-catalog.ts) nhận
-- DEFAULT 'APPROVED' — đúng ý nghĩa "danh mục chính thức".
ALTER TABLE "majors" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "pendingMatchMajorId" TEXT,
ADD COLUMN     "status" "CatalogEntryStatus" NOT NULL DEFAULT 'APPROVED';

ALTER TABLE "universities" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "pendingMatchUniversityId" TEXT,
ADD COLUMN     "status" "CatalogEntryStatus" NOT NULL DEFAULT 'APPROVED';

-- CreateTable
CREATE TABLE "major_aliases" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "majorId" TEXT NOT NULL,
    "source" "CatalogAliasSource" NOT NULL DEFAULT 'ADMIN_MERGE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "major_aliases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "university_aliases" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "source" "CatalogAliasSource" NOT NULL DEFAULT 'ADMIN_MERGE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "university_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "major_aliases_alias_key" ON "major_aliases"("alias");
CREATE UNIQUE INDEX "university_aliases_alias_key" ON "university_aliases"("alias");
CREATE INDEX "majors_status_idx" ON "majors"("status");
CREATE INDEX "universities_status_idx" ON "universities"("status");

-- AddForeignKey
ALTER TABLE "majors" ADD CONSTRAINT "majors_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "majors" ADD CONSTRAINT "majors_pendingMatchMajorId_fkey" FOREIGN KEY ("pendingMatchMajorId") REFERENCES "majors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "major_aliases" ADD CONSTRAINT "major_aliases_majorId_fkey" FOREIGN KEY ("majorId") REFERENCES "majors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "universities" ADD CONSTRAINT "universities_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "universities" ADD CONSTRAINT "universities_pendingMatchUniversityId_fkey" FOREIGN KEY ("pendingMatchUniversityId") REFERENCES "universities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "university_aliases" ADD CONSTRAINT "university_aliases_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
