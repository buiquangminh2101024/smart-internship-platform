import type { PrismaClient } from "@prisma/client";
import type { JobRecommendationList, MatchResult } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { CandidateMatchProfile, JobMatcher, JobMatchProfile } from "../../shared/ports/JobMatcher";
import type { CandidateMatchProfileLoader } from "./candidate-match-profile.loader";
import type { JobMatchProfileLoader } from "./job-match-profile.loader";
import {
  MAX_NEW_EMBEDDINGS_PER_REQUEST,
  MIN_RECOMMENDATION_SCORE,
  RECOMMENDATION_LIMIT,
  RECOMMENDATION_POOL_SIZE,
  RECOMMENDATION_RECENT_DAYS,
  RECOMMENDATION_RERANK_SIZE,
} from "./job-matching.config";
import type { JobMatcherMode } from "./job-matching.service";
import type { JobRecommendationRepository } from "./job-recommendation.repository";
import type { MatchEmbeddingService } from "./match-embedding.service";
import { markSemanticPending } from "./scoring-job-matcher";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TopMatchOptions {
  limit?: number;
  minScore?: number;
}

/**
 * "Việc làm phù hợp" (B2, AD-14 — docs/06-backend/candidate-insights/PLAN.md):
 * top tin hợp với MỘT hồ sơ, đối xứng với listApplicationMatches (N hồ sơ ↔ 1 tin).
 * Không LLM, không hạn mức, không cache — mỗi lần gọi tính lại; phần tốn kém duy
 * nhất (vector) đã tự cache theo contentHash ở MatchEmbeddingService.
 * `getTopMatches` là hàm dùng chung: module candidate-insights gọi thẳng hàm này
 * thay vì tự lọc/chấm lại.
 */
export class JobRecommendationService {
  private readonly prisma: PrismaClient;
  private readonly ruleJobMatcher: JobMatcher;
  private readonly hybridJobMatcher: JobMatcher;
  private readonly matchEmbeddingService: MatchEmbeddingService;
  private readonly candidateMatchProfileLoader: CandidateMatchProfileLoader;
  private readonly jobMatchProfileLoader: JobMatchProfileLoader;
  private readonly repository: JobRecommendationRepository;
  private readonly mode: JobMatcherMode;

  constructor({
    prisma,
    ruleJobMatcher,
    hybridJobMatcher,
    matchEmbeddingService,
    candidateMatchProfileLoader,
    jobMatchProfileLoader,
    jobRecommendationRepository,
    config,
  }: {
    prisma: PrismaClient;
    ruleJobMatcher: JobMatcher;
    hybridJobMatcher: JobMatcher;
    matchEmbeddingService: MatchEmbeddingService;
    candidateMatchProfileLoader: CandidateMatchProfileLoader;
    jobMatchProfileLoader: JobMatchProfileLoader;
    jobRecommendationRepository: JobRecommendationRepository;
    config: { JOB_MATCHER_MODE: JobMatcherMode };
  }) {
    this.prisma = prisma;
    this.ruleJobMatcher = ruleJobMatcher;
    this.hybridJobMatcher = hybridJobMatcher;
    this.matchEmbeddingService = matchEmbeddingService;
    this.candidateMatchProfileLoader = candidateMatchProfileLoader;
    this.jobMatchProfileLoader = jobMatchProfileLoader;
    this.repository = jobRecommendationRepository;
    this.mode = config.JOB_MATCHER_MODE;
  }

  async recommendForUser(userId: string): Promise<JobRecommendationList> {
    const candidate = await this.prisma.candidate.findUnique({ where: { userId }, select: { id: true } });
    if (!candidate) throw new AppError(404, "Candidate profile not found");
    return this.getTopMatches(candidate.id);
  }

  async getTopMatches(candidateId: string, options: TopMatchOptions = {}): Promise<JobRecommendationList> {
    const limit = options.limit ?? RECOMMENDATION_LIMIT;
    const minScore = options.minScore ?? MIN_RECOMMENDATION_SCORE;

    const candidate = await this.candidateMatchProfileLoader.load(candidateId);
    if (!candidate) throw new AppError(404, "Candidate profile not found");
    // Cùng điều kiện với ScoringJobMatcher: không kỹ năng ⇒ mọi tin đều INSUFFICIENT_PROFILE.
    if (candidate.skills.length === 0) return { status: "INSUFFICIENT_PROFILE", items: [] };

    // Giai đoạn A — SQL lọc thô (kèm nới lỏng 1 lần).
    const poolIds = await this.repository.findCandidatePool({
      skillIds: candidate.skills.map((skill) => skill.skillId),
      publishedSince: new Date(Date.now() - RECOMMENDATION_RECENT_DAYS * DAY_MS),
      poolSize: RECOMMENDATION_POOL_SIZE,
      minPool: limit,
    });
    const jobs = await this.jobMatchProfileLoader.loadMany(poolIds);

    // Giai đoạn B — rule cho cả tập, rồi chấm lại top bằng hybrid.
    const ruleScored = [...jobs.values()]
      .map((job) => ({ job, match: this.ruleJobMatcher.match({ candidate, job, semanticSimilarity: null }) }))
      .filter((entry) => entry.match.status === "SCORED");
    const shortlist = sortByScore(ruleScored).slice(0, RECOMMENDATION_RERANK_SIZE);
    const rescored = this.mode === "hybrid" ? await this.rescoreHybrid(candidate, shortlist) : shortlist;

    // Giai đoạn C — ngưỡng theo từng tin (D6), rồi lấy top.
    const top = sortByScore(rescored.filter((entry) => (entry.match.score ?? 0) >= minScore)).slice(0, limit);

    const jobPosts = await this.repository.findPublicByIds(top.map((entry) => entry.job.jobPostId));
    const matchById = new Map(top.map((entry) => [entry.job.jobPostId, entry.match]));
    return {
      status: "OK",
      items: jobPosts.map((jobPost) => ({ jobPost, match: matchById.get(jobPost.id)! })),
    };
  }

  /**
   * Tin chưa kịp có vector (vướng giới hạn embed mới / model lỗi) giữ điểm rule-v1
   * kèm semantic PENDING — không lỗi, không chờ; lần gọi sau tự bổ sung.
   */
  private async rescoreHybrid(candidate: CandidateMatchProfile, entries: ScoredJob[]): Promise<ScoredJob[]> {
    const similarities = await this.matchEmbeddingService.similarityForJobs(
      { id: candidate.candidateId, text: candidate.matchText },
      entries.map((entry) => ({ id: entry.job.jobPostId, text: entry.job.matchText })),
      MAX_NEW_EMBEDDINGS_PER_REQUEST,
    );
    return entries.map(({ job, match }) => {
      const similarity = similarities.get(job.jobPostId) ?? null;
      return {
        job,
        match:
          similarity === null
            ? markSemanticPending(match)
            : this.hybridJobMatcher.match({ candidate, job, semanticSimilarity: similarity }),
      };
    });
  }
}

interface ScoredJob {
  job: JobMatchProfile;
  match: MatchResult;
}

function sortByScore(entries: ScoredJob[]): ScoredJob[] {
  return [...entries].sort((left, right) => (right.match.score ?? 0) - (left.match.score ?? 0));
}
