import { Prisma, type ApplicationStatus, type InterviewMode, type PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Quan hệ cần để dựng DTO cho cả hai phía và nội dung thông báo. */
export const interviewInclude = {
  application: {
    select: {
      id: true,
      status: true,
      candidateId: true,
      candidate: { select: { userId: true, fullName: true, avatarUrl: true } },
      jobPost: { select: { id: true, title: true, companyId: true, company: { select: { name: true, logoUrl: true } } } },
    },
  },
} satisfies Prisma.InterviewInclude;

export type InterviewWithRelations = Prisma.InterviewGetPayload<{ include: typeof interviewInclude }>;

/** Hồ sơ kèm đủ thông tin để kiểm tra điều kiện đặt lịch và gửi thông báo. */
export interface SchedulableApplication {
  id: string;
  status: ApplicationStatus;
  candidateUserId: string;
  jobPostTitle: string;
  companyName: string;
  hasUpcomingInterview: boolean;
}

export interface AwaitingScheduleRow {
  applicationId: string;
  status: "SHORTLISTED" | "INTERVIEWING";
  candidateName: string | null;
  candidateAvatarUrl: string | null;
  jobPostId: string;
  jobPostTitle: string;
  waitingSince: Date;
}

export interface InterviewWriteData {
  applicationId: string;
  scheduledAt: Date;
  durationMinutes: number;
  mode: InterviewMode;
  location: string;
  note: string | null;
  createdById: string;
}

export type InterviewUpdateData = Partial<Pick<InterviewWriteData, "scheduledAt" | "durationMinutes" | "mode" | "location" | "note">>;

/**
 * "Chờ đặt lịch" (F13): SHORTLISTED, hoặc INTERVIEWING mà chưa có lịch SCHEDULED
 * nào (chuyển tay qua PATCH status, hoặc mọi lịch đã bị huỷ).
 */
const AWAITING_SCHEDULE = Prisma.sql`(
  a."status" = 'SHORTLISTED'
  OR (a."status" = 'INTERVIEWING' AND NOT EXISTS (
    SELECT 1 FROM interviews i WHERE i."applicationId" = a."id" AND i."status" = 'SCHEDULED'))
)`;

export class InterviewsRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  /**
   * Khoá các dòng hồ sơ tới hết transaction: hai employer đặt lịch cùng lúc cho
   * một hồ sơ thì người sau chờ, rồi thấy lịch của người trước (ALREADY_SCHEDULED).
   * Sắp id trước khi khoá để hai lô chồng nhau không khoá chéo (deadlock).
   */
  async lockApplications(ids: string[], tx: Prisma.TransactionClient): Promise<void> {
    if (ids.length === 0) return;
    const sorted = [...ids].sort();
    await tx.$queryRaw(Prisma.sql`
      SELECT a."id" FROM applications a WHERE a."id" IN (${Prisma.join(sorted)}) ORDER BY a."id" FOR UPDATE
    `);
  }

  async findSchedulableApplications(ids: string[], companyId: string, db: Db = this.prisma): Promise<SchedulableApplication[]> {
    const rows = await db.application.findMany({
      where: { id: { in: ids }, jobPost: { companyId } },
      select: {
        id: true,
        status: true,
        candidate: { select: { userId: true } },
        jobPost: { select: { title: true, company: { select: { name: true } } } },
        interviews: { where: { status: "SCHEDULED", scheduledAt: { gt: new Date() } }, select: { id: true }, take: 1 },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      candidateUserId: row.candidate.userId,
      jobPostTitle: row.jobPost.title,
      companyName: row.jobPost.company.name,
      hasUpcomingInterview: row.interviews.length > 0,
    }));
  }

  create(data: InterviewWriteData, db: Db = this.prisma): Promise<InterviewWithRelations> {
    return db.interview.create({ data, include: interviewInclude });
  }

  findByIdForCompany(id: string, companyId: string, db: Db = this.prisma): Promise<InterviewWithRelations | null> {
    return db.interview.findFirst({ where: { id, application: { jobPost: { companyId } } }, include: interviewInclude });
  }

  findById(id: string, db: Db = this.prisma): Promise<InterviewWithRelations | null> {
    return db.interview.findUnique({ where: { id }, include: interviewInclude });
  }

  /**
   * Chỉ sửa khi lịch vẫn SCHEDULED và chưa diễn ra — điều kiện nằm trong câu
   * UPDATE nên một lượt huỷ chen vào giữa lúc đọc và lúc ghi không bị ghi đè.
   * Trả về số dòng đã sửa (0 hoặc 1).
   */
  async updateIfUpcoming(id: string, data: InterviewUpdateData, db: Db = this.prisma): Promise<number> {
    const result = await db.interview.updateMany({
      where: { id, status: "SCHEDULED", scheduledAt: { gt: new Date() } },
      data,
    });
    return result.count;
  }

  async cancelIfUpcoming(id: string, reason: string, db: Db = this.prisma): Promise<number> {
    const result = await db.interview.updateMany({
      where: { id, status: "SCHEDULED", scheduledAt: { gt: new Date() } },
      data: { status: "CANCELLED", cancelReason: reason },
    });
    return result.count;
  }

  /** Hồ sơ có kết quả (REJECTED/ACCEPTED): huỷ mọi lịch chưa diễn ra của nó. */
  async cancelUpcomingForApplication(applicationId: string, reason: string, db: Db = this.prisma): Promise<number> {
    const result = await db.interview.updateMany({
      where: { applicationId, status: "SCHEDULED", scheduledAt: { gt: new Date() } },
      data: { status: "CANCELLED", cancelReason: reason },
    });
    return result.count;
  }

  /** Lịch của cả công ty có scheduledAt trong [from, to), sớm nhất trước. */
  listForCompany(
    companyId: string,
    options: { from: Date; to: Date; includeCancelled: boolean },
  ): Promise<InterviewWithRelations[]> {
    return this.prisma.interview.findMany({
      where: {
        application: { jobPost: { companyId } },
        scheduledAt: { gte: options.from, lt: options.to },
        ...(options.includeCancelled ? {} : { status: "SCHEDULED" }),
      },
      include: interviewInclude,
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
    });
  }

  /**
   * Lịch chưa diễn ra của hồ sơ đang INTERVIEWING, có scheduledAt trước `until`
   * (`until` = null: không giới hạn), sớm nhất trước.
   */
  async listUpcomingForCompany(
    companyId: string,
    until: Date | null,
    limit: number,
  ): Promise<{ total: number; items: InterviewWithRelations[] }> {
    const where: Prisma.InterviewWhereInput = {
      status: "SCHEDULED",
      scheduledAt: { gt: new Date(), ...(until ? { lt: until } : {}) },
      application: { status: "INTERVIEWING", jobPost: { companyId } },
    };
    const [total, items] = await Promise.all([
      this.prisma.interview.count({ where }),
      this.prisma.interview.findMany({
        where,
        include: interviewInclude,
        orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
        take: limit,
      }),
    ]);
    return { total, items };
  }

  listForCandidate(candidateId: string, limit: number): Promise<InterviewWithRelations[]> {
    return this.prisma.interview.findMany({
      where: { application: { candidateId } },
      include: interviewInclude,
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      take: limit,
    });
  }

  /** Hồ sơ chờ đặt lịch, chờ lâu nhất trước; `total` là tổng không phụ thuộc `limit`. */
  async listAwaitingSchedule(
    companyId: string,
    options: { jobPostId?: string | undefined; limit: number },
  ): Promise<{ total: number; items: AwaitingScheduleRow[] }> {
    const jobFilter = options.jobPostId ? Prisma.sql`AND j."id" = ${options.jobPostId}` : Prisma.empty;
    // Mốc chờ: lần vào trạng thái hiện tại theo lịch sử, không có thì updatedAt.
    const rows = await this.prisma.$queryRaw<Array<AwaitingScheduleRow & { total: number }>>(Prisma.sql`
      SELECT a."id" AS "applicationId", a."status"::text AS "status",
             c."fullName" AS "candidateName", c."avatarUrl" AS "candidateAvatarUrl",
             j."id" AS "jobPostId", j."title" AS "jobPostTitle",
             COALESCE(
               (SELECT MAX(h."createdAt") FROM application_status_history h
                WHERE h."applicationId" = a."id" AND h."toStatus" = a."status"),
               a."updatedAt") AS "waitingSince",
             COUNT(*) OVER ()::int AS "total"
      FROM applications a
      JOIN job_posts j ON j."id" = a."jobPostId"
      JOIN candidates c ON c."id" = a."candidateId"
      WHERE j."companyId" = ${companyId} ${jobFilter} AND ${AWAITING_SCHEDULE}
      ORDER BY "waitingSince" ASC, a."id"
      LIMIT ${options.limit}
    `);
    return {
      total: rows[0]?.total ?? 0,
      items: rows.map(({ total: _total, ...item }) => item),
    };
  }

  /** Cho cron nhắc lịch: lịch SCHEDULED của hồ sơ INTERVIEWING có scheduledAt trong [from, to). */
  listScheduledBetween(from: Date, to: Date): Promise<InterviewWithRelations[]> {
    return this.prisma.interview.findMany({
      where: {
        status: "SCHEDULED",
        scheduledAt: { gte: from, lt: to },
        application: { status: "INTERVIEWING" },
      },
      include: interviewInclude,
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
    });
  }
}
