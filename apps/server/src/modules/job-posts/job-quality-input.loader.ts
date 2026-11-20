// AD-29 — nạp dữ liệu cho bộ chấm chất lượng tin (docs/06-backend/job-quality-moderation/PLAN.md,
// bước 3–4). CHỈ ĐỌC: gom nội dung tin + tín hiệu lịch sử thành `JobQualityInput` cho
// `scoreJobPost`. Nạp theo lô (một câu cho mỗi loại dữ liệu, không lặp theo tin) để script
// hiệu chỉnh chấm được hàng trăm tin; lối chấm một tin ở bước 4 gọi cùng hàm với một id.
import type { Prisma, PrismaClient } from "@prisma/client";
import { QUALITY_THRESHOLDS as T } from "./job-quality.config";
import type { JobQualityInput, JobQualitySignals } from "./job-quality";

type Db = PrismaClient | Prisma.TransactionClient;

const DAY_MS = 24 * 60 * 60 * 1000;

interface Deps {
  prisma: PrismaClient;
}

type CompanySignals = Omit<JobQualitySignals, "resubmittedUnchanged" | "rejectionCount">;

function emptyCompanySignals(): CompanySignals {
  return {
    companyRetractions: 0,
    companyConfirmedReports: 0,
    companyOpenReports: 0,
    companySubmitCount: 0,
    companyRejectCount: 0,
    companyApprovedCount: 0,
  };
}

/** Cờ "gửi lại không sửa" của lần chấm trước, lưu trong `qualityBreakdown.resubmittedUnchanged`. */
function previousResubmittedFlag(breakdown: Prisma.JsonValue | null): boolean {
  if (!breakdown || typeof breakdown !== "object" || Array.isArray(breakdown)) return false;
  return (breakdown as Record<string, unknown>).resubmittedUnchanged === true;
}

export interface LoadedJobQualityInput {
  jobPostId: string;
  companyId: string;
  status: string;
  input: JobQualityInput;
}

export class JobQualityInputLoader {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: Deps) {
    this.prisma = prisma;
  }

  /**
   * Nạp input cho các tin `jobPostIds` (tin không tồn tại bị bỏ qua). `resubmittedUnchanged`
   * lấy từ lần chấm trước; lối gửi duyệt (bước 4) tự tính rồi ghi đè trước khi chấm.
   */
  async loadMany(jobPostIds: readonly string[], now: Date, db: Db = this.prisma): Promise<LoadedJobQualityInput[]> {
    if (jobPostIds.length === 0) return [];

    const jobs = await db.jobPost.findMany({
      where: { id: { in: [...jobPostIds] } },
      select: {
        id: true,
        companyId: true,
        status: true,
        title: true,
        description: true,
        requirements: true,
        benefits: true,
        jobType: true,
        salaryMin: true,
        salaryMax: true,
        isNegotiable: true,
        cityId: true,
        address: true,
        industryId: true,
        expiresAt: true,
        submittedAt: true,
        minExperienceYears: true,
        qualityBreakdown: true,
        skills: { select: { skillId: true, importance: true, skill: { select: { status: true } } } },
        majors: { select: { majorId: true, relevance: true } },
      },
    });
    if (jobs.length === 0) return [];

    const jobIds = jobs.map((job) => job.id);
    const companyIds = [...new Set(jobs.map((job) => job.companyId))];
    const historySince = new Date(now.getTime() - T.companyHistoryDays * DAY_MS);

    const [rejections, companyActions, confirmedReports, openReports] = await Promise.all([
      db.jobPostModerationAction.groupBy({
        by: ["jobPostId"],
        where: { jobPostId: { in: jobIds }, action: "REJECTED" },
        _count: { _all: true },
      }),
      db.jobPostModerationAction.findMany({
        where: { jobPost: { companyId: { in: companyIds } }, action: { in: ["SUBMITTED", "APPROVED", "REJECTED", "RETRACTED"] } },
        select: { action: true, createdAt: true, jobPost: { select: { companyId: true } } },
      }),
      db.jobReport.findMany({
        where: { job: { companyId: { in: companyIds } }, resolution: "TAKE_DOWN", resolvedAt: { gte: historySince } },
        select: { job: { select: { companyId: true } } },
      }),
      db.jobReport.findMany({
        where: { job: { companyId: { in: companyIds } }, status: "PENDING" },
        select: { job: { select: { companyId: true } } },
      }),
    ]);

    const rejectionsByJob = new Map(rejections.map((row) => [row.jobPostId, row._count._all]));
    const companies = new Map<string, CompanySignals>(companyIds.map((id) => [id, emptyCompanySignals()]));
    for (const row of companyActions) {
      const signals = companies.get(row.jobPost.companyId)!;
      if (row.action === "SUBMITTED") signals.companySubmitCount += 1;
      else if (row.action === "APPROVED") signals.companyApprovedCount += 1;
      else if (row.action === "REJECTED") signals.companyRejectCount += 1;
      else if (row.action === "RETRACTED" && row.createdAt >= historySince) signals.companyRetractions += 1;
    }
    for (const row of confirmedReports) companies.get(row.job.companyId)!.companyConfirmedReports += 1;
    for (const row of openReports) companies.get(row.job.companyId)!.companyOpenReports += 1;

    return jobs.map((job) => ({
      jobPostId: job.id,
      companyId: job.companyId,
      status: job.status,
      input: {
        title: job.title,
        description: job.description,
        requirements: job.requirements,
        benefits: job.benefits,
        jobType: job.jobType,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        isNegotiable: job.isNegotiable,
        cityId: job.cityId,
        address: job.address,
        industryId: job.industryId,
        expiresAt: job.expiresAt,
        submittedAt: job.submittedAt,
        minExperienceYears: job.minExperienceYears,
        skills: job.skills.map((s) => ({ skillId: s.skillId, importance: s.importance, status: s.skill.status })),
        majors: job.majors,
        signals: {
          ...companies.get(job.companyId)!,
          resubmittedUnchanged: job.status === "PENDING" && previousResubmittedFlag(job.qualityBreakdown),
          rejectionCount: rejectionsByJob.get(job.id) ?? 0,
        },
      },
    }));
  }
}
