import type { OutreachInvitationSource, PrismaClient } from "@prisma/client";
import type {
  BulkInviteResponse,
  CandidateOutreachInvitationDto,
  CandidateSearchResultDto,
  CompanyOutreachInvitationDto,
  EmployerOutreachSummary,
  MatchResult,
  OutreachDailyQuotaStatus,
  OutreachInvitationAction,
  OutreachInviteSkipReason,
  OutreachJobSummary,
  OutreachSettings,
  PaginatedResponse,
  RespondOutreachInvitationResponse,
  SentOutreachInvitationDto,
} from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import type { CandidateMatchProfile, JobMatcher, JobMatchProfile } from "../../shared/ports/JobMatcher";
import type { EmployerIdentityCache } from "../employers/employer-identity-cache";
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
import {
  autoDailyLimit,
  hasDailyRoom,
  type CandidateOutreachRateLimitService,
  type OutreachDailyLimit,
} from "./candidate-outreach-rate-limit.service";
import {
  CANDIDATE_DAILY_INVITATION_CAP,
  DEFAULT_OUTREACH_DAILY_QUOTA,
  DEFAULT_POOL_MULTIPLIER,
  INVITATION_EXPIRY_DAYS,
  PREFILTER_LIMIT,
  TOP_RESULT_COUNT,
  TRIAL_OUTREACH_DAILY_QUOTA,
} from "./candidate-outreach.config";
import type { ListCompanyInvitationsQuery } from "./candidate-outreach.dto";
import {
  toCandidateOutreachInvitationDto,
  toCandidateSearchResultDto,
  toCompanyOutreachInvitationDto,
  toSentOutreachInvitationDto,
} from "./candidate-outreach.mapper";
import type {
  CandidateOutreachRepository,
  InvitationWithRelations,
  OutreachEmployer,
  OutreachJobPost,
} from "./candidate-outreach.repository";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hạn mức lời mời của công ty theo gói (AD-15 D4, AD-23 mục 4). Dùng thử chỉ mời
 * tay nên không có hệ số mời; muốn đọc `poolMultiplier` phải kiểm `autoAllowed` trước.
 */
export type OutreachQuotaPolicy =
  | { mode: "TRIAL"; dailyQuota: number; autoAllowed: false }
  | { mode: "SUBSCRIBED"; dailyQuota: number; autoAllowed: true; poolMultiplier: number };

/**
 * Lý do không tạo được lời mời (AD-23). Mời tay đổi thành AppError; mời hàng loạt và
 * tự động mời bỏ qua người đó, riêng QUOTA thì dừng hẳn.
 */
export type InvitationSkipReason = OutreachInviteSkipReason;

export type CreateInvitationResult =
  | { created: true; invitation: InvitationWithRelations }
  | { created: false; reason: InvitationSkipReason };

export interface CreateInvitationInput {
  /** Người đứng tên lời mời. Tự động mời dùng người đăng tin (AD-23 mục 9). */
  sender: { employerId: string; companyId: string; companyName: string };
  jobPost: Pick<OutreachJobPost, "id" | "title">;
  candidateId: string;
  source: OutreachInvitationSource;
  limit: OutreachDailyLimit;
  /**
   * Điểm đã chấm sẵn (tự động mời chấm cả pool trước khi chọn người). Bỏ trống thì chấm
   * lại riêng người này lúc gửi (D7).
   */
  match?: MatchResult | null | undefined;
}

/**
 * Tìm & mời ứng viên chưa ứng tuyển (B3, AD-15 — docs/06-backend/candidate-outreach/PLAN.md).
 * Chấm điểm tái dùng nguyên bộ chấm của Job Matcher và cùng quy tắc với
 * JobMatchingService: JOB_MATCHER_MODE=rule ⇒ rule-v1; hybrid mà thiếu cosine ⇒
 * rule-v1 kèm semantic PENDING — `weightsVersion` luôn nói đúng cấu hình đã chấm.
 */
export class CandidateOutreachService {
  private readonly prisma: PrismaClient;
  private readonly repository: CandidateOutreachRepository;
  private readonly employerIdentityCache: EmployerIdentityCache;
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
    employerIdentityCache,
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
    employerIdentityCache: EmployerIdentityCache;
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
    this.employerIdentityCache = employerIdentityCache;
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

