import type {
  BulkStatusSkipReason,
  BulkUpdateApplicationStatusResult,
  CreateApplicationRequest,
  EmployerApplicationsPage,
  EmployerApplicationsSort,
  UpdateApplicationEvaluationRequest,
  UpdateApplicationStatusRequest,
} from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { EmployerRepository } from "../employers/employer.repository";
import type { InterviewsRepository } from "../interviews/interviews.repository";
import type { NotificationsService } from "../notifications/notifications.service";
import { toEmployerApplicationListItem } from "./application.mapper";
import type { BulkUpdateApplicationStatusDto, ListCompanyApplicationsQuery } from "./applications.dto";
import type { ApplicationsRepository, StatusChangeTarget } from "./applications.repository";
import type { PrismaClient, Prisma, ApplicationStatus } from "@prisma/client";

/** cancelReason của lịch bị huỷ tự động khi hồ sơ có kết quả (AD-16 M2). */
const INTERVIEW_CANCEL_REASON_DECIDED = "Hồ sơ đã có kết quả";
/** Lô 50 hồ sơ ghi vài trăm câu lệnh (trạng thái, history, thông báo, outbox), như đặt lịch hàng loạt. */
const BULK_TRANSACTION_TIMEOUT_MS = 30_000;

/** State machine hồ sơ phía employer. Không có chuyển ngược: mọi lần đổi đều không hoàn tác được. */
const STATUS_TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  PENDING: ["REVIEWING", "REJECTED"],
  REVIEWING: ["SHORTLISTED", "REJECTED"],
  SHORTLISTED: ["INTERVIEWING", "REJECTED"],
  INTERVIEWING: ["ACCEPTED", "REJECTED"],
  ACCEPTED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

/** Tab Chờ duyệt: hồ sơ chờ lâu nhất trước. Tab khác: mới nhất trước. */
export function defaultSort(status: ApplicationStatus | undefined): EmployerApplicationsSort {
  return status === "PENDING" ? "oldest" : "newest";
}

/** Đủ mọi trạng thái, trạng thái không có hồ sơ là 0. */
function toStatusCounts(rows: Array<{ status: ApplicationStatus; count: number }>): Record<ApplicationStatus, number> {
  const counts = Object.fromEntries(Object.keys(STATUS_TRANSITIONS).map((status) => [status, 0])) as Record<ApplicationStatus, number>;
  for (const row of rows) counts[row.status] = row.count;
  return counts;
}

export class ApplicationsService {
  private readonly prisma: PrismaClient;
  private readonly applicationsRepository: ApplicationsRepository;
  private readonly employerRepository: EmployerRepository;
  private readonly notificationsService: NotificationsService;
  private readonly interviewsRepository: InterviewsRepository;

  constructor({
    prisma,
    applicationsRepository,
    employerRepository,
    notificationsService,
    interviewsRepository,
  }: {
    prisma: PrismaClient;
    applicationsRepository: ApplicationsRepository;
    employerRepository: EmployerRepository;
    notificationsService: NotificationsService;
    interviewsRepository: InterviewsRepository;
  }) {
    this.prisma = prisma;
    this.applicationsRepository = applicationsRepository;
    this.employerRepository = employerRepository;
    this.notificationsService = notificationsService;
    this.interviewsRepository = interviewsRepository;
  }

