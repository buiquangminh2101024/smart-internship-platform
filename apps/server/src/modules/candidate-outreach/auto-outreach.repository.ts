import { Prisma, type AutoOutreachExhaustedReason, type PrismaClient } from "@prisma/client";
import { CANDIDATE_DAILY_INVITATION_CAP } from "./candidate-outreach.config";
import { NOW_UTC, START_OF_UTC_DAY, startOfUtcDay } from "./candidate-outreach.repository";

// Đọc/ghi các cột tự động mời trên job_posts (AD-23 mục 2) và đếm số liệu của thẻ
// "Tự động mời ứng viên". Không sửa nội dung tin — việc đó thuộc module job-posts.

const jobAutoOutreachSelect = {
  id: true,
  title: true,
  status: true,
  employerId: true,
  companyId: true,
  autoOutreachEnabled: true,
  autoOutreachMinScore: true,
  hiringTarget: true,
  autoOutreachExhaustedAt: true,
  autoOutreachExhaustedReason: true,
  // 0.4 bước 6 — X phải lớn hơn Y (ngưỡng đề xuất từ chối) của tin.
  rejectSuggestBelowScore: true,
} satisfies Prisma.JobPostSelect;

export type JobAutoOutreachRow = Prisma.JobPostGetPayload<{ select: typeof jobAutoOutreachSelect }>;

export interface JobAutoOutreachPatch {
  enabled?: boolean | undefined;
  minScore?: number | undefined;
  hiringTarget?: number | undefined;
  /** Xoá dấu "hết ứng viên" (bật lại, hạ ngưỡng, tăng số người cần tuyển). */
  clearExhausted: boolean;
}

export interface JobAutoOutreachCounts {
  pending: number;
  acceptedInvitations: number;
  hiredCount: number;
  autoSentToday: number;
}

/**
 * Một dòng của câu lọc rẻ (bước 5, mục 4): tin PUBLISHED, đang bật tự mời, còn hạn.
 * `active` = PENDING chưa quá hạn + ACCEPTED (cả mời tay lẫn tự động); `hired` = đơn ACCEPTED.
 */
export interface RunnableJobRow {
  id: string;
  title: string;
  employerId: string;
  employerUserId: string;
  /** AD-17 — tài khoản người đăng tin bị khoá ⇒ không gửi lời mời đứng tên họ. */
  posterSuspended: boolean;
  expiresAt: Date | null;
  hiringTarget: number;
  minScore: number;
  exhaustedAt: Date | null;
  exhaustedReason: AutoOutreachExhaustedReason | null;
  active: number;
  hired: number;
}