    const [cards, expiredIds, receivedToday] = await Promise.all([
      this.repository.findSearchCards(topIds),
      this.repository.findExpiredInvitedCandidateIds(jobPost.id, topIds),
      this.repository.countReceivedTodayByCandidate(topIds),
    ]);
    // AD-23 — người đã nhận đủ lời mời hôm nay vẫn hiện, frontend làm mờ nút mời.
    return cards.map((card) =>
      toCandidateSearchResultDto(
        card,
        scores.get(card.candidateId)!,
        expiredIds.has(card.candidateId),
        (receivedToday.get(card.candidateId) ?? 0) >= CANDIDATE_DAILY_INVITATION_CAP,
      ),
    );
  }

  /** Danh sách "Đã mời" (D6): chỉ đọc ⇒ không đòi tin PUBLISHED hay công ty còn gói. */
  async listSentInvitations(userId: string, jobPostId: string): Promise<SentOutreachInvitationDto[]> {
    const employer = await this.requireEmployerIdentity(userId);
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

  /**
   * Trang "Lời mời" (docs/06-backend/outreach-hub/PLAN.md): hạn mức, kết quả 30 ngày và
   * tin kèm số lời mời — cấp công ty (Q1). Chỉ đọc ⇒ không đòi công ty còn gói.
   */
  async getCompanySummary(userId: string): Promise<EmployerOutreachSummary> {
    const employer = await this.requireEmployer(userId);
    const [quota, last30Days, countsByJob, jobs] = await Promise.all([
      this.getDailyQuotaStatus(employer),
      this.repository.countLast30Days(employer.companyId),
      this.repository.countByJobPost(employer.companyId),
      this.repository.findOutreachJobs(employer.companyId),
    ]);
    return {
      quota,
      last30Days: {
        sent: last30Days.total,
        accepted: last30Days.accepted,
        declined: last30Days.declined,
        pending: last30Days.pending,
      },
      jobs: jobs
        .map((job) => ({
          jobPostId: job.id,
          title: job.title,
          status: job.status,
          expiresAt: job.expiresAt ? job.expiresAt.toISOString() : null,
          isOwner: job.employerId === employer.id,
          invitations: countsByJob.get(job.id) ?? { total: 0, pending: 0, accepted: 0, declined: 0, expired: 0 },
        }))
        .sort(compareOutreachJobs),
    };
  }

  /** Mọi lời mời công ty đã gửi, mới nhất trước, phân trang cursor (Q1: `mine` chỉ là bộ lọc). */
  async listCompanyInvitations(
    userId: string,
    query: ListCompanyInvitationsQuery,
  ): Promise<PaginatedResponse<CompanyOutreachInvitationDto>> {
    const employer = await this.requireEmployerIdentity(userId);
    if (query.jobPostId) {
      const jobPost = await this.repository.findJobPost(query.jobPostId);
      if (!jobPost || jobPost.companyId !== employer.companyId) throw new AppError(404, "Job post not found");
    }
    if (query.cursor && !(await this.repository.isCompanyInvitation(employer.companyId, query.cursor))) {
      throw new AppError(400, "Invalid cursor");
    }

    // Lấy dư 1 dòng để biết còn trang sau mà không cần đếm.
    const ids = await this.repository.listCompanyInvitationIds(
      employer.companyId,
      {
        status: query.status,
        jobPostId: query.jobPostId,
        employerId: query.mine ? employer.id : undefined,
        afterId: query.cursor,
      },
      query.limit + 1,
    );
    const hasMore = ids.length > query.limit;
    const invitations = await this.repository.findManyByIds(ids.slice(0, query.limit));
    const candidateIds = [...new Set(invitations.map((invitation) => invitation.candidateId))];
    const [cards, accessible] = await Promise.all([
      this.repository.findSearchCards(candidateIds),
      this.repository.findProfileAccessibleCandidateIds(employer.companyId, candidateIds),
    ]);
    const cardById = new Map(cards.map((card) => [card.candidateId, card]));
    const now = new Date();
    const last = invitations[invitations.length - 1];
    return {
      items: invitations.map((invitation) =>
        toCompanyOutreachInvitationDto(
          invitation,
          cardById.get(invitation.candidateId) ?? null,
          accessible.has(invitation.candidateId),
          employer.id,
          now,
        ),
      ),
      hasMore,
      ...(hasMore && last ? { nextCursor: last.id } : {}),
    };
  }

  async invite(userId: string, jobPostId: string, candidateId: string): Promise<SentOutreachInvitationDto> {
    const employer = await this.requireEmployer(userId);
    const jobPost = await this.requireOwnedJobPost(employer, jobPostId);
    assertPublished(jobPost);
    const dailyQuota = await this.resolveDailyQuota(employer);

    const result = await this.createInvitation({
      sender: { employerId: employer.id, companyId: employer.companyId, companyName: employer.company.name },
      jobPost,
      candidateId,
      source: "MANUAL",
      limit: { daily: dailyQuota },
    });
    if (!result.created) throw inviteSkipError(result.reason, dailyQuota);

    const [card] = await this.repository.findSearchCards([candidateId]);
    // createInvitation vừa kiểm isOpenToOutreach = true ⇒ xem được hồ sơ.
    return toSentOutreachInvitationDto(result.invitation, card ?? null, true);
  }

  /**
   * "Mời tất cả gợi ý" (AD-23 mục 1a, bước 3). Client gửi đúng danh sách đang hiện ở
   * tab "Gợi ý"; server kiểm lại từng người bằng createInvitation (nguồn MANUAL), nên id
   * cũ hay id ngoài danh sách gợi ý cũng chỉ được mời nếu hợp lệ. Có ở mọi gói, kể cả
   * Dùng thử. Gửi lần lượt, không song song: cần dừng đúng lúc hết hạn mức.
   */
  async bulkInvite(userId: string, jobPostId: string, candidateIds: string[]): Promise<BulkInviteResponse> {
    const employer = await this.requireEmployer(userId);
    const jobPost = await this.requireOwnedJobPost(employer, jobPostId);
    assertPublished(jobPost);
    const dailyQuota = await this.resolveDailyQuota(employer);
    const limit: OutreachDailyLimit = { daily: dailyQuota };
    const ids = [...new Set(candidateIds)];

    const invited: InvitationWithRelations[] = [];
    const skipped: BulkInviteResponse["skipped"] = [];
    // Hết lượt từ đầu thì khỏi chấm điểm.
    const hasRoom = hasDailyRoom(await this.rateLimit.getUsage(employer.companyId), limit, "MANUAL");
    const scores = hasRoom ? await this.scoreManyForInvitation(jobPost.id, ids) : null;
    for (const [index, candidateId] of ids.entries()) {
      const result = hasRoom
        ? await this.createInvitation({
            sender: { employerId: employer.id, companyId: employer.companyId, companyName: employer.company.name },
            jobPost,
            candidateId,
            source: "MANUAL",
            limit,
            // Chấm lô lỗi ⇒ để createInvitation tự chấm từng người (D7).
            match: scores ? (scores.get(candidateId) ?? null) : undefined,
          })
        : ({ created: false, reason: "QUOTA" } as const);
      if (result.created) {
        invited.push(result.invitation);
        continue;
      }
      if (result.reason === "QUOTA") {
        skipped.push(...ids.slice(index).map((id) => ({ candidateId: id, reason: "QUOTA" as const })));
        break;
      }
      skipped.push({ candidateId, reason: result.reason });
    }

    const [cards, quota] = await Promise.all([
      this.repository.findSearchCards(invited.map((invitation) => invitation.candidateId)),
      this.getDailyQuotaStatus(employer),
    ]);
    const cardById = new Map(cards.map((card) => [card.candidateId, card]));
    return {
      // createInvitation vừa kiểm isOpenToOutreach = true ⇒ xem được hồ sơ.
      invited: invited.map((invitation) =>
        toSentOutreachInvitationDto(invitation, cardById.get(invitation.candidateId) ?? null, true),
      ),
      skipped,
      quota,
    };
  }

  /**
   * Tạo một lời mời — dùng chung cho mời tay, "Mời tất cả gợi ý" và tự động mời (AD-23)
   * để quy tắc không lệch giữa các đường. Không ném lỗi nghiệp vụ: trả lý do bỏ qua.
   * Không kiểm quyền với tin hay tin còn PUBLISHED — nơi gọi lo.
   *
   * Thứ tự: kiểm rẻ ngoài transaction (để báo lỗi sớm và không chấm điểm vô ích) → chấm
   * điểm (CPU, có thể tính embedding; không giữ khoá trong lúc này) → transaction: khoá
   * theo ứng viên, kiểm LẠI lời mời đang chặn và trần trong ngày dưới khoá, tạo lời mời
   * + thông báo → tăng bộ đếm hạn mức của công ty.
   */
  async createInvitation(input: CreateInvitationInput): Promise<CreateInvitationResult> {
    const { sender, jobPost, candidateId, source, limit } = input;
    const candidate = await this.repository.findCandidateForInvite(candidateId);
    if (!candidate) return skipped("NOT_FOUND");
    if (!candidate.isOpenToOutreach) return skipped("NOT_OPEN");
    const [applied, blocked, receivedToday, usage] = await Promise.all([
      this.repository.hasApplied(candidate.id, jobPost.id),
      this.repository.hasBlockingInvitation(candidate.id, jobPost.id),
      this.repository.countReceivedToday(candidate.id),
      this.rateLimit.getUsage(sender.companyId),
    ]);
    if (applied) return skipped("APPLIED");
    // Q4 — chỉ lời mời EXPIRED mới cho mời lại.
    if (blocked) return skipped("BLOCKED");
    if (receivedToday >= CANDIDATE_DAILY_INVITATION_CAP) return skipped("CANDIDATE_CAP");
    if (!hasDailyRoom(usage, limit, source)) return skipped("QUOTA");

    const match = input.match !== undefined ? input.match : await this.scoreForInvitation(jobPost.id, candidate.id);
    const result = await this.prisma.$transaction(async (tx): Promise<CreateInvitationResult> => {
      await this.repository.lockCandidate(candidate.id, tx);
      // Lượt mời khác (công ty khác, cron, tab khác) có thể vừa tạo lời mời trong lúc chấm điểm.
      if (await this.repository.hasBlockingInvitation(candidate.id, jobPost.id, tx)) return skipped("BLOCKED");
      if ((await this.repository.countReceivedToday(candidate.id, tx)) >= CANDIDATE_DAILY_INVITATION_CAP) {
        return skipped("CANDIDATE_CAP");
      }
      const created = await this.repository.create(
        {
          companyId: sender.companyId,
          employerId: sender.employerId,
          jobPostId: jobPost.id,
          candidateId: candidate.id,
          expiresAt: new Date(Date.now() + INVITATION_EXPIRY_DAYS * DAY_MS),
          matchScore: match?.score ?? null,
          matchWeightsVersion: match?.weightsVersion ?? null,
          source,
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
          companyName: sender.companyName,
          expiresAt: created.expiresAt,
        },
        tx,
      );
      return { created: true, invitation: created };
    });
    // Chỉ tính lượt khi lời mời đã được tạo.
    if (result.created) await this.rateLimit.recordUsage(sender.companyId, source);
    return result;
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

  /**
   * Như scoreForInvitation cho nhiều người: nạp tin một lần, tính embedding một lô.
   * Lỗi ⇒ null, nơi gọi để từng lời mời tự chấm lại.
   */
  private async scoreManyForInvitation(jobPostId: string, candidateIds: string[]): Promise<Map<string, MatchResult> | null> {
    try {
      const job = await this.requireJobProfile(jobPostId);
      return await this.scoreCandidates(job, candidateIds, MAX_NEW_EMBEDDINGS_PER_REQUEST);
    } catch (error) {
      this.logger.error("Bulk outreach scoring failed — scoring each invitation separately", {
        jobPostId,
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
   * Hạn mức lời mời hôm nay của công ty — chỉ đọc, dùng cho dashboard Employer (AD-16),
   * trang "Lời mời" và kết quả "Mời tất cả gợi ý". Kèm phần tự động (AD-23 mục 5).
   */
  async getDailyQuotaStatus(employer: Pick<OutreachEmployer, "companyId" | "company">): Promise<OutreachDailyQuotaStatus> {
    const quota = await this.lookupDailyQuota(employer);
    if (!quota) return { mode: "BLOCKED" };
    const [usage, sharePercent] = await Promise.all([
      this.rateLimit.getUsage(employer.companyId),
      quota.autoAllowed ? this.repository.findAutoSharePercent(employer.companyId) : Promise.resolve(0),
    ]);
    return {
      mode: quota.mode,
      dailyQuota: quota.dailyQuota,
      usedToday: usage.total,
      remainingToday: Math.max(0, quota.dailyQuota - usage.total),
      autoAllowed: quota.autoAllowed,
      autoLimitToday: quota.autoAllowed ? autoDailyLimit(quota.dailyQuota, sharePercent ?? 0) : 0,
      autoUsedToday: usage.auto,
    };
  }

  /**
   * Q1/D4 — hạn mức lời mời/ngày theo gói của công ty. BLOCKED ⇒ 403 (dùng cả cho
   * tìm để không cho công ty hết quyền duyệt kho ứng viên).
   */
  private async resolveDailyQuota(employer: OutreachEmployer): Promise<number> {
    const quota = await this.lookupDailyQuota(employer);
    if (!quota) {
      throw new AppError(403, "Công ty cần có gói dịch vụ còn hiệu lực để tìm và mời ứng viên.");
    }
    return quota.dailyQuota;
  }

  /**
   * null = BLOCKED (không có gói còn hiệu lực). AD-23: gói Dùng thử chỉ mời tay
   * (`autoAllowed = false`, không có hệ số mời); gói trả phí có tự động mời với hệ
   * số mời H của gói.
   */
  async lookupDailyQuota(employer: Pick<OutreachEmployer, "companyId" | "company">): Promise<OutreachQuotaPolicy | null> {
    const access = await this.subscriptionsService.getCompanySubscriptionAccess(employer.company);
    if (access.mode === "BLOCKED") return null;
    if (access.mode === "TRIAL") {
      return { mode: "TRIAL", dailyQuota: TRIAL_OUTREACH_DAILY_QUOTA, autoAllowed: false };
    }
    // Summary của SubscriptionAccessStatus không mang hạn mức lời mời ⇒ đọc thẳng gói.
    const active = await this.companySubscriptionRepository.findActiveByCompany(employer.companyId);
    return {
      mode: "SUBSCRIBED",
      dailyQuota: active?.plan.outreachInvitationDailyQuota ?? DEFAULT_OUTREACH_DAILY_QUOTA,
      autoAllowed: true,
      poolMultiplier: active?.plan.outreachPoolMultiplier ?? DEFAULT_POOL_MULTIPLIER,
    };
  }

  // AD-19: id lấy từ cache (0 câu DB) cho các API chỉ cần id.
  private async requireEmployerIdentity(userId: string): Promise<Pick<OutreachEmployer, "id" | "companyId">> {
    const { employerId, companyId } = await this.employerIdentityCache.require(userId);
    return { id: employerId, companyId };
  }

  // Cần company (hạn mức theo gói, tên công ty trong thông báo) ⇒ đọc mới nhất theo companyId.
  private async requireEmployer(userId: string): Promise<OutreachEmployer> {
    const employer = await this.requireEmployerIdentity(userId);
    const company = await this.repository.findOutreachCompany(employer.companyId);
    if (!company) throw new AppError(404, "Employer profile not found");
    return { ...employer, company };
  }

  /** Chỉ người đăng tin (jobPost.employerId) — tin của người khác trả 404 như không tồn tại. */
  private async requireOwnedJobPost(employer: Pick<OutreachEmployer, "id">, jobPostId: string): Promise<OutreachJobPost> {
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

/**
 * Q3 của trang "Lời mời": tin PUBLISHED trước (tìm / mời được), trong đó tin của người
 * xem trước, rồi hạn gần nhất (không có hạn xếp cuối); các tin còn lại theo tên.
 */
export function compareOutreachJobs(left: OutreachJobSummary, right: OutreachJobSummary): number {
  const leftPublished = left.status === "PUBLISHED";
  const rightPublished = right.status === "PUBLISHED";
  if (leftPublished !== rightPublished) return leftPublished ? -1 : 1;
  if (!leftPublished) return left.title.localeCompare(right.title, "vi");
  if (left.isOwner !== right.isOwner) return left.isOwner ? -1 : 1;
  if (left.expiresAt !== right.expiresAt) {
    if (left.expiresAt === null) return 1;
    if (right.expiresAt === null) return -1;
    return left.expiresAt < right.expiresAt ? -1 : 1;
  }
  return left.title.localeCompare(right.title, "vi");
}

function skipped(reason: InvitationSkipReason): CreateInvitationResult {
  return { created: false, reason };
}

/** Mời tay: lý do bỏ qua ⇒ lỗi HTTP, giữ nguyên mã và câu báo của AD-15. */
export function inviteSkipError(reason: InvitationSkipReason, dailyQuota: number): AppError {
  switch (reason) {
    case "NOT_FOUND":
      return new AppError(404, "Không tìm thấy ứng viên.");
    case "NOT_OPEN":
      return new AppError(403, "Ứng viên không cho phép nhà tuyển dụng tìm kiếm và mời.");
    case "APPLIED":
      return new AppError(409, "Ứng viên đã ứng tuyển tin này.");
    case "BLOCKED":
      return new AppError(409, "Ứng viên đã được mời cho tin này.");
    case "CANDIDATE_CAP":
      return new AppError(409, "Ứng viên đã nhận đủ lời mời trong hôm nay. Bạn mời lại được từ 7h sáng mai.");
    case "QUOTA":
      return new AppError(
        429,
        `Công ty đã gửi đủ ${dailyQuota} lời mời trong hôm nay. Hạn mức được làm mới vào 7h sáng mai.`,
      );
  }
}

/** Q2 — chỉ tìm/mời cho tin đang PUBLISHED. */
function assertPublished(jobPost: OutreachJobPost): void {
  if (jobPost.status !== "PUBLISHED") {
    throw new AppError(409, "Chỉ tìm và mời ứng viên cho tin đang hiển thị.");
  }
}
