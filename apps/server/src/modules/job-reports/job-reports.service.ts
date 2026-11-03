import type { PrismaClient } from "@prisma/client";
import type {
  AdminJobReportListItem,
  AdminJobReportListResponse,
  AdminJobReportStats,
  JobReportDto,
} from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import type { MediaStorage } from "../../shared/ports/MediaStorage";
import type { AuditLogService } from "../audit-log/audit-log.service";
import type { JobPostRepository } from "../job-posts/job-post.repository";
import type { JobPostsService } from "../job-posts/job-posts.service";
import type { JobReportRepository } from "./job-report.repository";
import type {
  AdminJobReportListQueryDto,
  CreateJobReportDto,
  JobReportActionDto,
} from "./job-reports.dto";

const MAX_EVIDENCE_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_EVIDENCE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export class JobReportsService {
  private readonly jobPostsService: JobPostsService;
  private readonly jobReportRepository: JobReportRepository;
  private readonly jobPostRepository: JobPostRepository;
  private readonly auditLogService: AuditLogService;
  private readonly mediaStorage: MediaStorage;
  private readonly prisma: PrismaClient;
  private readonly logger: Logger;

  constructor({
    jobPostsService,
    jobReportRepository,
    jobPostRepository,
    auditLogService,
    mediaStorage,
    prisma,
    logger,
  }: {
    jobPostsService: JobPostsService;
    jobReportRepository: JobReportRepository;
    jobPostRepository: JobPostRepository;
    auditLogService: AuditLogService;
    mediaStorage: MediaStorage;
    prisma: PrismaClient;
    logger: Logger;
  }) {
    this.jobPostsService = jobPostsService;
    this.jobReportRepository = jobReportRepository;
    this.jobPostRepository = jobPostRepository;
    this.auditLogService = auditLogService;
    this.mediaStorage = mediaStorage;
    this.prisma = prisma;
    this.logger = logger;
  }

  async createReport(
    reporterId: string,
    jobId: string,
    dto: CreateJobReportDto,
  ): Promise<JobReportDto> {
    const job = await this.jobPostRepository.findById(jobId);
    if (!job) {
      throw new AppError(404, "Tin tuyển dụng không tồn tại", "JOB_NOT_FOUND");
    }

    const existingPending = await this.jobReportRepository.findPendingByJobAndReporter(
      jobId,
      reporterId,
    );
    if (existingPending) {
      throw new AppError(
        400,
        "Bạn đã gửi báo cáo cho tin tuyển dụng này và đang chờ xử lý",
        "REPORT_PENDING_EXISTS",
      );
    }

    const report = await this.jobReportRepository.create({
      jobId,
      reporterId,
      reason: dto.reason,
      description: dto.description ?? null,
    });

    return {
      id: report.id,
      jobId: report.jobId,
      jobTitle: job.title,
      jobStatus: job.status,
      companyId: job.companyId,
      reporterId: report.reporterId,
      reason: report.reason,
      description: report.description,
      status: report.status,
      resolution: report.resolution,
      adminNote: report.adminNote,
      resolvedAt: report.resolvedAt?.toISOString() ?? null,
      resolvedById: report.resolvedById,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    };
  }

  async checkUserReport(
    reporterId: string,
    jobId: string,
  ): Promise<{ hasPendingReport: boolean; reportId?: string }> {
    const pending = await this.jobReportRepository.findPendingByJobAndReporter(jobId, reporterId);
    if (!pending) {
      return { hasPendingReport: false };
    }
    return {
      hasPendingReport: true,
      reportId: pending.id,
    };
  }

  async uploadEvidence(
    userId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ url: string }> {
    if (!file) {
      throw new AppError(400, "Vui lòng chọn ảnh minh chứng");
    }
    if (file.size > MAX_EVIDENCE_IMAGE_SIZE) {
      throw new AppError(400, "Kích thước ảnh tối đa là 5MB");
    }
    if (!ALLOWED_EVIDENCE_MIME_TYPES.includes(file.mimetype)) {
      throw new AppError(400, "Chỉ chấp nhận file ảnh định dạng JPG, PNG hoặc WEBP");
    }

    const uploaded = await this.mediaStorage.upload(file.buffer, {
      folder: "job-report-evidence",
      filename: `report-${userId}-${Date.now()}`,
      resourceType: "image",
    });

    return { url: uploaded.url };
  }

  async listForAdmin(query: AdminJobReportListQueryDto): Promise<AdminJobReportListResponse> {
    const { items, total, page, limit, totalPages } =
      await this.jobReportRepository.findManyWithPagination(query);

    return {
      items: items.map(this.mapToAdminItem),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getAdminStats(): Promise<AdminJobReportStats> {
    return this.jobReportRepository.countStats();
  }

  async getDetailForAdmin(id: string): Promise<AdminJobReportListItem> {
    const report = await this.jobReportRepository.findById(id);
    if (!report) {
      throw new AppError(404, "Báo cáo không tồn tại", "REPORT_NOT_FOUND");
    }
    return this.mapToAdminItem(report);
  }

  async executeAction(
    adminId: string,
    id: string,
    dto: JobReportActionDto,
  ): Promise<AdminJobReportListItem> {
    const report = await this.jobReportRepository.findById(id);
    if (!report) {
      throw new AppError(404, "Báo cáo không tồn tại", "REPORT_NOT_FOUND");
    }
    if (report.status !== "PENDING") {
      throw new AppError(400, "Báo cáo này đã được xử lý trước đó", "REPORT_ALREADY_PROCESSED");
    }

    const effectiveReason =
      dto.reason?.trim() || dto.adminNote?.trim() || `Xử lý theo báo cáo vi phạm: ${report.reason}`;

    if (dto.resolution === "TAKE_DOWN") {
      // Gỡ tin tuyển dụng nếu đang PUBLISHED
      if (report.job.status === "PUBLISHED") {
        await this.jobPostsService.retract(adminId, report.jobId, effectiveReason);
      }
      await this.jobReportRepository.update(id, {
        status: "RESOLVED",
        resolution: "TAKE_DOWN",
        adminNote: dto.adminNote ?? report.adminNote,
        resolvedAt: new Date(),
        resolvedById: adminId,
      });

      await this.auditLogService.record({
        actorId: adminId,
        actorRole: "ADMIN",
        action: "JOB_REPORT_ACTION_EXECUTED",
        entityType: "JobReport",
        entityId: id,
        summary: `Gỡ tin tuyển dụng "${report.job.title}" theo báo cáo vi phạm`,
        metadata: {
          resolution: "TAKE_DOWN",
          jobId: report.jobId,
          reason: effectiveReason,
          adminNote: dto.adminNote,
        },
      });
    } else if (dto.resolution === "DISMISS") {
      await this.jobReportRepository.update(id, {
        status: "RESOLVED",
        resolution: "DISMISS",
        adminNote: dto.adminNote ?? report.adminNote,
        resolvedAt: new Date(),
        resolvedById: adminId,
      });

      await this.auditLogService.record({
        actorId: adminId,
        actorRole: "ADMIN",
        action: "JOB_REPORT_RESOLVED",
        entityType: "JobReport",
        entityId: id,
        summary: `Bỏ qua báo cáo vi phạm tin "${report.job.title}" (giữ nguyên bài đăng)`,
        metadata: {
          resolution: "DISMISS",
          adminNote: dto.adminNote,
          reason: report.reason,
        },
      });
    }

    const fullUpdated = await this.jobReportRepository.findById(id);
    return this.mapToAdminItem(fullUpdated!);
  }

  private mapToAdminItem(report: NonNullable<Awaited<ReturnType<JobReportRepository["findById"]>>>): AdminJobReportListItem {
    return {
      id: report.id,
      jobId: report.jobId,
      jobTitle: report.job.title,
      jobStatus: report.job.status,
      companyId: report.job.companyId,
      companyName: report.job.company.name,
      employerUserId: report.job.employer.userId,
      reporterId: report.reporterId,
      reporterEmail: report.reporter.email,
      reporterName: report.reporter.candidate?.fullName ?? null,
      reason: report.reason,
      description: report.description,
      status: report.status,
      resolution: report.resolution,
      adminNote: report.adminNote,
      resolvedAt: report.resolvedAt ? report.resolvedAt.toISOString() : null,
      resolvedById: report.resolvedById,
      resolvedByName: (report as any).resolvedBy?.email ?? null,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    };
  }
}