  async createApplication(userId: string, dto: CreateApplicationRequest) {
    const candidate = await this.prisma.candidate.findUnique({ where: { userId } });
    if (!candidate) {
      throw new AppError(404, "Candidate profile not found");
    }

    const jobPost = await this.prisma.jobPost.findUnique({ where: { id: dto.jobPostId } });
    if (!jobPost) {
      throw new AppError(404, "Job post not found");
    }
    if (jobPost.status !== "PUBLISHED") {
      throw new AppError(400, "Cannot apply to a job post that is not published");
    }
    if (jobPost.expiresAt && jobPost.expiresAt.getTime() < Date.now()) {
      throw new AppError(400, "Cannot apply to a job post that has expired");
    }

    const cv = await this.prisma.cv.findUnique({ where: { id: dto.cvId } });
    if (!cv || cv.candidateId !== candidate.id) {
      throw new AppError(400, "Invalid CV");
    }

    const existing = await this.applicationsRepository.findByJobAndCandidate(dto.jobPostId, candidate.id);
    if (existing && existing.status !== "CANCELLED") {
      throw new AppError(400, "You have already applied to this job post");
    }

    // Hồ sơ + lịch sử trạng thái + thông báo cho employer ghi chung một
    // transaction (AD-16), cùng lý do với updateApplicationStatus bên dưới.
    const applicationId = await this.prisma.$transaction(async (tx) => {
      let id: string;
      if (existing) {
        // Đơn đã huỷ (CANCELLED) → cho phép ứng tuyển lại trên chính bản ghi cũ.
        await this.applicationsRepository.update(
          existing.id,
          { status: "PENDING", cvId: dto.cvId, coverLetter: dto.coverLetter ?? null, reappliedAt: new Date() },
          tx,
        );
        id = existing.id;
      } else {
        const created = await this.applicationsRepository.create(
          {
            jobPostId: dto.jobPostId,
            candidateId: candidate.id,
            cvId: dto.cvId,
            ...(dto.coverLetter ? { coverLetter: dto.coverLetter } : {}),
            status: "PENDING",
          },
          tx,
        );
        id = created.id;
      }

      await this.applicationsRepository.createStatusHistory(
        { applicationId: id, fromStatus: existing ? existing.status : null, toStatus: "PENDING", actorId: userId },
        tx,
      );
      const employers = await this.employerRepository.findManyByCompanyId(jobPost.companyId, tx);
      await this.notificationsService.notifyMany(
        "APPLICATION_RECEIVED",
        employers.map((employer) => employer.userId),
        { applicationId: id, jobPostId: jobPost.id, jobPostTitle: jobPost.title, candidateName: candidate.fullName },
        tx,
      );
      return id;
    });

    return this.applicationsRepository.findCandidateApplicationById(applicationId, candidate.id);
  }

  async listCandidateApplications(userId: string) {
    const candidate = await this.prisma.candidate.findUnique({ where: { userId } });
    if (!candidate) return [];
    return this.applicationsRepository.findCandidateApplications(candidate.id);
  }

  async getCandidateApplicationDetail(userId: string, id: string) {
    const candidate = await this.prisma.candidate.findUnique({ where: { userId } });
    if (!candidate) throw new AppError(404, "Application not found");
    
    const app = await this.applicationsRepository.findCandidateApplicationById(id, candidate.id);
    if (!app) throw new AppError(404, "Application not found");
    
    return app;
  }

  async cancelApplication(userId: string, id: string) {
    const candidate = await this.prisma.candidate.findUnique({ where: { userId } });
    if (!candidate) throw new AppError(404, "Application not found");
    
    const app = await this.applicationsRepository.findCandidateApplicationById(id, candidate.id);
    if (!app) throw new AppError(404, "Application not found");

    // Chỉ cho phép hủy khi đơn đang ở trạng thái PENDING
    if (app.status !== "PENDING") {
      throw new AppError(400, "Chỉ có thể hủy đơn khi đang ở trạng thái chờ duyệt (PENDING). Đơn đã được nhà tuyển dụng tiếp nhận không thể hủy.");
    }

    await this.prisma.$transaction(async (tx) => {
      await this.applicationsRepository.update(id, { status: "CANCELLED" }, tx);
      await this.applicationsRepository.createStatusHistory(
        { applicationId: id, fromStatus: "PENDING", toStatus: "CANCELLED", actorId: userId },
        tx,
      );
    });
    return this.applicationsRepository.findCandidateApplicationById(id, candidate.id);
  }

  // --- Employer ---

  private async requireEmployer(userId: string) {
    const employer = await this.prisma.employer.findUnique({ where: { userId } });
    if (!employer) {
      throw new AppError(404, "Employer profile not found");
    }
    return employer;
  }

