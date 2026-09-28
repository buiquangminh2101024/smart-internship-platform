import type { PrismaClient } from "@prisma/client";
import type {
  CandidateOutreachInvitationDto,
  CandidateSearchResultDto,
  MatchResult,
  OutreachInvitationAction,
  OutreachSettings,
  RespondOutreachInvitationResponse,
  SentOutreachInvitationDto,
} from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import type { CandidateMatchProfile, JobMatcher, JobMatchProfile } from "../../shared/ports/JobMatcher";
import type { CandidateMatchProfileLoader } from "../job-matching/candidate-match-profile.loader";
import type { JobMatchProfileLoader } from "../job-matching/job-match-profile.loader";
import { MAX_NEW_EMBEDDINGS_PER_REQUEST } from "../job-matching/job-matching.config";
import type { JobMatcherMode } from "../job-matching/job-matching.service";
import type { MatchEmbeddingService } from "../job-matching/match-embedding.service";
import { markSemanticPending } from "../job-matching/scoring-job-matcher";
import type { MessagingService } from "../messaging/messaging.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { CompanySubscriptionRepository } from "../subscriptions/company-subscription.repository";
import type { SubscriptionsService } from "../subscriptions/subscriptions.service";
import type { CandidateOutreachRateLimitService } from "./candidate-outreach-rate-limit.service";
import {
  DEFAULT_OUTREACH_DAILY_QUOTA,
  INVITATION_EXPIRY_DAYS,
  PREFILTER_LIMIT,
  TOP_RESULT_COUNT,
} from "./candidate-outreach.config";
import {
  toCandidateOutreachInvitationDto,
  toCandidateSearchResultDto,
  toSentOutreachInvitationDto,
} from "./candidate-outreach.mapper";
import type {
  CandidateOutreachRepository,
  OutreachEmployer,
  OutreachJobPost,
} from "./candidate-outreach.repository";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Tìm & mời ứng viên chưa ứng tuyển (B3, AD-15 — docs/06-backend/candidate-outreach/PLAN.md).
 * Chấm điểm tái dùng nguyên bộ chấm của Job Matcher và cùng quy tắc với
 * JobMatchingService: JOB_MATCHER_MODE=rule ⇒ rule-v1; hybrid mà thiếu cosine ⇒
 * rule-v1 kèm semantic PENDING — `weightsVersion` luôn nói đúng cấu hình đã chấm.
 */
export class CandidateOutreachService {
  private readonly prisma: PrismaClient;
  private readonly repository: CandidateOutreachRepository;
  private readonly rateLimit: CandidateOutreachRateLimitService;
  private readonly subscriptionsService: SubscriptionsService;
  private readonly companySubscriptionRepository: CompanySubscriptionRepository;
  private readonly ruleJobMatcher: JobMatcher;
  private readonly hybridJobMatcher: JobMatcher;
  private readonly matchEmbeddingService: MatchEmbeddingService;
  private readonly candidateMatchProfileLoader: CandidateMatchProfileLoader;
  private readonly jobMatchProfileLoader: JobMatchProfileLoader;
  private readonly messagingService: MessagingService;
  private readonly notificationsService: NotificationsService;
  private readonly logger: Logger;
  private readonly mode: JobMatcherMode;

  constructor({
    prisma,
    candidateOutreachRepository,
    candidateOutreachRateLimitService,
    subscriptionsService,
    companySubscriptionRepository,
    ruleJobMatcher,
    hybridJobMatcher,
    matchEmbeddingService,
    candidateMatchProfileLoader,
    jobMatchProfileLoader,
    messagingService,
    notificationsService,
    logger,
    config,
  }: {
    prisma: PrismaClient;
    candidateOutreachRepository: CandidateOutreachRepository;
    candidateOutreachRateLimitService: CandidateOutreachRateLimitService;
    subscriptionsService: SubscriptionsService;
    companySubscriptionRepository: CompanySubscriptionRepository;
    ruleJobMatcher: JobMatcher;
    hybridJobMatcher: JobMatcher;
    matchEmbeddingService: MatchEmbeddingService;
    candidateMatchProfileLoader: CandidateMatchProfileLoader;
    jobMatchProfileLoader: JobMatchProfileLoader;
    messagingService: MessagingService;
    notificationsService: NotificationsService;
    logger: Logger;
    config: { JOB_MATCHER_MODE: JobMatcherMode };
  }) {
    this.prisma = prisma;
    this.repository = candidateOutreachRepository;
    this.rateLimit = candidateOutreachRateLimitService;
    this.subscriptionsService = subscriptionsService;
    this.companySubscriptionRepository = companySubscriptionRepository;
    this.ruleJobMatcher = ruleJobMatcher;
    this.hybridJobMatcher = hybridJobMatcher;
    this.matchEmbeddingService = matchEmbeddingService;
    this.candidateMatchProfileLoader = candidateMatchProfileLoader;
    this.jobMatchProfileLoader = jobMatchProfileLoader;
    this.messagingService = messagingService;
    this.notificationsService = notificationsService;
    this.logger = logger;
    this.mode = config.JOB_MATCHER_MODE;
  }

