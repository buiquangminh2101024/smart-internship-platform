import type { CreateApplicationRequest, UpdateApplicationEvaluationRequest, UpdateApplicationStatusRequest } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { EmployerRepository } from "../employers/employer.repository";
import type { InterviewsRepository } from "../interviews/interviews.repository";
import type { NotificationsService } from "../notifications/notifications.service";
import type { ApplicationsRepository } from "./applications.repository";
import type { PrismaClient, ApplicationStatus } from "@prisma/client";

/** cancelReason của lịch bị huỷ tự động khi hồ sơ có kết quả (AD-16 M2). */
const INTERVIEW_CANCEL_REASON_DECIDED = "Hồ sơ đã có kết quả";

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

  async getEmployerApplicationDetail(userId: string, id: string) {
    const employer = await this.requireEmployer(userId);
    const app = await this.applicationsRepository.findEmployerApplicationById(id, employer.companyId);
    if (!app) throw new AppError(404, "Application not found");
    return app;
  }

  async updateApplicationStatus(userId: string, id: string, dto: UpdateApplicationStatusRequest) {
    const employer = await this.requireEmployer(userId);
    const app = await this.applicationsRepository.findEmployerApplicationById(id, employer.companyId);
    if (!app) throw new AppError(404, "Application not found");

    const validTransitions: Record<ApplicationStatus, ApplicationStatus[]> = {
      PENDING: ["REVIEWING", "REJECTED"],
      REVIEWING: ["SHORTLISTED", "REJECTED"],
      SHORTLISTED: ["INTERVIEWING", "REJECTED"],
      INTERVIEWING: ["ACCEPTED", "REJECTED"],
      ACCEPTED: [],
      REJECTED: [],
      CANCELLED: [],
    };

    if (!validTransitions[app.status as ApplicationStatus]?.includes(dto.status as ApplicationStatus)) {
      throw new AppError(400, "Cannot transition status to " + dto.status);
    }

    // Đổi trạng thái + notification + outbox email ghi chung một transaction:
    // ứng viên không bao giờ thấy trạng thái mới mà thiếu thông báo, và ngược lại.
    await this.prisma.$transaction(async (tx) => {
      await this.applicationsRepository.update(id, { status: dto.status }, tx);
      await this.applicationsRepository.createStatusHistory(
        { applicationId: id, fromStatus: app.status, toStatus: dto.status, actorId: userId },
        tx,
      );
      // Hồ sơ có kết quả thì lịch phỏng vấn chưa diễn ra không còn ý nghĩa. Không
      // gửi INTERVIEW_CANCELLED: ứng viên đã nhận APPLICATION_STATUS_CHANGED ngay dưới.
      if (dto.status === "REJECTED" || dto.status === "ACCEPTED") {
        await this.interviewsRepository.cancelUpcomingForApplication(id, INTERVIEW_CANCEL_REASON_DECIDED, tx);
      }
      await this.notificationsService.notify(
        "APPLICATION_STATUS_CHANGED",
        app.candidate.userId,
        {
          applicationId: app.id,
          jobPostId: app.jobPostId,
          jobPostTitle: app.jobPost.title,
          companyName: app.jobPost.company.name,
          oldStatus: app.status,
          newStatus: dto.status,
        },
        tx,
      );
    });

    return this.applicationsRepository.findEmployerApplicationById(id, employer.companyId);
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
