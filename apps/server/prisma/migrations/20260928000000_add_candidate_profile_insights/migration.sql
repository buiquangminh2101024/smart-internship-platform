-- Trợ lý hồ sơ Candidate — phần "Phân tích hồ sơ" (AD-14, docs/06-backend/candidate-insights/PLAN.md).
-- Chỉ lưu đầu ra LLM; "Việc làm phù hợp" (B2) tách độc lập, không LLM, không persistent.

-- CreateTable
CREATE TABLE "candidate_profile_insights" (
    "candidateId" TEXT NOT NULL,
    "completenessScore" INTEGER NOT NULL,
    "strengths" JSONB NOT NULL,
    "suggestions" JSONB NOT NULL,
    "topJobPostIds" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_profile_insights_pkey" PRIMARY KEY ("candidateId")
);

-- AddForeignKey
ALTER TABLE "candidate_profile_insights" ADD CONSTRAINT "candidate_profile_insights_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
