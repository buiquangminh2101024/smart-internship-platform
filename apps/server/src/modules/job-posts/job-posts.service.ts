import type { Company, Employer, JobPostStatus, JobPostType, PrismaClient } from "@prisma/client";
import type {
  CreateJobPostRequest,
  EmployerJobPostListQuery,
  JobPost as JobPostDto,
  JobPostSearchQuery,
  JobPostStats,
  PaginatedResponse,
  SubmitJobPostResponse,
  UpdateJobPostRequest,
} from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { CompanyRepository } from "../companies/company.repository";
import type { EmployerRepository } from "../employers/employer.repository";
import type { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { toJobPostDto } from "./job-post.mapper";
import type { JobPostRepository, JobPostWithRelations, JobPostWriteData } from "./job-post.repository";

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
  private readonly companyRepository: CompanyRepository;
  private readonly subscriptionsService: SubscriptionsService;

  constructor({
    prisma,
    jobPostRepository,
    employerRepository,
    companyRepository,
    subscriptionsService,
  }: {
    prisma: PrismaClient;
    jobPostRepository: JobPostRepository;
    employerRepository: EmployerRepository;
    companyRepository: CompanyRepository;
    subscriptionsService: SubscriptionsService;
  }) {
    this.prisma = prisma;
    this.jobPostRepository = jobPostRepository;
    this.employerRepository = employerRepository;
    this.companyRepository = companyRepository;
    this.subscriptionsService = subscriptionsService;
  }

  // ─── Public (Guest) ──────────────────────────────────────────────────────

  async search(query: JobPostSearchQuery): Promise<PaginatedResponse<JobPostDto>> {
    const { cursor, ...filter } = query;
    const page = await this.jobPostRepository.findPublishedForSearch(filter, cursor);
    return this.toPage(page);
  }

  /** Chi tiết công khai — chỉ tin PUBLISHED, mỗi lượt xem tăng viewCount. */
  async getPublicDetail(id: string): Promise<JobPostDto> {
    const jobPost = await this.requireJobPost(id);
    if (jobPost.status !== "PUBLISHED") {
      throw new AppError(404, "Job post not found");
    }
    await this.jobPostRepository.incrementViewCount(id);
    return toJobPostDto({ ...jobPost, viewCount: jobPost.viewCount + 1 });
  }

  // ─── Employer ────────────────────────────────────────────────────────────

  async listOwn(userId: string, query: EmployerJobPostListQuery): Promise<PaginatedResponse<JobPostDto>> {
    const { companyId } = await this.requireEmployer(userId);
    const { cursor, ...filter } = query;
    const page = await this.jobPostRepository.findOwnedByCompany(companyId, filter, cursor);
    return this.toPage(page);
  }

  async ownStats(userId: string): Promise<JobPostStats> {
    const { companyId } = await this.requireEmployer(userId);
    return this.countStats({ companyId });
  }

  async getOwn(userId: string, id: string): Promise<JobPostDto> {
    const { companyId } = await this.requireEmployer(userId);
    const jobPost = await this.requireOwnedJobPost(companyId, id);
    return toJobPostDto(jobPost);
  }

  async createDraft(userId: string, dto: CreateJobPostRequest): Promise<JobPostDto> {
    const { company, employer } = await this.requireVerifiedCompany(userId);
    await this.requireCreateQuota(company);

    const created = await this.jobPostRepository.create({
      companyId: company.id,
      employerId: employer.id,
      status: "DRAFT",
      ...this.toWriteData(dto),
      title: dto.title,
      description: dto.description,
      jobType: dto.jobType,
    });
    return toJobPostDto(created);
  }

  /** Chỉ sửa được khi còn DRAFT — tin đã gửi duyệt/đang hiển thị là bất biến. */
  async updateDraft(userId: string, id: string, dto: UpdateJobPostRequest): Promise<JobPostDto> {
    const { companyId } = await this.requireEmployer(userId);
    const jobPost = await this.requireOwnedJobPost(companyId, id);
    if (jobPost.status !== "DRAFT") {
      throw new AppError(409, "Only a draft job post can be edited");
    }

    const updated = await this.jobPostRepository.update(id, this.toWriteData(dto));
    return toJobPostDto(updated);
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
    if (!jobPost.expiresAt) {
      throw new AppError(400, "An application deadline is required before submitting a job post");
    }
    this.assertExpiryWithinLimit(jobPost.expiresAt);
    await this.requirePublishQuota(company);

    const autoPublished = !company.requiresApproval;
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.jobPostRepository.createModerationAction({ jobPostId: id, action: "SUBMITTED", actorId: userId }, tx);
      if (!autoPublished) {
        return this.jobPostRepository.update(id, { status: "PENDING" }, tx);
      }
      await this.jobPostRepository.createModerationAction({ jobPostId: id, action: "APPROVED", actorId: null }, tx);
      return this.jobPostRepository.update(id, { status: "PUBLISHED", publishedAt: new Date() }, tx);
    });

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
      return this.jobPostRepository.update(id, { status: "PUBLISHED", publishedAt: new Date() }, tx);
    });
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
      return this.jobPostRepository.update(id, { status: "DRAFT" }, tx);
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
      return this.jobPostRepository.update(id, { status: "TAKEN_DOWN" }, tx);
    });
    return toJobPostDto(updated);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private toPage(page: { items: JobPostWithRelations[]; hasMore: boolean; nextCursor?: string }) {
    return {
      items: page.items.map(toJobPostDto),
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

  private async requireEmployer(userId: string) {
    const employer = await this.employerRepository.findByUserId(userId);
    if (!employer) {
      throw new AppError(404, "Employer profile not found");
    }
    return employer;
  }

  /** Company phải được Admin xác minh trước khi tạo/đăng tin (AD-5, AD-6). */
  private async requireVerifiedCompany(userId: string): Promise<{ company: Company; employer: Employer }> {
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
