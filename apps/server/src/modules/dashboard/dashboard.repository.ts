import { Prisma, type PrismaClient, type Role } from "@prisma/client";
import type {
  CatalogEntryKind,
  DailyPoint,
  DashboardRange,
  FunnelStep,
  PeriodComparison,
  WaitBuckets,
} from "@sip/shared-types";

// Module dashboard CHỈ ĐỌC (AD-16 mục 1): mọi câu ở đây là SELECT.
//
// Cột DateTime của Prisma là `timestamp(3)` không múi giờ, lưu giờ UTC. Nhóm
// theo ngày Việt Nam phải đổi UTC → Asia/Ho_Chi_Minh trước khi lấy ::date; mốc
// "bây giờ" so với cột đó dùng NOW_UTC (cùng kiểu, không phụ thuộc TimeZone của
// phiên). Giá trị enum viết thẳng dạng chuỗi trong SQL: tham số kiểu text không
// so sánh được với cột enum.

const NOW_UTC = Prisma.sql`(now() AT TIME ZONE 'UTC')`;
const VN_TODAY = Prisma.sql`(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;
const VN_NOW = Prisma.sql`(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')`;

function vnTimestamp(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')`;
}

function vnDate(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`${vnTimestamp(column)}::date`;
}

/** `column` rơi vào `days` ngày gần nhất tính cả hôm nay (giờ Việt Nam). */
function inLastDays(column: Prisma.Sql, days: number): Prisma.Sql {
  return Prisma.sql`${vnDate(column)} > ${VN_TODAY} - ${days}::int`;
}

/** Ba cột under24h / oneToTwoDays / over2Days tính trên các dòng thoả `filter`. */
function waitBucketColumns(since: Prisma.Sql, filter: Prisma.Sql = Prisma.sql`TRUE`): Prisma.Sql {
  return Prisma.sql`
    COUNT(*) FILTER (WHERE ${filter} AND ${since} > ${NOW_UTC} - interval '24 hours')::int AS "under24h",
    COUNT(*) FILTER (WHERE ${filter} AND ${since} <= ${NOW_UTC} - interval '24 hours'
                                     AND ${since} > ${NOW_UTC} - interval '48 hours')::int AS "oneToTwoDays",
    COUNT(*) FILTER (WHERE ${filter} AND ${since} <= ${NOW_UTC} - interval '48 hours')::int AS "over2Days"`;
}

function toWaitBuckets(row: WaitBuckets | undefined): WaitBuckets {
  return {
    under24h: row?.under24h ?? 0,
    oneToTwoDays: row?.oneToTwoDays ?? 0,
    over2Days: row?.over2Days ?? 0,
  };
}

/** Mốc chờ duyệt của tin PENDING: lần gửi duyệt gần nhất, không có thì updatedAt. */
const JOB_POST_SUBMITTED_AT = Prisma.sql`COALESCE(
  (SELECT MAX(ma."createdAt") FROM job_post_moderation_actions ma
   WHERE ma."jobPostId" = j."id" AND ma."action" = 'SUBMITTED'),
  j."updatedAt")`;

/** Mốc chờ xác minh của công ty PENDING (D13); updatedAt chỉ là dự phòng cho dòng thiếu dữ liệu. */
const COMPANY_SUBMITTED_AT = Prisma.sql`COALESCE(c."verificationSubmittedAt", c."updatedAt")`;

/** Hạng trên đường chính của phễu; REJECTED/CANCELLED không nằm trên đường chính ⇒ 0. */
function funnelRank(status: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`CASE ${status}
    WHEN 'REVIEWING' THEN 1 WHEN 'SHORTLISTED' THEN 2 WHEN 'INTERVIEWING' THEN 3 WHEN 'ACCEPTED' THEN 4
    ELSE 0 END`;
}

const FUNNEL_STEPS: readonly FunnelStep[] = ["APPLIED", "REVIEWING", "SHORTLISTED", "INTERVIEWING", "ACCEPTED"];

// ─── Kiểu dòng trả về ───────────────────────────────────────────────────────

export interface ApplicationSummaryRow {
  newLast7Days: PeriodComparison;
  pendingCount: number;
  pendingWait: WaitBuckets;
  oldestPendingSince: Date | null;
}

export interface PendingApplicationRow {
  applicationId: string;
  candidateName: string | null;
  candidateAvatarUrl: string | null;
  jobPostId: string;
  jobPostTitle: string;
  waitingSince: Date;
}

export interface ExpiringJobRow {
  jobPostId: string;
  title: string;
  expiresAt: Date;
}

export interface RejectedJobRow {
  jobPostId: string;
  title: string;
  rejectedReason: string | null;
  rejectedAt: Date;
}

export interface Page<T> {
  total: number;
  items: T[];
}

export interface QueueSummaryRow {
  total: number;
  wait: WaitBuckets;
}

export interface CatalogQueueRow extends QueueSummaryRow {
  skills: number;
  universities: number;
  majors: number;
}

type WithTotal<T> = T & { total: number };

function toPage<T extends object>(rows: WithTotal<T>[]): Page<T> {
  return {
    total: rows[0]?.total ?? 0,
    items: rows.map(({ total: _total, ...item }) => item as unknown as T),
  };
}

export class DashboardRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  // ─── Employer (phạm vi cả công ty) ────────────────────────────────────────

  async applicationSummary(companyId: string): Promise<ApplicationSummaryRow> {
    const since = Prisma.sql`COALESCE(a."reappliedAt", a."createdAt")`;
    const isPending = Prisma.sql`a."status" = 'PENDING'`;
    const [row] = await this.prisma.$queryRaw<
      Array<WaitBuckets & { newCurrent: number; newPrevious: number; pendingCount: number; oldestPendingSince: Date | null }>
    >(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE ${inLastDays(Prisma.sql`a."createdAt"`, 7)})::int AS "newCurrent",
        COUNT(*) FILTER (WHERE ${inLastDays(Prisma.sql`a."createdAt"`, 14)}
                           AND NOT ${inLastDays(Prisma.sql`a."createdAt"`, 7)})::int AS "newPrevious",
        COUNT(*) FILTER (WHERE ${isPending})::int AS "pendingCount",
        MIN(${since}) FILTER (WHERE ${isPending}) AS "oldestPendingSince",
        ${waitBucketColumns(since, isPending)}
      FROM applications a
      JOIN job_posts j ON j."id" = a."jobPostId"
      WHERE j."companyId" = ${companyId}
    `);
    return {
      newLast7Days: { current: row?.newCurrent ?? 0, previous: row?.newPrevious ?? 0 },
      pendingCount: row?.pendingCount ?? 0,
      pendingWait: toWaitBuckets(row),
      oldestPendingSince: row?.oldestPendingSince ?? null,
    };
  }

  /** Hồ sơ PENDING chờ lâu nhất trước. */
  listPendingApplications(companyId: string, limit: number): Promise<PendingApplicationRow[]> {
    return this.prisma.$queryRaw<PendingApplicationRow[]>(Prisma.sql`
      SELECT a."id" AS "applicationId", c."fullName" AS "candidateName", c."avatarUrl" AS "candidateAvatarUrl",
             j."id" AS "jobPostId", j."title" AS "jobPostTitle",
             COALESCE(a."reappliedAt", a."createdAt") AS "waitingSince"
      FROM applications a
      JOIN job_posts j ON j."id" = a."jobPostId"
      JOIN candidates c ON c."id" = a."candidateId"
      WHERE j."companyId" = ${companyId} AND a."status" = 'PENDING'
      ORDER BY "waitingSince" ASC, a."id"
      LIMIT ${limit}
    `);
  }

  countExpiringJobs(companyId: string, days: number): Promise<number> {
    return this.prisma.jobPost.count({
      where: {
        companyId,
        status: "PUBLISHED",
        expiresAt: { gt: new Date(), lte: new Date(Date.now() + days * 24 * 60 * 60 * 1000) },
      },
    });
  }

  /** Tin PUBLISHED hết hạn trong `days` ngày tới, gần hạn nhất trước. */
  async listExpiringJobs(companyId: string, days: number, limit: number): Promise<Page<ExpiringJobRow>> {
    const rows = await this.prisma.$queryRaw<WithTotal<ExpiringJobRow>[]>(Prisma.sql`
      SELECT j."id" AS "jobPostId", j."title", j."expiresAt", COUNT(*) OVER ()::int AS "total"
      FROM job_posts j
      WHERE j."companyId" = ${companyId} AND j."status" = 'PUBLISHED'
        AND j."expiresAt" > ${NOW_UTC} AND j."expiresAt" <= ${NOW_UTC} + make_interval(days => ${days}::int)
      ORDER BY j."expiresAt" ASC, j."id"
      LIMIT ${limit}
    `);
    return toPage(rows);
  }

  /** Tin bị Admin từ chối (đang DRAFT, thao tác kiểm duyệt gần nhất là REJECTED), mới nhất trước. */
  async listRejectedJobs(companyId: string, limit: number): Promise<Page<RejectedJobRow>> {
    const rows = await this.prisma.$queryRaw<WithTotal<RejectedJobRow>[]>(Prisma.sql`
      SELECT j."id" AS "jobPostId", j."title", last."reason" AS "rejectedReason", last."createdAt" AS "rejectedAt",
             COUNT(*) OVER ()::int AS "total"
      FROM job_posts j
      JOIN LATERAL (
        SELECT ma."action", ma."reason", ma."createdAt" FROM job_post_moderation_actions ma
        WHERE ma."jobPostId" = j."id" ORDER BY ma."createdAt" DESC LIMIT 1
      ) last ON last."action" = 'REJECTED'
      WHERE j."companyId" = ${companyId} AND j."status" = 'DRAFT'
      ORDER BY last."createdAt" DESC, j."id"
      LIMIT ${limit}
    `);
    return toPage(rows);
  }

  /** Tin PUBLISHED có nhiều hồ sơ nhất (không tính hồ sơ đã huỷ). */
  async findTopPublishedJob(companyId: string): Promise<{ id: string; title: string; applicationCount: number } | null> {
    const [row] = await this.prisma.$queryRaw<Array<{ id: string; title: string; applicationCount: number }>>(Prisma.sql`
      SELECT j."id", j."title", COUNT(a."id")::int AS "applicationCount"
      FROM job_posts j
      JOIN applications a ON a."jobPostId" = j."id" AND a."status" <> 'CANCELLED'
      WHERE j."companyId" = ${companyId} AND j."status" = 'PUBLISHED'
      GROUP BY j."id", j."title"
      ORDER BY "applicationCount" DESC, j."title"
      LIMIT 1
    `);
    return row ?? null;
  }

  /**
   * Hội thoại chưa đọc của một employer, tin mới nhất trước — cùng điều kiện
   * "chưa đọc" với MessagingRepository.countUnreadConversations. Tên ứng viên
   * lấy fullName, không có thì phần trước @ của email (giống messaging.mapper).
   */
  listUnreadConversations(
    employerId: string,
    userId: string,
    limit: number,
  ): Promise<Array<{ conversationId: string; candidateName: string; lastMessageAt: Date }>> {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT c."id" AS "conversationId",
             COALESCE(NULLIF(cand."fullName", ''), split_part(u."email", '@', 1)) AS "candidateName",
             MAX(m."createdAt") AS "lastMessageAt"
      FROM conversations c
      JOIN candidates cand ON cand."id" = c."candidateId"
      JOIN users u ON u."id" = cand."userId"
      JOIN messages m ON m."conversationId" = c."id"
        AND m."senderId" <> ${userId}
        AND (c."employerLastReadAt" IS NULL OR m."createdAt" > c."employerLastReadAt")
      WHERE c."employerId" = ${employerId} AND c."employerDeletedAt" IS NULL
      GROUP BY c."id", cand."fullName", u."email"
      ORDER BY "lastMessageAt" DESC
      LIMIT ${limit}
    `);
  }

  async outreachLast30Days(companyId: string): Promise<{ sent: number; accepted: number; declined: number }> {
    const [row] = await this.prisma.$queryRaw<Array<{ sent: number; accepted: number; declined: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS "sent",
             COUNT(*) FILTER (WHERE i."status" = 'ACCEPTED')::int AS "accepted",
             COUNT(*) FILTER (WHERE i."status" = 'DECLINED')::int AS "declined"
      FROM candidate_outreach_invitations i
      WHERE i."companyId" = ${companyId} AND i."createdAt" > ${NOW_UTC} - interval '30 days'
    `);
    return { sent: row?.sent ?? 0, accepted: row?.accepted ?? 0, declined: row?.declined ?? 0 };
  }

  /**
   * Số lịch SCHEDULED (hồ sơ đang INTERVIEWING) theo từng ngày, từ hôm nay tới 6
   * ngày sau (giờ Việt Nam) — tính cả buổi đã qua trong hôm nay để cột "hôm nay"
   * phản ánh cả ngày làm việc. Chuỗi hướng về tương lai nên không dùng dailySeries.
   */
  interviewsNext7Days(companyId: string): Promise<DailyPoint[]> {
    return this.prisma.$queryRaw<DailyPoint[]>(Prisma.sql`
      WITH days AS (
        SELECT (${VN_TODAY} + g)::date AS "day" FROM generate_series(0, 6) AS g
      ), counts AS (
        SELECT ${vnDate(Prisma.sql`i."scheduledAt"`)} AS "day", COUNT(*)::int AS "value"
        FROM interviews i
        JOIN applications a ON a."id" = i."applicationId"
        JOIN job_posts j ON j."id" = a."jobPostId"
        WHERE j."companyId" = ${companyId} AND i."status" = 'SCHEDULED' AND a."status" = 'INTERVIEWING'
          AND ${vnDate(Prisma.sql`i."scheduledAt"`)} BETWEEN ${VN_TODAY} AND ${VN_TODAY} + 6
        GROUP BY 1
      )
      SELECT to_char(d."day", 'YYYY-MM-DD') AS "date", COALESCE(c."value", 0)::int AS "value"
      FROM days d
      LEFT JOIN counts c ON c."day" = d."day"
      ORDER BY d."day"
    `);
  }

  applicationsDaily(companyId: string, range: DashboardRange): Promise<DailyPoint[]> {
    return this.dailySeries(
      range,
      Prisma.sql`
        SELECT ${vnDate(Prisma.sql`a."createdAt"`)} AS "day", COUNT(*)::int AS "value"
        FROM applications a
        JOIN job_posts j ON j."id" = a."jobPostId"
        WHERE j."companyId" = ${companyId} AND ${inLastDays(Prisma.sql`a."createdAt"`, range)}
        GROUP BY 1`,
    );
  }

  /** `job_post_daily_stats.date` đã là ngày Việt Nam (ghi lúc tăng lượt xem). */
  viewsDaily(companyId: string, range: DashboardRange): Promise<DailyPoint[]> {
    return this.dailySeries(
      range,
      Prisma.sql`
        SELECT s."date" AS "day", SUM(s."views")::int AS "value"
        FROM job_post_daily_stats s
        JOIN job_posts j ON j."id" = s."jobPostId"
        WHERE j."companyId" = ${companyId} AND s."date" > ${VN_TODAY} - ${range}::int
        GROUP BY 1`,
    );
  }

  /**
   * Phễu theo quy ước AD-16 mục 6: bước đạt được = max(hạng trạng thái hiện tại,
   * hạng lớn nhất trong lịch sử) — nên số đếm luôn giảm dần theo bước kể cả với
   * hồ sơ cũ chỉ có dòng backfill. Hồ sơ đã huỷ không tính.
   */
  async funnel(
    companyId: string,
    range: DashboardRange,
  ): Promise<{ steps: Array<{ step: FunnelStep; count: number }>; legacyRejected: number }> {
    const [row] = await this.prisma.$queryRaw<
      Array<{ s0: number; s1: number; s2: number; s3: number; s4: number; legacyRejected: number }>
    >(Prisma.sql`
      WITH apps AS (
        SELECT a."id", a."status",
               GREATEST(${funnelRank(Prisma.sql`a."status"::text`)},
                        COALESCE(MAX(${funnelRank(Prisma.sql`h."toStatus"::text`)}), 0)) AS "reached",
               COALESCE(BOOL_OR(h."fromStatus" IS NOT NULL), FALSE) AS "hasDetail"
        FROM applications a
        JOIN job_posts j ON j."id" = a."jobPostId"
        LEFT JOIN application_status_history h ON h."applicationId" = a."id"
        WHERE j."companyId" = ${companyId} AND a."status" <> 'CANCELLED'
          AND ${inLastDays(Prisma.sql`a."createdAt"`, range)}
        GROUP BY a."id", a."status"
      )
      SELECT COUNT(*)::int AS "s0",
             COUNT(*) FILTER (WHERE "reached" >= 1)::int AS "s1",
             COUNT(*) FILTER (WHERE "reached" >= 2)::int AS "s2",
             COUNT(*) FILTER (WHERE "reached" >= 3)::int AS "s3",
             COUNT(*) FILTER (WHERE "reached" >= 4)::int AS "s4",
             COUNT(*) FILTER (WHERE "status" = 'REJECTED' AND "reached" = 0 AND NOT "hasDetail")::int AS "legacyRejected"
      FROM apps
    `);
    const counts = [row?.s0, row?.s1, row?.s2, row?.s3, row?.s4];
    return {
      steps: FUNNEL_STEPS.map((step, index) => ({ step, count: counts[index] ?? 0 })),
      legacyRejected: row?.legacyRejected ?? 0,
    };
  }

  /**
   * Thời gian từ lúc hồ sơ vào PENDING tới lần employer xem xét/từ chối, với các
   * lần phản hồi xảy ra trong kỳ. Mốc bắt đầu là dòng history gần nhất có
   * toStatus = PENDING (dòng tạo, ứng tuyển lại, hoặc backfill của hồ sơ khi đó
   * đang PENDING). Chỉ xét dòng phản hồi có fromStatus (AD-16 mục 6).
   */
  async firstResponse(companyId: string, range: DashboardRange): Promise<{ averageHours: number | null; sampleSize: number }> {
    const [row] = await this.prisma.$queryRaw<Array<{ averageHours: number | null; sampleSize: number }>>(Prisma.sql`
      WITH responses AS (
        SELECT h."createdAt" AS "respondedAt",
               (SELECT MAX(p."createdAt") FROM application_status_history p
                WHERE p."applicationId" = h."applicationId" AND p."toStatus" = 'PENDING'
                  AND p."createdAt" <= h."createdAt") AS "startedAt"
        FROM application_status_history h
        JOIN applications a ON a."id" = h."applicationId"
        JOIN job_posts j ON j."id" = a."jobPostId"
        WHERE j."companyId" = ${companyId}
          AND h."fromStatus" = 'PENDING' AND h."toStatus" IN ('REVIEWING', 'REJECTED')
          AND ${inLastDays(Prisma.sql`h."createdAt"`, range)}
      )
      SELECT (AVG(EXTRACT(EPOCH FROM ("respondedAt" - "startedAt"))) / 3600)::float8 AS "averageHours",
             COUNT(*)::int AS "sampleSize"
      FROM responses
      WHERE "startedAt" IS NOT NULL
    `);
    return { averageHours: row?.averageHours ?? null, sampleSize: row?.sampleSize ?? 0 };
  }

  // ─── Admin (toàn hệ thống) ────────────────────────────────────────────────

  /** Công ty PENDING — mốc chờ là lần cập nhật cuối (nộp/nộp lại hồ sơ xác minh). */
  async companyQueueSummary(): Promise<QueueSummaryRow> {
    const [row] = await this.prisma.$queryRaw<Array<WaitBuckets & { total: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS "total", ${waitBucketColumns(COMPANY_SUBMITTED_AT)}
      FROM companies c
      WHERE c."verificationStatus" = 'PENDING'
    `);
    return { total: row?.total ?? 0, wait: toWaitBuckets(row) };
  }

  async jobPostQueueSummary(): Promise<QueueSummaryRow> {
    const [row] = await this.prisma.$queryRaw<Array<WaitBuckets & { total: number }>>(Prisma.sql`
      WITH queue AS (
        SELECT ${JOB_POST_SUBMITTED_AT} AS "since" FROM job_posts j WHERE j."status" = 'PENDING'
      )
      SELECT COUNT(*)::int AS "total", ${waitBucketColumns(Prisma.sql`"since"`)}
      FROM queue
    `);
    return { total: row?.total ?? 0, wait: toWaitBuckets(row) };
  }

  async catalogQueueSummary(): Promise<CatalogQueueRow> {
    const [row] = await this.prisma.$queryRaw<
      Array<WaitBuckets & { total: number; skills: number; universities: number; majors: number }>
    >(Prisma.sql`
      WITH queue AS (${this.pendingCatalogEntries()})
      SELECT COUNT(*)::int AS "total",
             COUNT(*) FILTER (WHERE "kind" = 'SKILL')::int AS "skills",
             COUNT(*) FILTER (WHERE "kind" = 'UNIVERSITY')::int AS "universities",
             COUNT(*) FILTER (WHERE "kind" = 'MAJOR')::int AS "majors",
             ${waitBucketColumns(Prisma.sql`"createdAt"`)}
      FROM queue
    `);
    return {
      total: row?.total ?? 0,
      skills: row?.skills ?? 0,
      universities: row?.universities ?? 0,
      majors: row?.majors ?? 0,
      wait: toWaitBuckets(row),
    };
  }

  listPendingJobPosts(
    limit: number,
  ): Promise<Array<{ jobPostId: string; title: string; companyName: string; submittedAt: Date }>> {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT j."id" AS "jobPostId", j."title", c."name" AS "companyName", ${JOB_POST_SUBMITTED_AT} AS "submittedAt"
      FROM job_posts j
      JOIN companies c ON c."id" = j."companyId"
      WHERE j."status" = 'PENDING'
      ORDER BY "submittedAt" ASC, j."id"
      LIMIT ${limit}
    `);
  }

  listPendingCompanies(limit: number): Promise<
    Array<{ companyId: string; name: string; taxCode: string | null; businessLicenseUrl: string | null; submittedAt: Date }>
  > {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT c."id" AS "companyId", c."name", c."taxCode", c."businessLicenseUrl", ${COMPANY_SUBMITTED_AT} AS "submittedAt"
      FROM companies c
      WHERE c."verificationStatus" = 'PENDING'
      ORDER BY "submittedAt" ASC, c."id"
      LIMIT ${limit}
    `);
  }

  listPendingCatalogEntries(limit: number): Promise<Array<{ id: string; kind: CatalogEntryKind; name: string; createdAt: Date }>> {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT "id", "kind", "name", "createdAt" FROM (${this.pendingCatalogEntries()}) queue
      ORDER BY "createdAt" ASC, "id"
      LIMIT ${limit}
    `);
  }

  /** Tài khoản Ứng viên + Nhà tuyển dụng mới: 7 ngày so với 7 ngày trước đó. */
  async newUsersLast7Days(): Promise<PeriodComparison> {
    const [row] = await this.prisma.$queryRaw<Array<{ current: number; previous: number }>>(Prisma.sql`
      SELECT COUNT(*) FILTER (WHERE ${inLastDays(Prisma.sql`u."createdAt"`, 7)})::int AS "current",
             COUNT(*) FILTER (WHERE NOT ${inLastDays(Prisma.sql`u."createdAt"`, 7)})::int AS "previous"
      FROM users u
      WHERE u."role" <> 'ADMIN' AND ${inLastDays(Prisma.sql`u."createdAt"`, 14)}
    `);
    return { current: row?.current ?? 0, previous: row?.previous ?? 0 };
  }

  /** D11 — SUM(amount) của Payment COMPLETED theo tháng của updatedAt (giờ Việt Nam). */
  async revenueThisMonth(): Promise<PeriodComparison> {
    const paidAt = vnTimestamp(Prisma.sql`p."updatedAt"`);
    const [row] = await this.prisma.$queryRaw<Array<{ current: number; previous: number }>>(Prisma.sql`
      SELECT
        COALESCE(SUM(p."amount") FILTER (WHERE date_trunc('month', ${paidAt}) = date_trunc('month', ${VN_NOW})), 0)::float8 AS "current",
        COALESCE(SUM(p."amount") FILTER (
          WHERE date_trunc('month', ${paidAt}) = date_trunc('month', ${VN_NOW}) - interval '1 month'), 0)::float8 AS "previous"
      FROM payments p
      WHERE p."status" = 'COMPLETED'
    `);
    return { current: row?.current ?? 0, previous: row?.previous ?? 0 };
  }

  /** Gói ACTIVE còn hạn (cron hạ gói chạy lệch nên lọc thêm endDate > now). */
  async activeSubscriptions(
    expiringWithinDays: number,
  ): Promise<{ active: number; expiringSoon: number; byPlan: Array<{ planId: string; planName: string; count: number }> }> {
    const rows = await this.prisma.$queryRaw<Array<{ planId: string; planName: string; count: number; expiringSoon: number }>>(
      Prisma.sql`
        SELECT sp."id" AS "planId", sp."name" AS "planName", COUNT(*)::int AS "count",
               COUNT(*) FILTER (WHERE cs."endDate" <= ${NOW_UTC} + make_interval(days => ${expiringWithinDays}::int))::int AS "expiringSoon"
        FROM company_subscriptions cs
        JOIN subscription_plans sp ON sp."id" = cs."planId"
        WHERE cs."status" = 'ACTIVE' AND cs."endDate" > ${NOW_UTC}
        GROUP BY sp."id", sp."name"
        ORDER BY "count" DESC, sp."name"
      `,
    );
    return {
      active: rows.reduce((sum, row) => sum + row.count, 0),
      expiringSoon: rows.reduce((sum, row) => sum + row.expiringSoon, 0),
      byPlan: rows.map(({ planId, planName, count }) => ({ planId, planName, count })),
    };
  }

  newUsersDaily(range: DashboardRange): Promise<DailyPoint[]> {
    return this.dailySeries(
      range,
      Prisma.sql`
        SELECT ${vnDate(Prisma.sql`u."createdAt"`)} AS "day", COUNT(*)::int AS "value"
        FROM users u
        WHERE u."role" <> 'ADMIN' AND ${inLastDays(Prisma.sql`u."createdAt"`, range)}
        GROUP BY 1`,
    );
  }

  /** Doanh thu tháng hiện tại (giờ Việt Nam) theo bốn khối ngày 1–7, 8–14, 15–21, 22–hết tháng. */
  async revenueWeekly(): Promise<{ month: string; weeks: Array<{ fromDay: number; toDay: number; amount: number }> }> {
    const paidAt = vnTimestamp(Prisma.sql`p."updatedAt"`);
    const [meta] = await this.prisma.$queryRaw<Array<{ month: string; daysInMonth: number }>>(Prisma.sql`
      SELECT to_char(${VN_NOW}, 'YYYY-MM') AS "month",
             EXTRACT(DAY FROM date_trunc('month', ${VN_NOW}) + interval '1 month - 1 day')::int AS "daysInMonth"
    `);
    const rows = await this.prisma.$queryRaw<Array<{ block: number; amount: number }>>(Prisma.sql`
      SELECT LEAST((EXTRACT(DAY FROM ${paidAt})::int - 1) / 7, 3) AS "block", SUM(p."amount")::float8 AS "amount"
      FROM payments p
      WHERE p."status" = 'COMPLETED' AND date_trunc('month', ${paidAt}) = date_trunc('month', ${VN_NOW})
      GROUP BY 1
    `);
    const amountByBlock = new Map(rows.map((row) => [row.block, row.amount]));
    const daysInMonth = meta?.daysInMonth ?? 31;
    return {
      month: meta?.month ?? "",
      weeks: [0, 1, 2, 3].map((block) => ({
        fromDay: block * 7 + 1,
        toDay: block === 3 ? daysInMonth : block * 7 + 7,
        amount: amountByBlock.get(block) ?? 0,
      })),
    };
  }

  async usersByRole(): Promise<Record<Role, number>> {
    const rows = await this.prisma.user.groupBy({ by: ["role"], _count: { _all: true } });
    const result: Record<Role, number> = { CANDIDATE: 0, EMPLOYER: 0, ADMIN: 0 };
    for (const row of rows) result[row.role] = row._count._all;
    return result;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Kỹ năng, trường, ngành đang PENDING gộp chung một hàng chờ. */
  private pendingCatalogEntries(): Prisma.Sql {
    return Prisma.sql`
      SELECT s."id", 'SKILL' AS "kind", s."name", s."createdAt" FROM skills s WHERE s."status" = 'PENDING'
      UNION ALL
      SELECT un."id", 'UNIVERSITY' AS "kind", un."name", un."createdAt" FROM universities un WHERE un."status" = 'PENDING'
      UNION ALL
      SELECT m."id", 'MAJOR' AS "kind", m."name", m."createdAt" FROM majors m WHERE m."status" = 'PENDING'`;
  }

  /**
   * Chuỗi `range` ngày tới hôm nay (giờ Việt Nam), ngày không có dữ liệu = 0.
   * `counts` phải trả hai cột "day" (date) và "value" (int).
   */
  private dailySeries(range: DashboardRange, counts: Prisma.Sql): Promise<DailyPoint[]> {
    return this.prisma.$queryRaw<DailyPoint[]>(Prisma.sql`
      WITH days AS (
        SELECT (${VN_TODAY} - g)::date AS "day" FROM generate_series(0, ${range}::int - 1) AS g
      ), counts AS (${counts})
      SELECT to_char(d."day", 'YYYY-MM-DD') AS "date", COALESCE(c."value", 0)::int AS "value"
      FROM days d
      LEFT JOIN counts c ON c."day" = d."day"
      ORDER BY d."day"
    `);
  }
}
