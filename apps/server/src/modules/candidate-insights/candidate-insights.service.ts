import type { ProfileInsight, ProfileInsightSuggestion } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import type {
  GeneratedProfileInsight,
  ProfileInsightGenerator,
  ProfileInsightInput,
} from "../../shared/ports/ProfileInsightGenerator";
import type { CandidateMatchProfileLoader } from "../job-matching/candidate-match-profile.loader";
import type { JobRecommendationService } from "../job-matching/job-recommendation.service";
import type { CandidateInsightRateLimitService } from "./candidate-insight-rate-limit.service";
import { INSIGHT_MIN_JOB_SCORE, INSIGHT_TOP_JOBS_LIMIT } from "./candidate-insights.config";
import type { CandidateInsightsRepository } from "./candidate-insights.repository";
import { buildCodeSuggestions, computeCompletenessScore } from "./profile-suggestions.util";

/**
 * "Phân tích hồ sơ" (A1 + A4, AD-14 — docs/06-backend/candidate-insights/PLAN.md).
 * Module này chỉ giữ phần LLM/lưu trữ/hạn mức; top tin phù hợp lấy thẳng từ
 * JobRecommendationService.getTopMatches, không tự lọc/chấm lại.
 */
export class CandidateInsightsService {
  private readonly repository: CandidateInsightsRepository;
  private readonly rateLimit: CandidateInsightRateLimitService;
  private readonly jobRecommendationService: JobRecommendationService;
  private readonly candidateMatchProfileLoader: CandidateMatchProfileLoader;
  private readonly generator: ProfileInsightGenerator;
  private readonly logger: Logger;

  constructor({
    candidateInsightsRepository,
    candidateInsightRateLimitService,
    jobRecommendationService,
    candidateMatchProfileLoader,
    profileInsightGenerator,
    logger,
  }: {
    candidateInsightsRepository: CandidateInsightsRepository;
    candidateInsightRateLimitService: CandidateInsightRateLimitService;
    jobRecommendationService: JobRecommendationService;
    candidateMatchProfileLoader: CandidateMatchProfileLoader;
    profileInsightGenerator: ProfileInsightGenerator;
    logger: Logger;
  }) {
    this.repository = candidateInsightsRepository;
    this.rateLimit = candidateInsightRateLimitService;
    this.jobRecommendationService = jobRecommendationService;
    this.candidateMatchProfileLoader = candidateMatchProfileLoader;
    this.generator = profileInsightGenerator;
    this.logger = logger;
  }

  /** Kết quả đã lưu; null nếu chưa từng phân tích. Không tính lại, không tốn hạn mức. */
  async getForUser(userId: string): Promise<ProfileInsight | null> {
    return this.repository.findByCandidateId(await this.requireCandidateId(userId));
  }

  async generateForUser(userId: string): Promise<ProfileInsight> {
    const candidateId = await this.requireCandidateId(userId);
    await this.rateLimit.assertWithinQuota(userId);
    return this.generate(candidateId, userId);
  }

  /** Tách khỏi generateForUser để script kiểm thử gọi thẳng theo candidateId. */
  async generate(candidateId: string, userId: string): Promise<ProfileInsight> {
    const [profile, input] = await Promise.all([
      this.candidateMatchProfileLoader.load(candidateId),
      this.repository.loadGeneratorInput(candidateId),
    ]);
    if (!profile || !input) throw new AppError(404, "Candidate profile not found");

    const callLlm = hasWritableContent(input);
    // LLM và chấm điểm độc lập nhau — chạy song song cho đỡ chờ.
    const [recommendations, generated] = await Promise.all([
      this.jobRecommendationService.getTopMatches(candidateId, {
        limit: INSIGHT_TOP_JOBS_LIMIT,
        minScore: INSIGHT_MIN_JOB_SCORE,
      }),
      callLlm ? this.generateWithLlm(candidateId, input) : Promise.resolve(EMPTY_GENERATED),
    ]);

    const suggestions: ProfileInsightSuggestion[] = [
      ...generated.writingSuggestions.map((text): ProfileInsightSuggestion => ({ kind: "WRITING", text })),
      // INSUFFICIENT_PROFILE luôn có items rỗng ⇒ không có SKILL_GAP/INDUSTRY_MISMATCH.
      ...buildCodeSuggestions(recommendations.items),
    ];

    const insight = await this.repository.upsert(candidateId, {
      completenessScore: computeCompletenessScore(profile.completeness),
      strengths: generated.strengths,
      suggestions,
      topJobPostIds: recommendations.items.map((item) => item.jobPost.id),
    });

    // Chỉ tính lượt khi thật sự gọi LLM thành công (lỗi ⇒ đã ném 503 ở trên, không tới đây).
    if (callLlm) await this.rateLimit.recordUsage(userId);
    return insight;
  }

  private async generateWithLlm(candidateId: string, input: ProfileInsightInput): Promise<GeneratedProfileInsight> {
    try {
      return await this.generator.generate(input);
    } catch (error) {
      this.logger.error("Profile insight generation failed", {
        candidateId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AppError(503, "Chưa phân tích được hồ sơ lúc này, vui lòng thử lại sau ít phút.");
    }
  }

  private async requireCandidateId(userId: string): Promise<string> {
    const candidateId = await this.repository.findCandidateIdByUserId(userId);
    if (!candidateId) throw new AppError(404, "Candidate profile not found");
    return candidateId;
  }
}

const EMPTY_GENERATED: GeneratedProfileInsight = { strengths: [], writingSuggestions: [] };

/**
 * Hồ sơ không có chữ nào để đọc (không headline/bio/kỹ năng/kinh nghiệm/dự án) ⇒
 * không gọi LLM: không có gì để nhận xét, gọi chỉ tốn lượt và dễ bị bịa.
 */
function hasWritableContent(input: ProfileInsightInput): boolean {
  return Boolean(
    input.headline?.trim() ||
      input.bio?.trim() ||
      input.skills.length > 0 ||
      input.experiences.length > 0 ||
      input.projects.length > 0,
  );
}
