-- Bảng điểm lưu sẵn theo cặp tin–ứng viên (0.3, AD-24). Chỉ thêm mới: 1 bảng
-- rỗng và 1 cột cho phép null, không đụng dữ liệu hiện có. Bảng là dữ liệu dẫn
-- xuất, được nạp bằng `npm run rescore-match-scores` sau khi áp migration.
-- docs/06-backend/hiring-progress/PLAN.md (Bước 1)

-- AlterTable: lần chấm bảng điểm gần nhất của tin (null = chưa chấm)
ALTER TABLE "job_posts" ADD COLUMN     "matchScoresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "job_candidate_match_scores" (
    "jobPostId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "semanticPending" BOOLEAN NOT NULL DEFAULT false,
    "weightsVersion" TEXT NOT NULL,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_candidate_match_scores_pkey" PRIMARY KEY ("jobPostId","candidateId")
);

-- CreateIndex
CREATE INDEX "job_candidate_match_scores_jobPostId_score_idx" ON "job_candidate_match_scores"("jobPostId", "score");

-- AddForeignKey
ALTER TABLE "job_candidate_match_scores" ADD CONSTRAINT "job_candidate_match_scores_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_candidate_match_scores" ADD CONSTRAINT "job_candidate_match_scores_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

