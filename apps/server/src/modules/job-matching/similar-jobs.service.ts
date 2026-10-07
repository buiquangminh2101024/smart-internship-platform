import type { SimilarJobItem } from "@sip/shared-types";
import type { JobMatchProfile } from "../../shared/ports/JobMatcher";
import type { JobMatchProfileLoader } from "./job-match-profile.loader";
import {
  SIMILAR_JOBS_LIMIT,
  SIMILAR_JOBS_MAX_SHARED_SKILLS,
  SIMILAR_JOBS_MIN_COSINE,
  SIMILAR_JOBS_POOL,
} from "./job-matching.config";
import type { JobMatcherMode } from "./job-matching.service";
import type { JobRecommendationRepository } from "./job-recommendation.repository";
import type { MatchEmbeddingRepository } from "./match-embedding.repository";
import type { MatchEmbeddingService } from "./match-embedding.service";

interface RankedJob {
  id: string;
  similarity: number | null;
}

/**
 * "Việc làm tương tự" ở trang chi tiết tin (docs/06-backend/similar-jobs/PLAN.md).
 * Nhánh chính: cosine giữa vector hai tin (S1, S3–S5, S7). Không có vector cho tin
 * đang xem (JOB_MATCHER_MODE=rule, model lỗi, văn bản rỗng) ⇒ nhánh dự phòng theo
 * kỹ năng trùng (S6). Nhánh vector chạy được mà không tin nào đạt ngưỡng thì vẫn
 * trả [] (S4) — không trộn hai nhánh. Mọi trường hợp rỗng đều là [], không 404.
 */
export class SimilarJobsService {
  private readonly jobMatchProfileLoader: JobMatchProfileLoader;
  private readonly matchEmbeddingService: MatchEmbeddingService;
  private readonly matchEmbeddingRepository: MatchEmbeddingRepository;
  private readonly repository: JobRecommendationRepository;
  private readonly mode: JobMatcherMode;

  constructor({
    jobMatchProfileLoader,
    matchEmbeddingService,
    matchEmbeddingRepository,
    jobRecommendationRepository,
    config,
  }: {
    jobMatchProfileLoader: JobMatchProfileLoader;
    matchEmbeddingService: MatchEmbeddingService;
    matchEmbeddingRepository: MatchEmbeddingRepository;
    jobRecommendationRepository: JobRecommendationRepository;
    config: { JOB_MATCHER_MODE: JobMatcherMode };
  }) {
    this.jobMatchProfileLoader = jobMatchProfileLoader;
    this.matchEmbeddingService = matchEmbeddingService;
    this.matchEmbeddingRepository = matchEmbeddingRepository;
    this.repository = jobRecommendationRepository;
    this.mode = config.JOB_MATCHER_MODE;
  }

  async listSimilar(jobPostId: string): Promise<SimilarJobItem[]> {
    // load() không có status/expiresAt nên kiểm công khai bằng truy vấn riêng.
    const [listed, source] = await Promise.all([
      this.repository.isPubliclyListed(jobPostId),
      this.jobMatchProfileLoader.load(jobPostId),
    ]);
    if (!listed || !source) return [];

    const ranked = (await this.hasVector(source))
      ? await this.rankByVector(jobPostId)
      : await this.rankBySharedSkills(jobPostId);
    if (ranked.length === 0) return [];

    const ids = ranked.map((job) => job.id);
    const [profiles, jobPosts] = await Promise.all([
      this.jobMatchProfileLoader.loadMany(ids),
      this.repository.findPublicByIds(ids),
    ]);
    const similarityById = new Map(ranked.map((job) => [job.id, job.similarity]));
    return jobPosts.map((jobPost) => ({
      jobPost,
      similarity: similarityById.get(jobPost.id) ?? null,
      sharedSkills: sharedSkillNames(source, profiles.get(jobPost.id)),
    }));
  }

  /** Chế độ rule không chạm model/bảng embedding (giống JobMatchingService). */
  private async hasVector(source: JobMatchProfile): Promise<boolean> {
    if (this.mode !== "hybrid") return false;
    return this.matchEmbeddingService.ensureJobVector({ id: source.jobPostId, text: source.matchText });
  }

  private async rankByVector(jobPostId: string): Promise<RankedJob[]> {
    const nearest = await this.matchEmbeddingRepository.nearestJobs(jobPostId, SIMILAR_JOBS_POOL);
    return nearest
      .filter((job) => job.cosine >= SIMILAR_JOBS_MIN_COSINE)
      .slice(0, SIMILAR_JOBS_LIMIT)
      .map((job) => ({ id: job.id, similarity: job.cosine }));
  }

  private async rankBySharedSkills(jobPostId: string): Promise<RankedJob[]> {
    const ids = await this.repository.findBySharedSkills(jobPostId, SIMILAR_JOBS_LIMIT);
    return ids.map((id) => ({ id, similarity: null }));
  }
}

/** Kỹ năng của tin gợi ý mà tin đang xem cũng có: bắt buộc trước, rồi theo tên. */
function sharedSkillNames(source: JobMatchProfile, other: JobMatchProfile | undefined): string[] {
  if (!other) return [];
  const sourceSkillIds = new Set(source.skills.map((skill) => skill.skillId));
  return other.skills
    .filter((skill) => sourceSkillIds.has(skill.skillId))
    .sort(
      (a, b) =>
        Number(b.importance === "REQUIRED") - Number(a.importance === "REQUIRED") || a.name.localeCompare(b.name, "vi"),
    )
    .slice(0, SIMILAR_JOBS_MAX_SHARED_SKILLS)
    .map((skill) => skill.name);
}
