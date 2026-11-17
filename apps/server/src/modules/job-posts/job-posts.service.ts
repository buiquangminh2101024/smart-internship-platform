
import type {
  Company,
  JobPostStatus,
  JobPostType,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import type {
  CreateJobPostRequest,
  EmployerJobPostListQuery,
  JobPost as JobPostDto,
  JobPostAttentionSummary,
  JobPostSearchQuery,
  JobPostStats,
  PaginatedResponse,
  SubmitJobPostResponse,
  UpdateJobPostRequest,
} from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import { parseOffsetCursor } from "../../shared/utils/offset-cursor";
import type { AuditLogService } from "../audit-log/audit-log.service";
import type { AutoOutreachTrigger } from "../candidate-outreach/auto-outreach.service";
import type { CompanyRepository } from "../companies/company.repository";
import type { EmployerRepository } from "../employers/employer.repository";
import type { EmployerIdentity, EmployerIdentityCache } from "../employers/employer-identity-cache";
import type { MatchScoreRepository } from "../match-scores/match-score.repository";
import type { MatchScoreTrigger } from "../match-scores/match-score.service";
import type { NotificationPayloadMap } from "../notifications/notification.types";
import type { NotificationsService } from "../notifications/notifications.service";
import type { SubscriptionsService } from "../subscriptions/subscriptions.service";
import type { UserRepository } from "../users/user.repository";
import { toJobPostDto } from "./job-post.mapper";
import {
  JOB_POST_PAGE_SIZE,
  type JobPostRepository,
  type JobPostWithRelations,
  type JobPostWriteData,
} from "./job-post.repository";

// Employer tự chọn ngày hết hạn nhưng không quá 90 ngày kể từ lúc đặt —
// quyết định chốt khi lên kế hoạch Phase 6 (xem
// docs/06-backend/phase-06-job-recruitment/PLAN.md mục "Quyết định mới chốt").
const MAX_EXPIRY_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

type CompanyQuotaTarget = Pick<Company, "id" | "verifiedAt">;

export class JobPostsService {
  private readonly prisma: PrismaClient;
  private readonly jobPostRepository: JobPostRepository;
  private readonly employerRepository: EmployerRepository;
  private readonly employerIdentityCache: EmployerIdentityCache;
  private readonly companyRepository: CompanyRepository;
  private readonly subscriptionsService: SubscriptionsService;
  private readonly notificationsService: NotificationsService;
  private readonly userRepository: UserRepository;
  private readonly auditLogService: AuditLogService;
  private readonly autoOutreachTrigger: AutoOutreachTrigger;
  private readonly matchScoreTrigger: MatchScoreTrigger;
  private readonly matchScoreRepository: MatchScoreRepository;

  constructor({
    prisma,
    jobPostRepository,
    employerRepository,
    employerIdentityCache,
    companyRepository,
    subscriptionsService,
    notificationsService,
    userRepository,
    auditLogService,
    autoOutreachTrigger,
    matchScoreTrigger,
    matchScoreRepository,
  }: {
    prisma: PrismaClient;
    jobPostRepository: JobPostRepository;
    employerRepository: EmployerRepository;
    employerIdentityCache: EmployerIdentityCache;
    companyRepository: CompanyRepository;
    subscriptionsService: SubscriptionsService;
    notificationsService: NotificationsService;
    userRepository: UserRepository;
    auditLogService: AuditLogService;
    autoOutreachTrigger: AutoOutreachTrigger;
    matchScoreTrigger: MatchScoreTrigger;
    matchScoreRepository: MatchScoreRepository;
  }) {
    this.prisma = prisma;
    this.jobPostRepository = jobPostRepository;
    this.employerRepository = employerRepository;
    this.employerIdentityCache = employerIdentityCache;
    this.companyRepository = companyRepository;
    this.subscriptionsService = subscriptionsService;
    this.notificationsService = notificationsService;
    this.userRepository = userRepository;
    this.auditLogService = auditLogService;
    this.autoOutreachTrigger = autoOutreachTrigger;
    this.matchScoreTrigger = matchScoreTrigger;
    this.matchScoreRepository = matchScoreRepository;
  }

  // ─── Public (Guest) ──────────────────────────────────────────────────────

  /**
   * Tìm kiếm công khai. `viewerUserId` chỉ truyền khi người xem đăng nhập vai trò ứng viên
   * (AD-26 D5): mỗi tin có thêm `viewer`, và được dùng `sort=match` / `minMatch`. Khách
   * (và vai trò khác) đi đúng đường cũ, chỉ thêm `total` và các bộ lọc mới.
   */
  async search(query: JobPostSearchQuery, viewerUserId?: string): Promise<PaginatedResponse<JobPostDto>> {
    const { cursor, sort, minMatch, ...filter } = query;
    const candidateIdPromise = viewerUserId ? this.findCandidateId(viewerUserId) : Promise.resolve(null);

    if (viewerUserId && (sort === "match" || minMatch !== undefined)) {
      const [candidateId, ids] = await Promise.all([
        candidateIdPromise,
        this.jobPostRepository.findPublishedIdsForSearch(filter),
      ]);
      if (candidateId) return this.searchByMatch(candidateId, ids, { sort, minMatch, cursor });
    }

    const [candidateId, page] = await Promise.all([
      candidateIdPromise,
      this.jobPostRepository.findPublishedForSearch(filter, cursor),
    ]);
    const result = { ...this.toPage(page, { publicOnly: true }), total: page.total };
    if (!candidateId) return result;
    return { ...result, items: await this.attachViewer(candidateId, result.items) };
  }

  /**
   * Đường theo điểm (AD-26 D5): ghép điểm lưu của ứng viên vào mọi id qua bộ lọc, lọc
   * `minMatch`, sắp điểm cao trước (tin chưa có điểm xếp cuối, hoà thì giữ thứ tự mới đăng),
   * rồi phân trang offset. Cursor của đường này là offset, khác cursor theo id của đường cũ.
   */
  private async searchByMatch(
    candidateId: string,
    ids: string[],
    options: {
      sort: JobPostSearchQuery["sort"] | undefined;
      minMatch: JobPostSearchQuery["minMatch"] | undefined;
      cursor: string | undefined;
    },
  ): Promise<PaginatedResponse<JobPostDto>> {
    const offset = parseOffsetCursor(options.cursor);
    const scores = await this.matchScoreRepository.scoresForCandidate(candidateId, ids);
    const minMatch = options.minMatch;
    const passing = minMatch === undefined ? ids : ids.filter((id) => (scores.get(id) ?? -1) >= minMatch);
    // Array.prototype.sort ổn định ⇒ hoà điểm giữ thứ tự mới đăng của `ids`.
    const ordered =
      options.sort === "match"
        ? [...passing].sort((left, right) => (scores.get(right) ?? -1) - (scores.get(left) ?? -1))
        : passing;

    const pageIds = ordered.slice(offset, offset + JOB_POST_PAGE_SIZE);
    const [rows, state] = await Promise.all([
      this.jobPostRepository.findManyWithRelationsByIds(pageIds),
      this.jobPostRepository.findViewerState(candidateId, pageIds),
    ]);
    const nextOffset = offset + pageIds.length;
    const hasMore = nextOffset < ordered.length;
    return {
      items: rows.map((row) => ({
        ...toJobPostDto(row, { publicOnly: true }),
        viewer: {
          matchScore: scores.get(row.id) ?? null,
          saved: state.saved.has(row.id),
          applied: state.applied.has(row.id),
        },
      })),
      hasMore,
      ...(hasMore ? { nextCursor: String(nextOffset) } : {}),
      total: ordered.length,
    };
  }

  /** Điểm lưu / đã lưu / đã ứng tuyển cho các tin của trang — ba câu đọc chạy song song. */
  private async attachViewer(candidateId: string, items: JobPostDto[]): Promise<JobPostDto[]> {
    const ids = items.map((item) => item.id);
    const [scores, state] = await Promise.all([
      this.matchScoreRepository.scoresForCandidate(candidateId, ids),
      this.jobPostRepository.findViewerState(candidateId, ids),
    ]);
    return items.map((item) => ({
      ...item,
      viewer: {
        matchScore: scores.get(item.id) ?? null,
        saved: state.saved.has(item.id),
        applied: state.applied.has(item.id),
      },
    }));
  }

  private async findCandidateId(userId: string): Promise<string | null> {
    const candidate = await this.prisma.candidate.findUnique({ where: { userId }, select: { id: true } });
    return candidate?.id ?? null;
  }

  /** Chi tiết công khai — chỉ tin PUBLISHED, mỗi lượt xem tăng viewCount. */
  async getPublicDetail(id: string): Promise<JobPostDto> {
    const jobPost = await this.requireJobPost(id);
    if (jobPost.status !== "PUBLISHED") {
      throw new AppError(404, "Job post not found");
    }
    await this.jobPostRepository.incrementViewCount(id);
    return toJobPostDto({ ...jobPost, viewCount: jobPost.viewCount + 1 }, { publicOnly: true });
  }

  // ─── Employer ────────────────────────────────────────────────────────────

  async listOwn(userId: string, query: EmployerJobPostListQuery): Promise<PaginatedResponse<JobPostDto>> {
    const { companyId, employerId } = await this.requireEmployer(userId);
    const { cursor, attention, ...filter } = query;
    const page = await this.jobPostRepository.findOwnedByCompany(
      companyId,
      { ...filter, attention: attention === "1" },
      cursor,
    );
    // Danh sách gồm tin của cả công ty; `isOwner` cho frontend biết tin nào người xem tìm / mời được.
    const ownerOf = new Map(page.items.map((item) => [item.id, item.employerId === employerId]));
    const paged = this.toPage(page);
    const result = { ...paged, items: paged.items.map((item) => ({ ...item, isOwner: ownerOf.get(item.id) === true })) };
    // Số Phù hợp (0.3 bước 6): một câu gộp cho các tin PUBLISHED trong trang. Tin đã quá
    // hạn nhưng chưa đóng không có trong Map nên cũng không có trường này.
    const publishedIds = page.items.filter((item) => item.status === "PUBLISHED").map((item) => item.id);
    if (publishedIds.length === 0) return result;
    const matched = await this.matchScoreRepository.matchedCounts(publishedIds);
    return {
      ...result,
      items: result.items.map((item) => {
        const count = matched.get(item.id);
        return count === undefined ? item : { ...item, matchedCount: count };
      }),
    };
  }

  async ownStats(userId: string): Promise<JobPostStats> {
    const { companyId } = await this.requireEmployer(userId);
    return this.countStats({ companyId });
  }

  /** Dùng bởi dashboard (AD-16): cùng điều kiện với `listOwn({ attention: "1" })`. */
  async attentionSummaryForCompany(companyId: string): Promise<JobPostAttentionSummary> {
    const { rejected, expiringIn7Days } = await this.jobPostRepository.countAttention(companyId);
    return { total: rejected + expiringIn7Days, rejected, expiringIn7Days };
  }

  async getOwn(userId: string, id: string): Promise<JobPostDto> {
    const { companyId, employerId } = await this.requireEmployer(userId);
    const jobPost = await this.requireOwnedJobPost(companyId, id);
    return { ...toJobPostDto(jobPost), isOwner: jobPost.employerId === employerId };
  }

  async createDraft(userId: string, dto: CreateJobPostRequest): Promise<JobPostDto> {
    const { company, employer } = await this.requireVerifiedCompany(userId);
    await this.requireCreateQuota(company);
    await this.assertRelationIdsExist(dto);

    // Tạo tin và ghi kỹ năng/ngành cùng một transaction: lỗi giữa chừng thì
    // không để lại tin nháp mồ côi (tin nháp tính vào quota tạo tin).
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await this.jobPostRepository.create(
        {
          companyId: company.id,
          employerId: employer.employerId,
          status: "DRAFT",
          ...this.toWriteData(dto),
          title: dto.title,
          description: dto.description,
          jobType: dto.jobType,
        },
        tx,
      );
      await this.writeRelations(row.id, dto, tx);
      return row;
    });

    if (dto.skillIds || dto.majors) {
      return toJobPostDto(await this.requireJobPost(created.id));
    }
    return toJobPostDto(created);
  }

  /** Chỉ sửa được khi còn DRAFT — tin đã gửi duyệt/đang hiển thị là bất biến. */
  async updateDraft(userId: string, id: string, dto: UpdateJobPostRequest): Promise<JobPostDto> {
    const { companyId } = await this.requireEmployer(userId);
    const jobPost = await this.requireOwnedJobPost(companyId, id);
    if (jobPost.status !== "DRAFT" && jobPost.status !== "PUBLISHED") {
      throw new AppError(409, "Only draft or published job posts can be edited");
    }

    if (jobPost.status === "PUBLISHED") {
      if (dto.title !== undefined && dto.title.trim() !== jobPost.title) {
        throw new AppError(400, "Cannot change the title of an already published job post");
      }

      if (jobPost.company.requiresApproval) {
        const isDescChanged = dto.description !== undefined && dto.description.trim() !== jobPost.description.trim();
        const isReqChanged = dto.requirements !== undefined && dto.requirements.trim() !== (jobPost.requirements ?? "").trim();
        const isJobTypeChanged = dto.jobType !== undefined && dto.jobType !== jobPost.jobType;
        const isIndustryChanged = dto.industryId !== undefined && (dto.industryId || null) !== jobPost.industryId;
        const isCityChanged = dto.cityId !== undefined && (dto.cityId || null) !== jobPost.cityId;
        const isExpChanged = dto.minExperienceYears !== undefined && (dto.minExperienceYears || null) !== jobPost.minExperienceYears;

        let isSkillsChanged = false;
        if (dto.skillIds !== undefined) {
          const currentSkillIds = new Set(jobPost.skills.map((s) => s.skillId));
          if (dto.skillIds.length !== currentSkillIds.size || !dto.skillIds.every((sId) => currentSkillIds.has(sId))) {
            isSkillsChanged = true;
          }
        }

        let isMajorsChanged = false;
        if (dto.majors !== undefined) {
          const currentMajorIds = new Set(jobPost.majors.map((m) => m.majorId));
          if (dto.majors.length !== currentMajorIds.size || !dto.majors.every((m) => currentMajorIds.has(m.majorId))) {
            isMajorsChanged = true;
          }
        }

        if (isDescChanged || isReqChanged || isJobTypeChanged || isIndustryChanged || isCityChanged || isExpChanged || isSkillsChanged || isMajorsChanged) {
          throw new AppError(
            400,
            "Published job posts only allow updating deadline, salary, benefits, and address. To change core requirements, please create a new job post.",
          );
        }
      }
    }

    await this.assertRelationIdsExist(dto);

    // skillIds nằm ở bảng nối nên phải ghi riêng, không đi qua JobPostWriteData.
    // undefined = form không đụng tới kỹ năng; mảng rỗng = cố ý xoá hết.
    // preferredSkillIds chỉ được ghi cùng skillIds (một khối) — client cũ chỉ
    // gửi skillIds sẽ xoá kỹ năng ưu tiên đã có (PLAN Job Matcher GĐ1 #6).
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await this.jobPostRepository.update(id, this.toWriteData(dto), tx);
      await this.writeRelations(id, dto, tx);
      return row;
    });

    if (jobPost.status === "PUBLISHED") {
      this.matchScoreTrigger?.(id);
    }

    if (dto.skillIds || dto.majors) {
      return toJobPostDto(await this.requireJobPost(id));
    }
    return toJobPostDto(updated);
  }

  /**
   * Kiểm id kỹ năng/ngành TRƯỚC khi ghi tin: sai thì 400 và chưa ghi gì.
   * Kỹ năng: mọi trạng thái trong catalog; ngành: chỉ APPROVED
   * (docs/06-backend/major-merge-fix/PLAN.md, M3).
   */
  private async assertRelationIdsExist(dto: UpdateJobPostRequest): Promise<void> {
    const skillIds = dto.skillIds ? [...new Set([...dto.skillIds, ...(dto.preferredSkillIds ?? [])])] : [];
    const majorIds = dto.majors?.map((major) => major.majorId) ?? [];
    const [existingSkills, existingMajors] = await Promise.all([
      this.jobPostRepository.findExistingSkillIds(skillIds),
      this.jobPostRepository.findExistingMajorIds(majorIds),
    ]);
    if (existingSkills.size !== skillIds.length) {
      throw new AppError(400, "One or more skills do not exist");
    }
    if (existingMajors.size !== majorIds.length) {
      throw new AppError(400, "One or more majors do not exist");
    }
  }

  /** Kỹ năng (kèm số năm) và ngành nằm ở bảng nối — ghi riêng, trong transaction của nơi gọi. */
  private async writeRelations(jobPostId: string, dto: UpdateJobPostRequest, tx: Prisma.TransactionClient): Promise<void> {
    if (dto.skillIds) {
      await this.jobPostRepository.setSkills(
        jobPostId,
        this.toSkillRows(dto.skillIds, dto.preferredSkillIds, dto.skillMinYears),
        tx,
      );
    }
    if (dto.majors) {
      await this.jobPostRepository.setMajors(jobPostId, dto.majors, tx);
    }
  }

  /** Hard delete, chỉ cho DRAFT — tin nháp chưa từng công khai nên không có hồ sơ ứng tuyển/hội thoại. */
  async deleteDraft(userId: string, id: string): Promise<void> {
    const { companyId } = await this.requireEmployer(userId);
    const jobPost = await this.requireOwnedJobPost(companyId, id);
    if (jobPost.status !== "DRAFT") {
      throw new AppError(409, "Only a draft job post can be deleted");
    }

    await this.jobPostRepository.delete(id);
  }

  /**
   * DRAFT → PENDING, hoặc publish thẳng khi company.requiresApproval=false
   * (ghi log APPROVED với actor=null để phân biệt với Admin duyệt tay) — xem
   * INITIAL_ARCHITECTURE_PLAN.md §12.
   */
  async submitForApproval(userId: string, id: string): Promise<SubmitJobPostResponse> {
    const { company } = await this.requireVerifiedCompany(userId);
    const jobPost = await this.requireOwnedJobPost(company.id, id);
    if (jobPost.status !== "DRAFT") {
      throw new AppError(409, "Only a draft job post can be submitted for approval");
    }
    this.assertReadyForSubmission(jobPost);
    await this.requirePublishQuota(company);

    const autoPublished = !company.requiresApproval;
    const updated = await this.prisma.$transaction(async (tx) => {
      // L28: đếm trước khi thêm dòng SUBMITTED mới. Tin bị từ chối quay về DRAFT
      // nên trạng thái không cho biết đây là lần gửi đầu hay gửi lại.
      const resubmit = (await this.jobPostRepository.countModerationActions(id, "SUBMITTED", tx)) > 0;
      await this.jobPostRepository.createModerationAction({ jobPostId: id, action: "SUBMITTED", actorId: userId }, tx);
      if (!autoPublished) {
        const pending = await this.jobPostRepository.update(id, { status: "PENDING" }, tx);
        // AD-12 — company.requiresApproval=true: Admin cần biết có tin chờ duyệt.
        const adminIds = await this.userRepository.findAdminIds(tx);
        await this.notificationsService.notifyMany(
          "JOB_POST_SUBMITTED",
          adminIds,
          { jobPostId: id, jobPostTitle: jobPost.title, companyName: company.name },
          tx,
        );
        await this.auditLogService.record(
          {
            actorId: userId,
            actorRole: "EMPLOYER",
            action: "JOB_POST_SUBMITTED",
            entityType: "JobPost",
            entityId: id,
            summary: `${company.name} gửi duyệt tin "${jobPost.title}"`,
            metadata: { resubmit },
          },
          tx,
        );
        return pending;
      }
      await this.jobPostRepository.createModerationAction({ jobPostId: id, action: "APPROVED", actorId: null }, tx);
      await this.auditLogService.record(
        {
          actorId: userId,
          actorRole: "EMPLOYER",
          action: "JOB_POST_AUTO_PUBLISHED",
          entityType: "JobPost",
          entityId: id,
          summary: `${company.name} đăng tin "${jobPost.title}" (công ty không cần duyệt tin)`,
          metadata: { resubmit },
        },
        tx,
      );
      return this.jobPostRepository.update(id, { status: "PUBLISHED", publishedAt: new Date() }, tx);
    });

    // AD-23 — tin vừa hiển thị và đã bật tự mời (đặt lúc tạo tin) ⇒ mời ngay, không chờ.
    if (autoPublished && updated.autoOutreachEnabled) this.autoOutreachTrigger(updated.companyId);
    // AD-24 — mọi tin vừa hiển thị: chấm bảng điểm lưu sẵn ngay, không chờ job đêm.
    if (autoPublished) this.matchScoreTrigger(updated.id);
    return { jobPost: toJobPostDto(updated), autoPublished };
  }

  /** PUBLISHED → CLOSED. Hành động của chính Employer nên KHÔNG ghi moderation log. */
  async close(userId: string, id: string): Promise<JobPostDto> {
    const { companyId } = await this.requireEmployer(userId);
    const jobPost = await this.requireOwnedJobPost(companyId, id);
    if (jobPost.status !== "PUBLISHED") {
      throw new AppError(409, "Only a published job post can be closed");
    }

    const updated = await this.jobPostRepository.update(id, { status: "CLOSED", closedAt: new Date() });
    return toJobPostDto(updated);
  }

  // ─── Admin ───────────────────────────────────────────────────────────────

  async listForModeration(
    status: JobPostStatus | undefined,
    cursor: string | undefined,
  ): Promise<PaginatedResponse<JobPostDto>> {
    const page = await this.jobPostRepository.findModerationQueue(status, cursor);
    return this.toPage(page);
  }

  async moderationStats(): Promise<JobPostStats> {
    return this.countStats({});
  }

  async getForModeration(id: string): Promise<JobPostDto> {
    return toJobPostDto(await this.requireJobPost(id));
  }

  async approve(actorId: string, id: string): Promise<JobPostDto> {
    const jobPost = await this.requireJobPost(id);
    if (jobPost.status !== "PENDING") {
      throw new AppError(409, "Only a pending job post can be approved");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.jobPostRepository.createModerationAction({ jobPostId: id, action: "APPROVED", actorId }, tx);
      const result = await this.jobPostRepository.update(id, { status: "PUBLISHED", publishedAt: new Date() }, tx);
      await this.notifyCompanyEmployers(jobPost.companyId, "JOB_POST_APPROVED", { jobPostId: id, jobPostTitle: jobPost.title }, tx);
      await this.auditLogService.record(
        {
          actorId,
          actorRole: "ADMIN",
          action: "JOB_POST_APPROVED",
          entityType: "JobPost",
          entityId: id,
          summary: `Duyệt tin "${jobPost.title}" của ${jobPost.company.name}`,
        },
        tx,
      );
      return result;
    });
    // AD-23 — như submitForApproval khi tự đăng: chạy sau khi transaction đã commit.
    if (updated.autoOutreachEnabled) this.autoOutreachTrigger(updated.companyId);
    this.matchScoreTrigger(updated.id);
    return toJobPostDto(updated);
  }

  /** PENDING → DRAFT kèm lý do, để Employer sửa lại rồi gửi duyệt lần nữa. */
  async reject(actorId: string, id: string, reason: string): Promise<JobPostDto> {
    const jobPost = await this.requireJobPost(id);
    if (jobPost.status !== "PENDING") {
      throw new AppError(409, "Only a pending job post can be rejected");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.jobPostRepository.createModerationAction({ jobPostId: id, action: "REJECTED", actorId, reason }, tx);
      const result = await this.jobPostRepository.update(id, { status: "DRAFT" }, tx);
      await this.notifyCompanyEmployers(
        jobPost.companyId,
        "JOB_POST_REJECTED",
        { jobPostId: id, jobPostTitle: jobPost.title, reason },
        tx,
      );
      await this.auditLogService.record(
        {
          actorId,
          actorRole: "ADMIN",
          action: "JOB_POST_REJECTED",
          entityType: "JobPost",
          entityId: id,
          summary: `Từ chối tin "${jobPost.title}" của ${jobPost.company.name}`,
          metadata: { reason },
        },
        tx,
      );
      return result;
    });
    return toJobPostDto(updated);
  }

  /**
   * PUBLISHED → TAKEN_DOWN kèm lý do. Mỗi lần thu hồi được đếm vào
   * CompanyRepository.countRetractions() (Phase 4) — cơ sở để Admin bật
   * requiresApproval cho company hay tái phạm (INITIAL_ARCHITECTURE_PLAN.md §12).
   */
  async retract(actorId: string, id: string, reason: string): Promise<JobPostDto> {
    const jobPost = await this.requireJobPost(id);
    if (jobPost.status !== "PUBLISHED") {
      throw new AppError(409, "Only a published job post can be retracted");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.jobPostRepository.createModerationAction({ jobPostId: id, action: "RETRACTED", actorId, reason }, tx);
      const result = await this.jobPostRepository.update(id, { status: "TAKEN_DOWN" }, tx);
      await this.notifyCompanyEmployers(
        jobPost.companyId,
        "JOB_POST_TAKEN_DOWN",
        { jobPostId: id, jobPostTitle: jobPost.title, reason },
        tx,
      );
      await this.auditLogService.record(
        {
          actorId,
          actorRole: "ADMIN",
          action: "JOB_POST_RETRACTED",
          entityType: "JobPost",
          entityId: id,
          summary: `Gỡ tin "${jobPost.title}" của ${jobPost.company.name}`,
          metadata: { reason },
        },
        tx,
      );
      return result;
    });
    return toJobPostDto(updated);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async notifyCompanyEmployers<T extends "JOB_POST_APPROVED" | "JOB_POST_REJECTED" | "JOB_POST_TAKEN_DOWN">(
    companyId: string,
    type: T,
    data: NotificationPayloadMap[T],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const employers = await this.employerRepository.findManyByCompanyId(companyId, tx);
    await this.notificationsService.notifyMany(type, employers.map((employer) => employer.userId), data, tx);
  }


  private toPage(
    page: { items: JobPostWithRelations[]; hasMore: boolean; nextCursor?: string },
    options?: { publicOnly?: boolean },
  ) {
    return {
      items: page.items.map((item) => toJobPostDto(item, options)),
      hasMore: page.hasMore,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  }

  private async countStats(where: { companyId?: string }): Promise<JobPostStats> {
    const [published, pending, draft, closed] = await Promise.all([
      this.jobPostRepository.countByStatus({ ...where, status: "PUBLISHED" }),
      this.jobPostRepository.countByStatus({ ...where, status: "PENDING" }),
      this.jobPostRepository.countByStatus({ ...where, status: "DRAFT" }),
      this.jobPostRepository.countByStatus({ ...where, status: { in: ["CLOSED", "EXPIRED", "TAKEN_DOWN"] } }),
    ]);
    return { published, pending, draft, closed };
  }

  private toWriteData(dto: UpdateJobPostRequest): JobPostWriteData {
    const data: JobPostWriteData = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.jobType !== undefined) data.jobType = dto.jobType;
    if (dto.industryId !== undefined) data.industryId = dto.industryId || null;
    if (dto.cityId !== undefined) data.cityId = dto.cityId || null;
    if (dto.address !== undefined) data.address = dto.address || null;
    if (dto.requirements !== undefined) data.requirements = dto.requirements || null;
    if (dto.benefits !== undefined) data.benefits = dto.benefits || null;

    if (dto.isNegotiable !== undefined) data.isNegotiable = dto.isNegotiable;
    // "Thỏa thuận" và khoảng lương loại trừ nhau trên form — xóa số cũ để tin
    // đã lưu nháp không còn hiển thị lẫn lộn cả hai.
    if (dto.isNegotiable) {
      data.salaryMin = null;
      data.salaryMax = null;
    } else {
      if (dto.salaryMin !== undefined) data.salaryMin = dto.salaryMin;
      if (dto.salaryMax !== undefined) data.salaryMax = dto.salaryMax;
    }
    if (data.salaryMin != null && data.salaryMax != null && data.salaryMin > data.salaryMax) {
      throw new AppError(400, "Minimum salary cannot be greater than maximum salary");
    }

    // 0 và null cùng nghĩa "không yêu cầu" — lưu null để Job Matcher chỉ phải xét một trường hợp.
    if (dto.minExperienceYears !== undefined) data.minExperienceYears = dto.minExperienceYears || null;

    if (dto.expiresAt !== undefined) {
      const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
      if (expiresAt) {
        if (Number.isNaN(expiresAt.getTime())) {
          throw new AppError(400, "Invalid application deadline");
        }
        this.assertExpiryWithinLimit(expiresAt);
      }
      data.expiresAt = expiresAt;
    }

    return data;
  }

  /**
   * skillIds → REQUIRED, preferredSkillIds → PREFERRED; trùng ở cả hai thì REQUIRED thắng.
   * Kỹ năng không có trong `skillMinYears` giữ số năm đang lưu (minYears undefined).
   */
  private toSkillRows(
    skillIds: string[],
    preferredSkillIds: string[] | undefined,
    skillMinYears: Record<string, number | null> | undefined,
  ): { skillId: string; importance: "REQUIRED" | "PREFERRED"; minYears?: number | null }[] {
    const required = new Set(skillIds);
    const preferred = new Set((preferredSkillIds ?? []).filter((skillId) => !required.has(skillId)));
    const withYears = (skillId: string, importance: "REQUIRED" | "PREFERRED") =>
      skillMinYears && skillId in skillMinYears
        ? { skillId, importance, minYears: skillMinYears[skillId] || null }
        : { skillId, importance };
    return [
      ...[...required].map((skillId) => withYears(skillId, "REQUIRED")),
      ...[...preferred].map((skillId) => withYears(skillId, "PREFERRED")),
    ];
  }

  /**
   * Bộ ràng buộc "đủ thông tin để công khai" — chỉ áp dụng khi gửi duyệt,
   * không áp dụng lúc lưu nháp (createDraft/updateDraft vẫn chỉ cần
   * title+description). Đồng bộ với validate phía frontend ở JobPostForm.
   */
  private assertReadyForSubmission(jobPost: JobPostWithRelations): void {
    if (!jobPost.expiresAt) {
      throw new AppError(400, "An application deadline is required before submitting a job post");
    }
    this.assertExpiryWithinLimit(jobPost.expiresAt);
    if (!jobPost.industryId) {
      throw new AppError(400, "An industry is required before submitting a job post");
    }
    if (!jobPost.cityId) {
      throw new AppError(400, "A city is required before submitting a job post");
    }
    if (!jobPost.address) {
      throw new AppError(400, "A work address is required before submitting a job post");
    }
    if (!jobPost.isNegotiable && jobPost.salaryMin == null && jobPost.salaryMax == null) {
      throw new AppError(400, "A salary range or the negotiable option is required before submitting a job post");
    }
    if (jobPost.skills.length === 0) {
      throw new AppError(400, "At least one skill is required before submitting a job post");
    }
  }

  private assertExpiryWithinLimit(expiresAt: Date): void {
    const now = Date.now();
    if (expiresAt.getTime() <= now) {
      throw new AppError(400, "The application deadline must be in the future");
    }
    if (expiresAt.getTime() > now + MAX_EXPIRY_DAYS * DAY_MS) {
      throw new AppError(400, `The application deadline cannot be more than ${MAX_EXPIRY_DAYS} days from today`);
    }
  }

  /**
   * Quota TẠO tin mới.
   * - TRIAL: hạn mức nháp riêng (draftRemaining), tách khỏi hạn mức publish.
   * - SUBSCRIBED: quota gói đếm theo SỐ TIN TẠO trong kỳ → publishRemaining.
   * - BLOCKED không kèm số dư (chưa xác minh / hết hạn trial / hết gói): chặn.
   */
  private async requireCreateQuota(company: CompanyQuotaTarget): Promise<void> {
    const access = await this.subscriptionsService.getCompanySubscriptionAccess(company);
    const remaining = access.draftRemaining ?? access.publishRemaining;
    if (remaining === undefined || remaining <= 0) {
      throw new AppError(403, this.quotaMessage(access.mode, "create a new job post"));
    }
  }

  /**
   * Quota ĐƯA TIN RA CÔNG KHAI (gửi duyệt hoặc publish thẳng).
   * - SUBSCRIBED: quota đã bị trừ lúc tạo tin nên không trừ lần hai, chỉ cần
   *   gói còn hiệu lực.
   * - TRIAL/BLOCKED: dựa vào publishRemaining (hạn mức publish miễn phí).
   */
  private async requirePublishQuota(company: CompanyQuotaTarget): Promise<void> {
    const access = await this.subscriptionsService.getCompanySubscriptionAccess(company);
    if (access.mode === "SUBSCRIBED") return;
    if (!access.publishRemaining) {
      throw new AppError(403, this.quotaMessage(access.mode, "publish a job post"));
    }
  }

  private quotaMessage(mode: string, action: string): string {
    return mode === "BLOCKED"
      ? `Your free trial or subscription quota has run out — purchase a plan to ${action}`
      : `Your remaining quota is not enough to ${action}`;
  }

  // AD-19: chỉ cần companyId, employerId ⇒ lấy từ cache. Company (isVerified,
  // hạn mức) vẫn đọc mới nhất ở requireVerifiedCompany.
  private requireEmployer(userId: string): Promise<EmployerIdentity> {
    return this.employerIdentityCache.require(userId);
  }

  /** Company phải được Admin xác minh trước khi tạo/đăng tin (AD-5, AD-6). */
  private async requireVerifiedCompany(userId: string): Promise<{ company: Company; employer: EmployerIdentity }> {
    const employer = await this.requireEmployer(userId);
    const company = await this.companyRepository.findById(employer.companyId);
    if (!company) {
      throw new AppError(404, "Company not found");
    }
    if (!company.isVerified) {
      throw new AppError(403, "Your company must be verified before posting jobs");
    }
    return { company, employer };
  }

  private async requireJobPost(id: string): Promise<JobPostWithRelations> {
    const jobPost = await this.jobPostRepository.findById(id);
    if (!jobPost) {
      throw new AppError(404, "Job post not found");
    }
    return jobPost;
  }

  private async requireOwnedJobPost(companyId: string, id: string): Promise<JobPostWithRelations> {
    const jobPost = await this.jobPostRepository.findById(id);
    // Không tiết lộ sự tồn tại của tin thuộc company khác — trả 404 giống hệt
    // trường hợp không tìm thấy (cùng cách xử lý ở SubscriptionsService).
    if (!jobPost || jobPost.companyId !== companyId) {
      throw new AppError(404, "Job post not found");
    }
    return jobPost;
  }
}