  async listEmployerApplications(userId: string, jobId: string, status?: ApplicationStatus) {
    const employer = await this.requireEmployer(userId);
    // Ensure employer owns the job
    const jobPost = await this.prisma.jobPost.findFirst({ where: { id: jobId, companyId: employer.companyId } });
    if (!jobPost) throw new AppError(404, "Job post not found");

    return this.applicationsRepository.findEmployerApplicationsByJobId(jobId, employer.companyId, status);
  }

  /**
   * Hồ sơ kèm mọi lịch phỏng vấn (D3). Hai truy vấn chạy song song, cả hai đều lọc theo
   * công ty; hồ sơ không thuộc công ty thì 404.
   */
  async getEmployerApplicationDetail(userId: string, id: string) {
    const employer = await this.requireEmployer(userId);
    const [app, interviews] = await Promise.all([
      this.applicationsRepository.findEmployerApplicationById(id, employer.companyId),
      this.interviewsRepository.listForApplication(id, employer.companyId),
    ]);
    if (!app) throw new AppError(404, "Application not found");
    return { app, interviews };
  }

  /**
   * Trang "Ứng viên" (mọi tin của công ty): phân trang theo số trang, `page` vượt trang
   * cuối thì trả trang cuối (như D18). `total` lấy từ `statusCounts` nên không cần câu đếm riêng.
   */
  async listCompanyApplications(userId: string, query: ListCompanyApplicationsQuery): Promise<EmployerApplicationsPage> {
    const { companyId } = await this.requireEmployer(userId);
    const filter = { jobPostId: query.jobPostId, q: query.q };
    const sort = query.sort ?? defaultSort(query.status);
    const listPage = (page: number) =>
      this.applicationsRepository.listForCompany(
        companyId,
        { ...filter, status: query.status },
        { sort, offset: (page - 1) * query.pageSize, limit: query.pageSize },
      );
    // Lấy trang được hỏi cùng lúc với các số đếm để chỉ chờ DB một lượt. Tin của công ty khác
    // thì trang rỗng (mọi câu đều lọc theo công ty) và vẫn trả 404 bên dưới.
    const [ownsJobPost, statusRows, jobCounts, requestedRows] = await Promise.all([
      query.jobPostId ? this.applicationsRepository.jobPostBelongsToCompany(query.jobPostId, companyId) : true,
      this.applicationsRepository.countByStatus(companyId, filter),
      this.applicationsRepository.countByJob(companyId, query.q),
      listPage(query.page),
    ]);
    if (!ownsJobPost) throw new AppError(404, "Job post not found");

    const statusCounts = toStatusCounts(statusRows);
    const total = query.status
      ? statusCounts[query.status]
      : Object.values(statusCounts).reduce((sum, count) => sum + count, 0);
    const lastPage = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(query.page, lastPage);
    // Trang vượt trang cuối (sửa URL, hay hồ sơ vừa đổi trạng thái) thì lấy lại trang cuối.
    const rows = page === query.page ? requestedRows : total === 0 ? [] : await listPage(page);
    return {
      items: rows.map(toEmployerApplicationListItem),
      total,
      page,
      pageSize: query.pageSize,
      statusCounts,
      jobCounts,
    };
  }

  async updateApplicationStatus(userId: string, id: string, dto: UpdateApplicationStatusRequest) {
    const employer = await this.requireEmployer(userId);
    const app = await this.applicationsRepository.findEmployerApplicationById(id, employer.companyId);
    if (!app) throw new AppError(404, "Application not found");

    if (!canTransition(app.status, dto.status)) {
      throw new AppError(400, "Cannot transition status to " + dto.status);
    }

    const target: StatusChangeTarget = {
      id: app.id,
      status: app.status,
      jobPostId: app.jobPostId,
      jobPostTitle: app.jobPost.title,
      companyName: app.jobPost.company.name,
      candidateUserId: app.candidate.userId,
    };
    const changed = await this.prisma.$transaction((tx) => this.applyStatusChange(tx, target, dto.status, userId));
    if (!changed) throw new AppError(409, "Trạng thái hồ sơ vừa được thay đổi. Tải lại để xem trạng thái mới.");

    return this.applicationsRepository.findEmployerApplicationById(id, employer.companyId);
  }

