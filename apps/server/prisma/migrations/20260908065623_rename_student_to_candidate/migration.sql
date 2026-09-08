-- Đổi tên model Student -> Candidate. Dùng RENAME (không DROP/CREATE) để giữ
-- nguyên dữ liệu hiện có trong Neon — tên bảng/cột/constraint/index đích lấy
-- đúng theo `prisma migrate diff` sinh ra từ schema mới, để lần `migrate dev`
-- kế tiếp không phát hiện drift.

-- Rename tables
ALTER TABLE "students" RENAME TO "candidates";
ALTER TABLE "student_skills" RENAME TO "candidate_skills";

-- Rename columns
ALTER TABLE "educations" RENAME COLUMN "studentId" TO "candidateId";
ALTER TABLE "work_experiences" RENAME COLUMN "studentId" TO "candidateId";
ALTER TABLE "projects" RENAME COLUMN "studentId" TO "candidateId";
ALTER TABLE "certificates" RENAME COLUMN "studentId" TO "candidateId";
ALTER TABLE "awards" RENAME COLUMN "studentId" TO "candidateId";
ALTER TABLE "candidate_skills" RENAME COLUMN "studentId" TO "candidateId";
ALTER TABLE "cvs" RENAME COLUMN "studentId" TO "candidateId";
ALTER TABLE "saved_jobs" RENAME COLUMN "studentId" TO "candidateId";
ALTER TABLE "applications" RENAME COLUMN "studentId" TO "candidateId";
ALTER TABLE "conversations" RENAME COLUMN "studentId" TO "candidateId";
ALTER TABLE "conversations" RENAME COLUMN "studentLastReadAt" TO "candidateLastReadAt";

-- Rename primary key / foreign key constraints
ALTER TABLE "candidates" RENAME CONSTRAINT "students_pkey" TO "candidates_pkey";
ALTER TABLE "candidates" RENAME CONSTRAINT "students_cityId_fkey" TO "candidates_cityId_fkey";
ALTER TABLE "candidates" RENAME CONSTRAINT "students_userId_fkey" TO "candidates_userId_fkey";

ALTER TABLE "candidate_skills" RENAME CONSTRAINT "student_skills_pkey" TO "candidate_skills_pkey";
ALTER TABLE "candidate_skills" RENAME CONSTRAINT "student_skills_skillId_fkey" TO "candidate_skills_skillId_fkey";
ALTER TABLE "candidate_skills" RENAME CONSTRAINT "student_skills_studentId_fkey" TO "candidate_skills_candidateId_fkey";

ALTER TABLE "educations" RENAME CONSTRAINT "educations_studentId_fkey" TO "educations_candidateId_fkey";
ALTER TABLE "work_experiences" RENAME CONSTRAINT "work_experiences_studentId_fkey" TO "work_experiences_candidateId_fkey";
ALTER TABLE "projects" RENAME CONSTRAINT "projects_studentId_fkey" TO "projects_candidateId_fkey";
ALTER TABLE "certificates" RENAME CONSTRAINT "certificates_studentId_fkey" TO "certificates_candidateId_fkey";
ALTER TABLE "awards" RENAME CONSTRAINT "awards_studentId_fkey" TO "awards_candidateId_fkey";
ALTER TABLE "cvs" RENAME CONSTRAINT "cvs_studentId_fkey" TO "cvs_candidateId_fkey";
ALTER TABLE "saved_jobs" RENAME CONSTRAINT "saved_jobs_studentId_fkey" TO "saved_jobs_candidateId_fkey";
ALTER TABLE "applications" RENAME CONSTRAINT "applications_studentId_fkey" TO "applications_candidateId_fkey";
ALTER TABLE "conversations" RENAME CONSTRAINT "conversations_studentId_fkey" TO "conversations_candidateId_fkey";

-- Rename unique indexes
ALTER INDEX "students_userId_key" RENAME TO "candidates_userId_key";
ALTER INDEX "applications_jobPostId_studentId_key" RENAME TO "applications_jobPostId_candidateId_key";
ALTER INDEX "conversations_studentId_employerId_jobPostId_key" RENAME TO "conversations_candidateId_employerId_jobPostId_key";
ALTER INDEX "saved_jobs_studentId_jobPostId_key" RENAME TO "saved_jobs_candidateId_jobPostId_key";
