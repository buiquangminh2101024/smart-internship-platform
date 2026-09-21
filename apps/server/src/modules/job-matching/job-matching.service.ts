import type { PrismaClient } from "@prisma/client";
import type { ApplicationMatchSummary, MatchResult } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { CandidateMatchProfile, JobMatcher, JobMatchProfile } from "../../shared/ports/JobMatcher";
import type { CandidateMatchProfileLoader } from "./candidate-match-profile.loader";
import type { JobMatchProfileLoader } from "./job-match-profile.loader";

/**
 * Điểm phù hợp chỉ để tham khảo: không đổi trạng thái đơn, không lọc/ẩn đơn.
 * Điểm Employer thấy tính theo hồ sơ HIỆN TẠI của ứng viên (D5).
 */
export class JobMatchingService {
  private readonly prisma: PrismaClient;
  private readonly jobMatcher: JobMatcher;
  private readonly candidateMatchProfileLoader: CandidateMatchProfileLoader;
  private readonly jobMatchProfileLoader: JobMatchProfileLoader;

  constructor({
    prisma,
    jobMatcher,
    candidateMatchProfileLoader,
    jobMatchProfileLoader,
  }: {
    prisma: PrismaClient;
    jobMatcher: JobMatcher;
    candidateMatchProfileLoader: CandidateMatchProfileLoader;
    jobMatchProfileLoader: JobMatchProfileLoader;
  }) {
    this.prisma = prisma;
    this.jobMatcher = jobMatcher;
    this.candidateMatchProfileLoader = candidateMatchProfileLoader;
    this.jobMatchProfileLoader = jobMatchProfileLoader;
  }

  // ─── Candidate ───────────────────────────────────────────────────────────

  async matchForCandidate(userId: string, jobPostId: string): Promise<MatchResult> {
    const candidate = await this.prisma.candidate.findUnique({ where: { userId }, select: { id: true } });
    if (!candidate) throw new AppError(404, "Candidate profile not found");

    const jobPost = await this.prisma.jobPost.findUnique({ where: { id: jobPostId }, select: { status: true } });
    if (!jobPost || jobPost.status !== "PUBLISHED") throw new AppError(404, "Job post not found");

    return this.score(await this.requireCandidateProfile(candidate.id), await this.requireJobProfile(jobPostId));
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

    return applications.flatMap((application) => {
      const profile = profiles.get(application.candidateId);
      if (!profile) return [];
      const result = this.score(profile, job);
      return [
        {
          applicationId: application.id,
          candidateId: application.candidateId,
          score: result.score,
          confidence: result.confidence,
          status: result.status,
          // GĐ1 chưa có semantic; GĐ2 thêm AVAILABLE/PENDING.
          semanticStatus: "OFF" as const,
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

    return this.score(
      await this.requireCandidateProfile(application.candidateId),
      await this.requireJobProfile(application.jobPostId),
    );
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private score(candidate: CandidateMatchProfile, job: JobMatchProfile): MatchResult {
    return this.jobMatcher.match({ candidate, job, semanticSimilarity: null });
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