  /**
   * Đổi trạng thái nhiều hồ sơ trong MỘT transaction (D4–D7). Hồ sơ không đổi được thì
   * bỏ qua kèm lý do, hồ sơ khác vẫn được đổi. Ghi theo thứ tự id (khoá dòng cùng một
   * thứ tự với đặt lịch hàng loạt, tránh khoá chéo); `updated` giữ thứ tự gửi lên.
   */
  async bulkUpdateStatus(userId: string, dto: BulkUpdateApplicationStatusDto): Promise<BulkUpdateApplicationStatusResult> {
    const employer = await this.requireEmployer(userId);
    return this.prisma.$transaction(
      async (tx) => {
        const applications = await this.applicationsRepository.findManyForStatusChange(dto.applicationIds, employer.companyId, tx);
        const byId = new Map(applications.map((application) => [application.id, application]));
        const reasons = new Map<string, BulkStatusSkipReason>();

        for (const id of [...dto.applicationIds].sort()) {
          const application = byId.get(id);
          if (!application) reasons.set(id, "NOT_FOUND");
          else if (!canTransition(application.status, dto.status)) reasons.set(id, "INVALID_TRANSITION");
          else if (!(await this.applyStatusChange(tx, application, dto.status, userId))) reasons.set(id, "STATUS_CHANGED");
        }

        return {
          updated: dto.applicationIds.filter((id) => !reasons.has(id)),
          skipped: dto.applicationIds.flatMap((id) => {
            const reason = reasons.get(id);
            return reason ? [{ applicationId: id, reason }] : [];
          }),
        };
      },
      { timeout: BULK_TRANSACTION_TIMEOUT_MS },
    );
  }

  /**
   * Chuỗi ghi của một lần đổi trạng thái (AD-16), chạy trong transaction của nơi gọi:
   * đổi có điều kiện, lịch sử, (có kết quả) huỷ lịch sắp tới, thông báo + outbox email.
   * Ứng viên không bao giờ thấy trạng thái mới mà thiếu thông báo, và ngược lại.
   * Trả false (không ghi gì) nếu trạng thái đã khác `app.status`.
   */
  private async applyStatusChange(
    tx: Prisma.TransactionClient,
    app: StatusChangeTarget,
    to: ApplicationStatus,
    actorId: string,
  ): Promise<boolean> {
    const count = await this.applicationsRepository.updateStatusIf(app.id, app.status, to, tx);
    if (count === 0) return false;
    await this.applicationsRepository.createStatusHistory(
      { applicationId: app.id, fromStatus: app.status, toStatus: to, actorId },
      tx,
    );
    // Hồ sơ có kết quả thì lịch phỏng vấn chưa diễn ra không còn ý nghĩa. Không
    // gửi INTERVIEW_CANCELLED: ứng viên đã nhận APPLICATION_STATUS_CHANGED ngay dưới.
    if (to === "REJECTED" || to === "ACCEPTED") {
      await this.interviewsRepository.cancelUpcomingForApplication(app.id, INTERVIEW_CANCEL_REASON_DECIDED, tx);
    }
    await this.notificationsService.notify(
      "APPLICATION_STATUS_CHANGED",
      app.candidateUserId,
      {
        applicationId: app.id,
        jobPostId: app.jobPostId,
        jobPostTitle: app.jobPostTitle,
        companyName: app.companyName,
        oldStatus: app.status,
        newStatus: to,
      },
      tx,
    );
    return true;
  }

  async updateApplicationEvaluation(userId: string, id: string, dto: UpdateApplicationEvaluationRequest) {
    const employer = await this.requireEmployer(userId);
    const app = await this.applicationsRepository.findEmployerApplicationById(id, employer.companyId);
    if (!app) throw new AppError(404, "Application not found");

    await this.applicationsRepository.update(id, { 
      ...(dto.employerNotes !== undefined ? { employerNotes: dto.employerNotes } : {}),
      ...(dto.rating !== undefined ? { rating: dto.rating } : {})
    });
    return this.applicationsRepository.findEmployerApplicationById(id, employer.companyId);
  }
}
