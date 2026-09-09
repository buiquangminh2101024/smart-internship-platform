-- CreateEnum
CREATE TYPE "CompanyVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CompanyVerificationMethod" AS ENUM ('AUTO_TAX_MATCH', 'MANUAL_REVIEW');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "businessLicenseUrl" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "verificationMethod" "CompanyVerificationMethod",
ADD COLUMN     "verificationNote" TEXT,
ADD COLUMN     "verificationStatus" "CompanyVerificationStatus" NOT NULL DEFAULT 'PENDING';
