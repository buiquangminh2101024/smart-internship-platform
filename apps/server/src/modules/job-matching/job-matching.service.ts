import type { PrismaClient } from "@prisma/client";
import type { ApplicationMatchSummary, MatchResult, MatchSemanticStatus } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { CandidateMatchProfile, JobMatcher, JobMatchProfile } from "../../shared/ports/JobMatcher";
import type { CandidateMatchProfileLoader } from "./candidate-match-profile.loader";
import type { JobMatchProfileLoader } from "./job-match-profile.loader";
import { MAX_NEW_EMBEDDINGS_PER_REQUEST } from "./job-matching.config";
import type { MatchEmbeddingService } from "./match-embedding.service";
import { markSemanticPending } from "./scoring-job-matcher";

export type JobMatcherMode = "rule" | "hybrid";

/**
 * Điểm phù hợp chỉ để tham khảo: không đổi trạng thái đơn, không lọc/ẩn đơn.
 * Điểm Employer thấy tính theo hồ sơ HIỆN TẠI của ứng viên (D5).
 *
 * GĐ2: JOB_MATCHER_MODE=hybrid (mặc định từ bước 6) ⇒ chấm hybrid-v2 khi có cosine,
 * thiếu cosine thì rơi về rule-v1 (PLAN GĐ2 quyết định #5) — weightsVersion luôn nói
 * đúng cấu hình đã chấm. JOB_MATCHER_MODE=rule ⇒ không chạm model/bảng embedding, y hệt GĐ1.
 */
export class JobMatchingService {
  private readonly prisma: PrismaClient;
  private readonly ruleJobMatcher: JobMatcher;
  private readonly hybridJobMatcher: JobMatcher;
  private readonly matchEmbeddingService: MatchEmbeddingService;
  private readonly candidateMatchProfileLoader: CandidateMatchProfileLoader;
  private readonly jobMatchProfileLoader: JobMatchProfileLoader;
  private readonly mode: JobMatcherMode;

  constructor({
    prisma,
    ruleJobMatcher,
    hybridJobMatcher,
    matchEmbeddingService,
    candidateMatchProfileLoader,
    jobMatchProfileLoader,
    config,
  }: {
    prisma: PrismaClient;
    ruleJobMatcher: JobMatcher;
    hybridJobMatcher: JobMatcher;
    matchEmbeddingService: MatchEmbeddingService;
    candidateMatchProfileLoader: CandidateMatchProfileLoader;
    jobMatchProfileLoader: JobMatchProfileLoader;
    config: { JOB_MATCHER_MODE: JobMatcherMode };
  }) {
    this.prisma = prisma;
    this.ruleJobMatcher = ruleJobMatcher;
    this.hybridJobMatcher = hybridJobMatcher;
    this.matchEmbeddingService = matchEmbeddingService;
    this.candidateMatchProfileLoader = candidateMatchProfileLoader;
    this.jobMatchProfileLoader = jobMatchProfileLoader;
    this.mode = config.JOB_MATCHER_MODE;
  }

  // ─── Candidate ───────────────────────────────────────────────────────────

  async matchForCandidate(userId: string, jobPostId: string): Promise<MatchResult> {
    const candidate = await this.prisma.candidate.findUnique({ where: { userId }, select: { id: true } });
    if (!candidate) throw new AppError(404, "Candidate profile not found");

    const jobPost = await this.prisma.jobPost.findUnique({ where: { id: jobPostId }, select: { status: true } });
    if (!jobPost || jobPost.status !== "PUBLISHED") throw new AppError(404, "Job post not found");

    return this.scoreOne(await this.requireCandidateProfile(candidate.id), await this.requireJobProfile(jobPostId));
  }

  // ─── Employer ────────────────────────────────────────────────────────────