  // ─── Employer ────────────────────────────────────────────────────────────

  /** Danh sách "Gợi ý" (D6): giai đoạn A (SQL lọc thô) + B (chấm điểm), không cache. */
  async searchCandidates(userId: string, jobPostId: string): Promise<CandidateSearchResultDto[]> {
    const employer = await this.requireEmployer(userId);
    const jobPost = await this.requireOwnedJobPost(employer, jobPostId);
    assertPublished(jobPost);
    await this.resolveDailyQuota(employer);

    const poolIds = await this.repository.searchCandidatePool(jobPost.id, PREFILTER_LIMIT);
    if (poolIds.length === 0) return [];

    const job = await this.requireJobProfile(jobPost.id);
    const scores = await this.scoreCandidates(job, poolIds, MAX_NEW_EMBEDDINGS_PER_REQUEST);
    // sort ổn định ⇒ điểm bằng nhau giữ thứ tự của pool (nhiều kỹ năng giao hơn trước).
    const topIds = poolIds
      .filter((id) => scores.has(id))
      .sort((left, right) => (scores.get(right)!.score ?? -1) - (scores.get(left)!.score ?? -1))
      .slice(0, TOP_RESULT_COUNT);

    const [cards, expiredIds] = await Promise.all([
      this.repository.findSearchCards(topIds),
      this.repository.findExpiredInvitedCandidateIds(jobPost.id, topIds),
    ]);
    return cards.map((card) =>
      toCandidateSearchResultDto(card, scores.get(card.candidateId)!, expiredIds.has(card.candidateId)),
    );
  }

  /** Danh sách "Đã mời" (D6): chỉ đọc ⇒ không đòi tin PUBLISHED hay công ty còn gói. */
  async listSentInvitations(userId: string, jobPostId: string): Promise<SentOutreachInvitationDto[]> {
    const employer = await this.requireEmployer(userId);
    const jobPost = await this.requireOwnedJobPost(employer, jobPostId);

    const invitations = await this.repository.listForJobPost(jobPost.id);
    const candidateIds = [...new Set(invitations.map((invitation) => invitation.candidateId))];
    const [cards, accessible] = await Promise.all([
      this.repository.findSearchCards(candidateIds),
      this.repository.findProfileAccessibleCandidateIds(employer.companyId, candidateIds),
    ]);
    const cardById = new Map(cards.map((card) => [card.candidateId, card]));
    const now = new Date();
    return invitations.map((invitation) =>
      toSentOutreachInvitationDto(
        invitation,
        cardById.get(invitation.candidateId) ?? null,
        accessible.has(invitation.candidateId),
        now,
      ),
    );
  }

  async invite(userId: string, jobPostId: string, candidateId: string): Promise<SentOutreachInvitationDto> {
    const employer = await this.requireEmployer(userId);
    const jobPost = await this.requireOwnedJobPost(employer, jobPostId);
    assertPublished(jobPost);
    const dailyQuota = await this.resolveDailyQuota(employer);

    const candidate = await this.repository.findCandidateForInvite(candidateId);
    if (!candidate) throw new AppError(404, "Không tìm thấy ứng viên.");
    if (!candidate.isOpenToOutreach) {
      throw new AppError(403, "Ứng viên không cho phép nhà tuyển dụng tìm kiếm và mời.");
    }
    const [applied, blocked] = await Promise.all([
      this.repository.hasApplied(candidate.id, jobPost.id),
      this.repository.hasBlockingInvitation(candidate.id, jobPost.id),
    ]);
    if (applied) throw new AppError(409, "Ứng viên đã ứng tuyển tin này.");
    // Q4 — chỉ lời mời EXPIRED mới cho mời lại.
    if (blocked) throw new AppError(409, "Ứng viên đã được mời cho tin này.");
    await this.rateLimit.assertWithinQuota(employer.companyId, dailyQuota);

    const match = await this.scoreForInvitation(jobPost.id, candidate.id);
    const invitation = await this.prisma.$transaction(async (tx) => {
      const created = await this.repository.create(
        {
          companyId: employer.companyId,
          employerId: employer.id,
          jobPostId: jobPost.id,
          candidateId: candidate.id,
          expiresAt: new Date(Date.now() + INVITATION_EXPIRY_DAYS * DAY_MS),
          matchScore: match?.score ?? null,
          matchWeightsVersion: match?.weightsVersion ?? null,
        },
        tx,
      );
      await this.notificationsService.notify(
        "CANDIDATE_OUTREACH_INVITATION_RECEIVED",
        candidate.userId,
        {
          invitationId: created.id,
          jobPostId: jobPost.id,
          jobPostTitle: jobPost.title,
          companyName: employer.company.name,
          expiresAt: created.expiresAt,
        },
        tx,
      );
      return created;
    });
    // Chỉ tính lượt khi lời mời đã được tạo.
    await this.rateLimit.recordUsage(employer.companyId);

    const [card] = await this.repository.findSearchCards([candidate.id]);
    // Vừa kiểm isOpenToOutreach = true ở trên ⇒ xem được hồ sơ.
    return toSentOutreachInvitationDto(invitation, card ?? null, true);
  }

