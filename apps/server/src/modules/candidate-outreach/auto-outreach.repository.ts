import type { Prisma, PrismaClient } from "@prisma/client";
import { startOfUtcDay } from "./candidate-outreach.repository";

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
}