  async listApplicationMatches(userId: string, jobPostId: string): Promise<ApplicationMatchSummary[]> {
    const employer = await this.requireEmployer(userId);
    const jobPost = await this.prisma.jobPost.findFirst({
      where: { id: jobPostId, companyId: employer.companyId },
      select: { id: true },
    });
    if (!jobPost) throw new AppError(404, "Job post not found");

    const applications = await this.prisma.application.findMany({
      where: { jobPostId },
      select: { id: true, candidateId: true },
    });
    const [job, profiles] = await Promise.all([
      this.requireJobProfile(jobPostId),
      this.candidateMatchProfileLoader.loadMany(applications.map((application) => application.candidateId)),
    ]);

    const similarities =
      this.mode === "hybrid"
        ? await this.matchEmbeddingService.similarityForCandidates(
            { id: job.jobPostId, text: job.matchText },
            [...profiles.values()].filter(canBeScored).map(toEmbeddingTarget),
            MAX_NEW_EMBEDDINGS_PER_REQUEST,
          )
        : new Map<string, number | null>();

    return applications.flatMap((application) => {
      const profile = profiles.get(application.candidateId);
      if (!profile) return [];
      const result = this.score(profile, job, similarities.get(profile.candidateId) ?? null);
      return [
        {
          applicationId: application.id,
          candidateId: application.candidateId,
          score: result.score,
          confidence: result.confidence,
          status: result.status,
          semanticStatus: this.semanticStatus(result),
        },
      ];
    });
  }

  async matchForApplication(userId: string, applicationId: string): Promise<MatchResult> {
    const employer = await this.requireEmployer(userId);
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, jobPost: { companyId: employer.companyId } },
      select: { candidateId: true, jobPostId: true },
    });
    if (!application) throw new AppError(404, "Application not found");

    return this.scoreOne(
      await this.requireCandidateProfile(application.candidateId),
      await this.requireJobProfile(application.jobPostId),
    );
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async scoreOne(candidate: CandidateMatchProfile, job: JobMatchProfile): Promise<MatchResult> {
    const similarity =
      this.mode === "hybrid" && canBeScored(candidate)
        ? await this.matchEmbeddingService.similarity(toEmbeddingTarget(candidate), {
            id: job.jobPostId,
            text: job.matchText,
          })
        : null;
    return this.score(candidate, job, similarity);
  }

  private score(candidate: CandidateMatchProfile, job: JobMatchProfile, similarity: number | null): MatchResult {
    if (this.mode === "rule") {
      return this.ruleJobMatcher.match({ candidate, job, semanticSimilarity: null });
    }
    if (similarity === null) {
      return markSemanticPending(this.ruleJobMatcher.match({ candidate, job, semanticSimilarity: null }));
    }
    return this.hybridJobMatcher.match({ candidate, job, semanticSimilarity: similarity });
  }

  private semanticStatus(result: MatchResult): MatchSemanticStatus {
    if (this.mode === "rule") return "OFF";
    return result.semantic.available ? "AVAILABLE" : "PENDING";
  }

  private async requireEmployer(userId: string) {
    const employer = await this.prisma.employer.findUnique({ where: { userId }, select: { companyId: true } });
    if (!employer) throw new AppError(404, "Employer profile not found");
    return employer;
  }

  private async requireCandidateProfile(candidateId: string): Promise<CandidateMatchProfile> {
    const profile = await this.candidateMatchProfileLoader.load(candidateId);
    if (!profile) throw new AppError(404, "Candidate profile not found");
    return profile;
  }

  private async requireJobProfile(jobPostId: string): Promise<JobMatchProfile> {
    const profile = await this.jobMatchProfileLoader.load(jobPostId);
    if (!profile) throw new AppError(404, "Job post not found");
    return profile;
  }
}

/**
 * Hồ sơ chưa có kỹ năng luôn ra INSUFFICIENT_PROFILE dù có cosine — không tốn
 * lượt embed; khi hồ sơ thêm kỹ năng thì văn bản đổi và vector được tính lúc đó.
 */
function canBeScored(candidate: CandidateMatchProfile): boolean {
  return candidate.skills.length > 0;
}

function toEmbeddingTarget(candidate: CandidateMatchProfile) {
  return { id: candidate.candidateId, text: candidate.matchText };
}