  // ─── Candidate ───────────────────────────────────────────────────────────

  async listForCandidate(userId: string): Promise<CandidateOutreachInvitationDto[]> {
    const candidateId = await this.requireCandidateId(userId);
    const invitations = await this.repository.listForCandidate(candidateId);
    const acceptedJobPostIds = invitations
      .filter((invitation) => invitation.status === "ACCEPTED")
      .map((invitation) => invitation.jobPostId);
    const conversations = await this.repository.findConversationIdsByJobPost(candidateId, acceptedJobPostIds);
    const now = new Date();
    return invitations.map((invitation) =>
      toCandidateOutreachInvitationDto(invitation, conversations.get(invitation.jobPostId) ?? null, now),
    );
  }

  async respond(
    userId: string,
    invitationId: string,
    action: OutreachInvitationAction,
  ): Promise<RespondOutreachInvitationResponse> {
    const candidateId = await this.requireCandidateId(userId);
    const invitation = await this.repository.findById(invitationId);
    if (!invitation || invitation.candidateId !== candidateId) {
      throw new AppError(404, "Không tìm thấy lời mời.");
    }
    // Q3 — tin đã đóng/hết hạn/bị gỡ thì lời mời coi như hết hạn, dù sweep chưa chạy.
    if (invitation.jobPost.status !== "PUBLISHED") {
      throw new AppError(409, "Lời mời không còn hiệu lực.");
    }

    const status = action === "ACCEPT" ? "ACCEPTED" : "DECLINED";
    await this.prisma.$transaction(async (tx) => {
      // Điều kiện PENDING + chưa quá hạn nằm trong câu UPDATE ⇒ an toàn khi trả lời đồng thời.
      const updated = await this.repository.respondIfPending(invitation.id, status, tx);
      if (!updated) throw new AppError(409, "Lời mời không còn hiệu lực.");
      await this.notificationsService.notify(
        "CANDIDATE_OUTREACH_INVITATION_RESPONDED",
        invitation.employer.userId,
        {
          invitationId: invitation.id,
          jobPostId: invitation.jobPostId,
          jobPostTitle: invitation.jobPost.title,
          candidateName: invitation.candidate.fullName,
          accepted: status === "ACCEPTED",
        },
        tx,
      );
    });

    if (status === "DECLINED") return { status, conversationId: null };

    // Ngoài transaction: createConversation dùng client riêng và tự trả hội thoại cũ nếu
    // đã có. Lỗi ở đây không hoàn tác Accept — Candidate vẫn tự mở hội thoại được từ tin.
    try {
      const conversation = await this.messagingService.createConversation(userId, "CANDIDATE", invitation.jobPostId);
      return { status, conversationId: conversation.id };
    } catch (error) {
      this.logger.error("Accept outreach invitation: create conversation failed", {
        invitationId: invitation.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return { status, conversationId: null };
    }
  }

  async updateSettings(userId: string, settings: OutreachSettings): Promise<OutreachSettings> {
    const candidateId = await this.requireCandidateId(userId);
    const isOpenToOutreach = await this.repository.updateOpenToOutreach(candidateId, settings.isOpenToOutreach);
    return { isOpenToOutreach };
  }

  // ─── Chấm điểm ───────────────────────────────────────────────────────────

  /**
   * D7 — chấm lại riêng ứng viên này lúc gửi. Lỗi ⇒ null (lời mời vẫn được tạo,
   * không lưu điểm): điểm chỉ là thông tin phụ, không được chặn luồng mời.
   */
  private async scoreForInvitation(jobPostId: string, candidateId: string): Promise<MatchResult | null> {
    try {
      const job = await this.requireJobProfile(jobPostId);
      return (await this.scoreCandidates(job, [candidateId], 1)).get(candidateId) ?? null;
    } catch (error) {
      this.logger.error("Outreach invitation scoring failed — saving invitation without score", {
        jobPostId,
        candidateId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /** Giai đoạn B. Id không còn hồ sơ bị bỏ khỏi Map kết quả. */
  private async scoreCandidates(
    job: JobMatchProfile,
    candidateIds: string[],
    maxNewEmbeddings: number,
  ): Promise<Map<string, MatchResult>> {
    const profiles = [...(await this.candidateMatchProfileLoader.loadMany(candidateIds)).values()];
    const similarities =
      this.mode === "hybrid"
        ? await this.matchEmbeddingService.similarityForCandidates(
            { id: job.jobPostId, text: job.matchText },
            profiles
              .filter((profile) => profile.skills.length > 0)
              .map((profile) => ({ id: profile.candidateId, text: profile.matchText })),
            maxNewEmbeddings,
          )
        : new Map<string, number | null>();
    return new Map(
      profiles.map((profile) => [
        profile.candidateId,
        this.score(profile, job, similarities.get(profile.candidateId) ?? null),
      ]),
    );
  }

  /** Cùng quy tắc với JobMatchingService.score. */
  private score(candidate: CandidateMatchProfile, job: JobMatchProfile, similarity: number | null): MatchResult {
    if (this.mode === "rule") {
      return this.ruleJobMatcher.match({ candidate, job, semanticSimilarity: null });
    }
    if (similarity === null) {
      return markSemanticPending(this.ruleJobMatcher.match({ candidate, job, semanticSimilarity: null }));
    }
    return this.hybridJobMatcher.match({ candidate, job, semanticSimilarity: similarity });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Q1/D4 — hạn mức lời mời/ngày theo gói của công ty. BLOCKED ⇒ 403 (dùng cả cho
   * tìm để không cho công ty hết quyền duyệt kho ứng viên).
   */
  private async resolveDailyQuota(employer: OutreachEmployer): Promise<number> {
    const access = await this.subscriptionsService.getCompanySubscriptionAccess(employer.company);
    if (access.mode === "BLOCKED") {
      throw new AppError(403, "Công ty cần có gói dịch vụ còn hiệu lực để tìm và mời ứng viên.");
    }
    if (access.mode === "TRIAL") return DEFAULT_OUTREACH_DAILY_QUOTA;
    // Summary của SubscriptionAccessStatus không mang hạn mức lời mời ⇒ đọc thẳng gói.
    const active = await this.companySubscriptionRepository.findActiveByCompany(employer.companyId);
    return active?.plan.outreachInvitationDailyQuota ?? DEFAULT_OUTREACH_DAILY_QUOTA;
  }

  private async requireEmployer(userId: string): Promise<OutreachEmployer> {
    const employer = await this.repository.findEmployerByUserId(userId);
    if (!employer) throw new AppError(404, "Employer profile not found");
    return employer;
  }

  /** Chỉ người đăng tin (jobPost.employerId) — tin của người khác trả 404 như không tồn tại. */
  private async requireOwnedJobPost(employer: OutreachEmployer, jobPostId: string): Promise<OutreachJobPost> {
    const jobPost = await this.repository.findJobPost(jobPostId);
    if (!jobPost || jobPost.employerId !== employer.id) throw new AppError(404, "Job post not found");
    return jobPost;
  }

  private async requireJobProfile(jobPostId: string): Promise<JobMatchProfile> {
    const profile = await this.jobMatchProfileLoader.load(jobPostId);
    if (!profile) throw new AppError(404, "Job post not found");
    return profile;
  }

  private async requireCandidateId(userId: string): Promise<string> {
    const candidateId = await this.repository.findCandidateIdByUserId(userId);
    if (!candidateId) throw new AppError(404, "Candidate profile not found");
    return candidateId;
  }
}

/** Q2 — chỉ tìm/mời cho tin đang PUBLISHED. */
function assertPublished(jobPost: OutreachJobPost): void {
  if (jobPost.status !== "PUBLISHED") {
    throw new AppError(409, "Chỉ tìm và mời ứng viên cho tin đang hiển thị.");
  }
}
