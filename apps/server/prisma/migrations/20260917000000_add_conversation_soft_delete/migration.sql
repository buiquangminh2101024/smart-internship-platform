-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "candidateDeletedAt" TIMESTAMP(3),
ADD COLUMN     "employerDeletedAt" TIMESTAMP(3);
