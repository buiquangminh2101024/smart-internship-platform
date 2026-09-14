import type { CreateApplicationRequest, UpdateApplicationEvaluationRequest, UpdateApplicationStatusRequest } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { NotificationsService } from "../notifications/notifications.service";
import type { ApplicationsRepository } from "./applications.repository";
import type { PrismaClient, ApplicationStatus } from "@prisma/client";

export class ApplicationsService {
  private readonly prisma: PrismaClient;
  private readonly applicationsRepository: ApplicationsRepository;
  private readonly notificationsService: NotificationsService;

  constructor({
    prisma,
    applicationsRepository,
    notificationsService,
  }: {
    prisma: PrismaClient;
    applicationsRepository: ApplicationsRepository;
    notificationsService: NotificationsService;
  }) {
    this.prisma = prisma;
    this.applicationsRepository = applicationsRepository;
    this.notificationsService = notificationsService;
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

    // Nếu đã có đơn với trạng thái CANCELLED → cho phép ứng tuyển lại (upsert)
    if (existing) {
      if (existing.status === "CANCELLED") {
        await this.applicationsRepository.update(existing.id, {
          status: "PENDING",
          cvId: dto.cvId,
          coverLetter: dto.coverLetter ?? null,
          reappliedAt: new Date(),
        });
        return this.applicationsRepository.findCandidateApplicationById(existing.id, candidate.id);
      }
      throw new AppError(400, "You have already applied to this job post");
    }

    const created = await this.applicationsRepository.create({
      jobPostId: dto.jobPostId,
      candidateId: candidate.id,
      cvId: dto.cvId,
      ...(dto.coverLetter ? { coverLetter: dto.coverLetter } : {}),
      status: "PENDING"
    });

    return this.applicationsRepository.findCandidateApplicationById(created.id, candidate.id);
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

    await this.applicationsRepository.update(id, { status: "CANCELLED" });
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
