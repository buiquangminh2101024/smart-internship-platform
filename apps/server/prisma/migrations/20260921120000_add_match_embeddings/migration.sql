-- Job Matcher GĐ2: vector embedding của hồ sơ / tin (docs/06-backend/job-matcher-phase2/PLAN.md).
-- Extension `vector` đã bật từ migration 20260915000000_enable_pgvector_extension.
-- Không tạo index vector: mỗi lần chỉ so một cặp, không tìm láng giềng gần nhất.

-- CreateTable
CREATE TABLE "candidate_embeddings" (
    "candidateId" TEXT NOT NULL,
    "embedding" vector(384) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "embeddedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_embeddings_pkey" PRIMARY KEY ("candidateId")
);

-- CreateTable
CREATE TABLE "job_post_embeddings" (
    "jobPostId" TEXT NOT NULL,
    "embedding" vector(384) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "embeddedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_post_embeddings_pkey" PRIMARY KEY ("jobPostId")
);

-- AddForeignKey
ALTER TABLE "candidate_embeddings" ADD CONSTRAINT "candidate_embeddings_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post_embeddings" ADD CONSTRAINT "job_post_embeddings_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
