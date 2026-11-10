import type { CompanyOutreachSettings, JobAutoOutreachDto } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { EmployerIdentityCache } from "../employers/employer-identity-cache";
import type { EmployerRepository } from "../employers/employer.repository";
import { reopensAutoOutreach, resolveAutoOutreachState } from "./auto-outreach.policy";
import type { AutoOutreachRepository, JobAutoOutreachRow } from "./auto-outreach.repository";
import type { UpdateJobAutoOutreachInput } from "./candidate-outreach.dto";
import type { CandidateOutreachRepository, OutreachEmployer } from "./candidate-outreach.repository";
import type { CandidateOutreachService, OutreachQuotaPolicy } from "./candidate-outreach.service";

/**
 * Tự động mời ứng viên theo tin (AD-23) — docs/06-backend/auto-outreach/PLAN.md.
 * Bước 4: cài đặt của tin và của công ty. Lượt chạy nền (runForCompany) thêm ở bước 5.
 * Phụ thuộc một chiều vào CandidateOutreachService (hạn mức theo gói, tạo lời mời);
 * CandidateOutreachService không phụ thuộc ngược lại.
 */
export class AutoOutreachService {
  private readonly repository: AutoOutreachRepository;
  private readonly outreachRepository: CandidateOutreachRepository;
  private readonly outreachService: CandidateOutreachService;
  private readonly employerIdentityCache: EmployerIdentityCache;
  private readonly employerRepository: EmployerRepository;

  constructor({
    autoOutreachRepository,
    candidateOutreachRepository,
    candidateOutreachService,
    employerIdentityCache,
    employerRepository,
  }: {
    autoOutreachRepository: AutoOutreachRepository;
    candidateOutreachRepository: CandidateOutreachRepository;
    candidateOutreachService: CandidateOutreachService;
    employerIdentityCache: EmployerIdentityCache;
    employerRepository: EmployerRepository;
  }) {
    this.repository = autoOutreachRepository;
    this.outreachRepository = candidateOutreachRepository;
    this.outreachService = candidateOutreachService;
    this.employerIdentityCache = employerIdentityCache;
    this.employerRepository = employerRepository;
  }

  // ─── Cài đặt của tin ─────────────────────────────────────────────────────

  /** Chỉ người đăng tin. Đọc được ở mọi trạng thái của tin và mọi gói. */
  async getJobSettings(userId: string, jobPostId: string): Promise<JobAutoOutreachDto> {
    const employer = await this.requireEmployer(userId);
    const job = await this.requireOwnedJob(employer, jobPostId);
    return this.toJobDto(job, await this.outreachService.lookupDailyQuota(employer));
  }

  /**
   * Chỉ người đăng tin, sửa được ở mọi trạng thái của tin (AD-23 mục 2). Bật khi công ty
   * dùng thử hoặc không có gói ⇒ 403; các trường khác vẫn sửa được (form tạo tin của gói
   * Dùng thử vẫn lưu số người cần tuyển). Bật lại, hạ ngưỡng hoặc tăng số người cần tuyển
   * ⇒ xoá dấu "hết ứng viên".
   */
  async updateJobSettings(userId: string, jobPostId: string, patch: UpdateJobAutoOutreachInput): Promise<JobAutoOutreachDto> {
    const employer = await this.requireEmployer(userId);
    const job = await this.requireOwnedJob(employer, jobPostId);
    const policy = await this.outreachService.lookupDailyQuota(employer);
    if (patch.enabled === true && !policy?.autoAllowed) {
      throw new AppError(403, "Tự động mời ứng viên có từ gói Cơ bản. Gói Dùng thử chỉ mời tay.");
    }

    const updated = await this.repository.updateJob(job.id, {
      ...patch,
      clearExhausted: reopensAutoOutreach(toSettings(job), patch),
    });
    // Bước 5: tin PUBLISHED + đang bật + reopensAutoOutreach ⇒ kích hoạt runForCompany, không chờ.
    return this.toJobDto(updated, policy);
  }

  // ─── Cài đặt của công ty ─────────────────────────────────────────────────

  /** Mọi employer của công ty đều xem được. */
  async getCompanySettings(userId: string): Promise<CompanyOutreachSettings> {
    const { companyId } = await this.employerIdentityCache.require(userId);
    const percent = await this.outreachRepository.findAutoSharePercent(companyId);
    if (percent === null) throw new AppError(404, "Employer profile not found");
    return { autoSharePercent: percent };
  }

  /** AD-23 mục 5 — chỉ quản trị viên công ty được sửa (như mua gói, tạo mã mời). */
  async updateCompanySettings(userId: string, settings: CompanyOutreachSettings): Promise<CompanyOutreachSettings> {
    const employer = await this.employerRepository.findByUserId(userId);
    if (!employer) throw new AppError(404, "Employer profile not found");
    if (!employer.isCompanyAdmin) {
      throw new AppError(403, "Chỉ quản trị viên công ty được đổi tỉ lệ tự động mời.");
    }
    const percent = await this.outreachRepository.updateAutoSharePercent(employer.companyId, settings.autoSharePercent);
    return { autoSharePercent: percent };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async toJobDto(job: JobAutoOutreachRow, policy: OutreachQuotaPolicy | null): Promise<JobAutoOutreachDto> {
    const now = new Date();
    const counts = await this.repository.countJob(job.id, now);
    const { state, nextCheckAt } = resolveAutoOutreachState(
      {
        autoAllowed: policy?.autoAllowed ?? false,
        enabled: job.autoOutreachEnabled,
        jobStatus: job.status,
        hiringTarget: job.hiringTarget,
        hiredCount: counts.hiredCount,
        exhaustedAt: job.autoOutreachExhaustedAt,
        exhaustedReason: job.autoOutreachExhaustedReason,
      },
      now,
    );
    return {
      ...toSettings(job),
      state,
      status: {
        target: policy?.autoAllowed ? job.hiringTarget * policy.poolMultiplier : null,
        active: counts.pending + counts.acceptedInvitations,
        pending: counts.pending,
        acceptedInvitations: counts.acceptedInvitations,
        hiredCount: counts.hiredCount,
        autoSentToday: counts.autoSentToday,
        nextCheckAt: nextCheckAt ? nextCheckAt.toISOString() : null,
      },
    };
  }

  // Cần company để tra gói ⇒ đọc mới nhất theo companyId (AD-19, như CandidateOutreachService).
  private async requireEmployer(userId: string): Promise<OutreachEmployer> {
    const { employerId, companyId } = await this.employerIdentityCache.require(userId);
    const company = await this.outreachRepository.findOutreachCompany(companyId);
    if (!company) throw new AppError(404, "Employer profile not found");
    return { id: employerId, companyId, company };
  }

  /** Chỉ người đăng tin — tin của người khác trả 404 như không tồn tại (cùng quy tắc B3). */
  private async requireOwnedJob(employer: Pick<OutreachEmployer, "id">, jobPostId: string): Promise<JobAutoOutreachRow> {
    const job = await this.repository.findJob(jobPostId);
    if (!job || job.employerId !== employer.id) throw new AppError(404, "Job post not found");
    return job;
  }
}

function toSettings(job: JobAutoOutreachRow): { enabled: boolean; minScore: number; hiringTarget: number } {
  return { enabled: job.autoOutreachEnabled, minScore: job.autoOutreachMinScore, hiringTarget: job.hiringTarget };
}
