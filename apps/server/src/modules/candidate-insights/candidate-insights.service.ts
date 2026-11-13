import type { ProfileCompleteness, ProfileInsight, ProfileInsightSuggestion } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import type {
  GeneratedProfileInsight,
  ProfileInsightGenerator,
  ProfileInsightInput,
} from "../../shared/ports/ProfileInsightGenerator";
import type { JobRecommendationService } from "../job-matching/job-recommendation.service";
import type { CandidateInsightRateLimitService } from "./candidate-insight-rate-limit.service";
import { INSIGHT_MIN_JOB_SCORE, INSIGHT_TOP_JOBS_LIMIT } from "./candidate-insights.config";
import type { CandidateInsightsRepository } from "./candidate-insights.repository";
import {
  buildProfileCompleteness,
  computeCompletenessScore,
  needsTopMatchesForNextStep,
} from "./profile-completeness.util";

/**
 * "Phân tích hồ sơ" (A1 + A4, AD-14 — docs/06-backend/candidate-insights/PLAN.md) và độ
 * hoàn thiện hồ sơ (AD-26 mục 8 — docs/06-backend/job-discovery/PLAN.md bước 3).
 * Module này chỉ giữ phần LLM/lưu trữ/hạn mức và độ hoàn thiện; top tin phù hợp lấy thẳng
 * từ JobRecommendationService.getTopMatches, không tự lọc/chấm lại.
 */
export class CandidateInsightsService {
  private readonly repository: CandidateInsightsRepository;
  private readonly rateLimit: CandidateInsightRateLimitService;
  private readonly jobRecommendationService: JobRecommendationService;
  private readonly generator: ProfileInsightGenerator;
  private readonly logger: Logger;

  constructor({
    candidateInsightsRepository,
    candidateInsightRateLimitService,
    jobRecommendationService,
    profileInsightGenerator,
    logger,
  }: {
    candidateInsightsRepository: CandidateInsightsRepository;
    candidateInsightRateLimitService: CandidateInsightRateLimitService;
    jobRecommendationService: JobRecommendationService;
    profileInsightGenerator: ProfileInsightGenerator;
    logger: Logger;
  }) {
    this.repository = candidateInsightsRepository;
    this.rateLimit = candidateInsightRateLimitService;
    this.jobRecommendationService = jobRecommendationService;
    this.generator = profileInsightGenerator;
    this.logger = logger;
  }

  /** Kết quả đã lưu; null nếu chưa từng phân tích. Không tính lại, không tốn hạn mức. */
  async getForUser(userId: string): Promise<ProfileInsight | null> {
    return this.repository.findByCandidateId(await this.requireCandidateId(userId));
  }

  async completenessForUser(userId: string): Promise<ProfileCompleteness> {
    return this.completeness(await this.requireCandidateId(userId));
  }

  /**
   * Tính lại mỗi lần gọi, không đọc bản chụp của lần phân tích, không LLM. Chỉ chấm trang
   * đầu "Việc làm phù hợp" khi "Nên làm trước" có thể cần bằng chứng từ đó (có kỹ năng,
   * thiếu kinh nghiệm hoặc ngành) — phần lớn thời gian của endpoint nằm ở đó; dùng lối
   * nhẹ getTopMatchResults (cùng 10 tin, chấm rule, không nạp tin công khai).
   */
  async completeness(candidateId: string): Promise<ProfileCompleteness> {
    const facts = await this.repository.loadCompletenessFacts(candidateId);
    if (!facts) throw new AppError(404, "Candidate profile not found");
    const topMatches = needsTopMatchesForNextStep(facts)
      ? await this.jobRecommendationService.getTopMatchResults(candidateId, {
          limit: INSIGHT_TOP_JOBS_LIMIT,
          minScore: INSIGHT_MIN_JOB_SCORE,
        })
      : [];
    return buildProfileCompleteness(facts, topMatches);
  }

  async generateForUser(userId: string): Promise<ProfileInsight> {
    const candidateId = await this.requireCandidateId(userId);
    await this.rateLimit.assertWithinQuota(userId);
    return this.generate(candidateId, userId);
  }

  /** Tách khỏi generateForUser để script kiểm thử gọi thẳng theo candidateId. */
  async generate(candidateId: string, userId: string): Promise<ProfileInsight> {
    const [facts, input] = await Promise.all([
      this.repository.loadCompletenessFacts(candidateId),
      this.repository.loadGeneratorInput(candidateId),
    ]);
    if (!facts || !input) throw new AppError(404, "Candidate profile not found");

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
      ...recommendations.suggestions,
    ];

    const insight = await this.repository.upsert(candidateId, {
      completenessScore: computeCompletenessScore(facts),
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