export class AutoOutreachRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  findJob(jobPostId: string): Promise<JobAutoOutreachRow | null> {
    return this.prisma.jobPost.findUnique({ where: { id: jobPostId }, select: jobAutoOutreachSelect });
  }

  updateJob(jobPostId: string, patch: JobAutoOutreachPatch): Promise<JobAutoOutreachRow> {
    return this.prisma.jobPost.update({
      where: { id: jobPostId },
      data: {
        ...(patch.enabled !== undefined ? { autoOutreachEnabled: patch.enabled } : {}),
        ...(patch.minScore !== undefined ? { autoOutreachMinScore: patch.minScore } : {}),
        ...(patch.hiringTarget !== undefined ? { hiringTarget: patch.hiringTarget } : {}),
        ...(patch.clearExhausted ? { autoOutreachExhaustedAt: null, autoOutreachExhaustedReason: null } : {}),
      },
      select: jobAutoOutreachSelect,
    });
  }

  /**
   * Lời mời đang hoạt động (PENDING chưa quá hạn, ACCEPTED), đơn ACCEPTED và lời mời tự
   * động gửi hôm nay của một tin. Lời mời tay và tự động đều tính vào số đang hoạt động.
   */
  async countJob(jobPostId: string, now: Date = new Date()): Promise<JobAutoOutreachCounts> {
    const invitations = this.prisma.candidateOutreachInvitation;
    const [pending, acceptedInvitations, hiredCount, autoSentToday] = await Promise.all([
      invitations.count({ where: { jobPostId, status: "PENDING", expiresAt: { gt: now } } }),
      invitations.count({ where: { jobPostId, status: "ACCEPTED" } }),
      this.prisma.application.count({ where: { jobPostId, status: "ACCEPTED" } }),
      invitations.count({ where: { jobPostId, source: "AUTO", createdAt: { gte: startOfUtcDay(now) } } }),
    ]);
    return { pending, acceptedInvitations, hiredCount, autoSentToday };
  }

  // ─── Lượt chạy nền (bước 5) ───────────────────────────────────────────────

  /**
   * Một câu gộp cho cả công ty: mọi tin PUBLISHED + đang bật + còn hạn, kèm số lời mời
   * đang hoạt động và số đơn ACCEPTED. Đa số lượt cron dừng ngay sau câu này (không tin
   * nào thiếu), nên chi phí theo số lần cần mời bù chứ không theo tổng số tin.
   */
  findRunnableJobs(companyId: string): Promise<RunnableJobRow[]> {
    return this.prisma.$queryRaw<RunnableJobRow[]>(Prisma.sql`
      SELECT
        j."id", j."title", j."employerId", e."userId" AS "employerUserId",
        (u."status" = 'SUSPENDED') AS "posterSuspended",
        j."expiresAt", j."hiringTarget", j."autoOutreachMinScore" AS "minScore",
        j."autoOutreachExhaustedAt" AS "exhaustedAt", j."autoOutreachExhaustedReason" AS "exhaustedReason",
        (
          SELECT COUNT(*)::int FROM candidate_outreach_invitations i
          WHERE i."jobPostId" = j."id"
            AND (i."status" = 'ACCEPTED' OR (i."status" = 'PENDING' AND i."expiresAt" > ${NOW_UTC}))
        ) AS "active",
        (
          SELECT COUNT(*)::int FROM applications a
          WHERE a."jobPostId" = j."id" AND a."status" = 'ACCEPTED'
        ) AS "hired"
      FROM job_posts j
      JOIN employers e ON e."id" = j."employerId"
      JOIN users u ON u."id" = e."userId"
      WHERE j."companyId" = ${companyId}
        AND j."status" = 'PUBLISHED'
        AND j."autoOutreachEnabled" = true
        AND (j."expiresAt" IS NULL OR j."expiresAt" > ${NOW_UTC})
    `);
  }

  /**
   * Đặt dấu "hết ứng viên" lúc này (Q5). Ghi bằng SQL để không đổi `updatedAt` của tin:
   * đây là việc của hệ thống, không phải người đăng tin sửa tin.
   */
  async markExhausted(jobPostId: string, reason: AutoOutreachExhaustedReason): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE job_posts
      SET "autoOutreachExhaustedAt" = ${NOW_UTC},
          "autoOutreachExhaustedReason" = ${reason}::"AutoOutreachExhaustedReason"
      WHERE "id" = ${jobPostId}
    `);
  }

  /** Xoá dấu khi lượt chạy lại tìm được người (chỉ ghi khi đang có dấu). */
  async clearExhausted(jobPostId: string): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE job_posts
      SET "autoOutreachExhaustedAt" = NULL, "autoOutreachExhaustedReason" = NULL
      WHERE "id" = ${jobPostId} AND "autoOutreachExhaustedAt" IS NOT NULL
    `);
  }

  /**
   * Ước đoán lý do "hết ứng viên" (bước 5, mục 5): có ứng viên bật opt-in, có chung kỹ
   * năng với tin và đã nhận đủ trần hôm nay ⇒ CANDIDATE_CAP. Người đủ trần chưa chắc đạt
   * ngưỡng điểm; đoán sai chỉ làm tin được kiểm lại sau mốc 0h UTC thay vì sau 3 giờ.
   */
  async hasCappedSkillMatch(jobPostId: string): Promise<boolean> {
    const [row] = await this.prisma.$queryRaw<Array<{ found: boolean }>>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1
        FROM (
          SELECT r."candidateId"
          FROM candidate_outreach_invitations r
          WHERE r."createdAt" >= ${START_OF_UTC_DAY}
          GROUP BY r."candidateId"
          HAVING COUNT(*) >= ${CANDIDATE_DAILY_INVITATION_CAP}
        ) capped
        JOIN candidates c ON c."id" = capped."candidateId" AND c."isOpenToOutreach" = true
        JOIN candidate_skills cs ON cs."candidateId" = capped."candidateId"
        JOIN job_post_skills jps ON jps."skillId" = cs."skillId" AND jps."jobPostId" = ${jobPostId}
      ) AS "found"
    `);
    return row?.found ?? false;
  }

  /** Cron: công ty có ít nhất một tin PUBLISHED đang bật tự mời. */
  async findCompaniesWithAutoJobs(): Promise<string[]> {
    const rows = await this.prisma.jobPost.findMany({
      where: { status: "PUBLISHED", autoOutreachEnabled: true },
      select: { companyId: true },
      distinct: ["companyId"],
    });
    return rows.map((row) => row.companyId);
  }
}
