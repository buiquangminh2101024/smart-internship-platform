import { Prisma, type PrismaClient } from "@prisma/client";
import { NOW_UTC } from "../candidate-outreach/candidate-outreach.repository";
import { APPLIED_AT, LAST_INTERVIEW_AT, type StatusChangeTarget } from "../applications/applications.repository";
import { VISIBLE_JOB } from "../match-scores/match-score.repository";
import { AUTO_CLOSE_GRACE_DAYS, AUTO_CLOSE_INTERVIEWED_DAYS } from "./application-automation.config";

/** Giới hạn phạm vi một lượt: cả hệ thống, một công ty (script `--company`), một tin, một hồ sơ. */
export interface AutomationScope {
  companyId?: string | undefined;
  jobPostId?: string | undefined;
  applicationId?: string | undefined;
}

/** Hồ sơ tới hạn đóng, kèm đủ đầu vào để `closeDecision` xét lại. */
export interface CloseCandidateRow extends StatusChangeTarget {
  jobClosedAt: Date;
  lastInterviewAt: Date | null;
  hasUpcomingInterview: boolean;
  autoCloseInterviewedEnabled: boolean;
}

/**
 * Mốc "ngày tin đóng" của tin `j` (bước 0). `CLOSED` và `TAKEN_DOWN` thiếu mốc (dữ liệu cũ)
 * thì lùi về `updatedAt`, tức chỉ đóng muộn hơn chứ không sớm hơn. `LEAST` của Postgres bỏ qua
 * NULL nên tin `EXPIRED` không có `expiresAt` (hết gói) dùng `updatedAt`.
 */
export const JOB_CLOSED_AT = Prisma.sql`(CASE j."status"
  WHEN 'CLOSED' THEN COALESCE(j."closedAt", j."updatedAt")
  WHEN 'EXPIRED' THEN LEAST(j."expiresAt", j."updatedAt")
  WHEN 'TAKEN_DOWN' THEN COALESCE(
    (SELECT MAX(m."createdAt") FROM job_post_moderation_actions m
     WHERE m."jobPostId" = j."id" AND m."action" = 'RETRACTED'),
    j."updatedAt")
END)`;

/** Có lịch SCHEDULED chưa diễn ra (G3). */
const HAS_UPCOMING_INTERVIEW = Prisma.sql`EXISTS (
  SELECT 1 FROM interviews i
  WHERE i."applicationId" = a."id" AND i."status" = 'SCHEDULED' AND i."scheduledAt" > ${NOW_UTC})`;

/**
 * Ngày tới hạn tự đóng — cùng quy tắc với `closeDecision` (application-automation.policy.ts),
 * dùng các cột `x."closedOn"`, `x."lastInterviewAt"`, `x."hasUpcoming"` của LATERAL `x`.
 * NULL ⇒ không tự đóng (G3, G4 khi tắt công tắc).
 */
export const CLOSE_DUE_AT = Prisma.sql`(CASE
  WHEN a."status" = 'PENDING' THEN x."closedOn"
  WHEN x."hasUpcoming" THEN NULL
  WHEN x."lastInterviewAt" IS NOT NULL THEN
    CASE WHEN j."autoCloseInterviewedEnabled"
      THEN GREATEST(x."closedOn", x."lastInterviewAt") + make_interval(days => ${AUTO_CLOSE_INTERVIEWED_DAYS}::int)
    END
  ELSE x."closedOn" + make_interval(days => ${AUTO_CLOSE_GRACE_DAYS}::int)
END)`;

/** Hồ sơ chưa kết thúc ở tin đã ngừng tuyển (bí danh `a`, `j`). */
export const OPEN_ON_CLOSED_JOB = Prisma.sql`
  j."status" IN ('EXPIRED', 'CLOSED', 'TAKEN_DOWN')
  AND a."status" IN ('PENDING', 'REVIEWING', 'SHORTLISTED', 'INTERVIEWING')`;

/** Cột của `StatusChangeTarget` (bí danh `a`, `j`, `co` companies, `c` candidates). */
const TARGET_COLUMNS = Prisma.sql`
  a."id" AS "id", a."status"::text AS "status", a."jobPostId" AS "jobPostId",
  j."title" AS "jobPostTitle", co."name" AS "companyName", c."userId" AS "candidateUserId"`;

const TARGET_FROM = Prisma.sql`
  FROM applications a
  JOIN job_posts j ON j."id" = a."jobPostId"
  JOIN companies co ON co."id" = j."companyId"
  JOIN candidates c ON c."id" = a."candidateId"`;

function scopeWhere(scope: AutomationScope): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  if (scope.companyId) conditions.push(Prisma.sql`AND j."companyId" = ${scope.companyId}`);
  if (scope.jobPostId) conditions.push(Prisma.sql`AND a."jobPostId" = ${scope.jobPostId}`);
  if (scope.applicationId) conditions.push(Prisma.sql`AND a."id" = ${scope.applicationId}`);
  return conditions.length > 0 ? Prisma.join(conditions, " ") : Prisma.empty;
}

/**
 * Chỉ đọc. Mọi lần đổi trạng thái đi qua `ApplicationsService.changeStatusBySystem` (AD-25:
 * một lối duy nhất), module này không tự UPDATE bảng `applications`.
 */
export class ApplicationAutomationRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  /**
   * Hồ sơ cần tự chuyển "Đang xem xét" (bước 4b): Chờ duyệt, tin đang hiển thị (cùng điều kiện
   * `VISIBLE_JOB` của AD-24), tin bật `autoReviewEnabled`, có dòng điểm với điểm ≥ X.
   * Nộp sớm nhất trước, tối đa `limit` hồ sơ.
   */
  findAutoReviewTargets(scope: AutomationScope, limit: number): Promise<StatusChangeTarget[]> {
    return this.prisma.$queryRaw<StatusChangeTarget[]>(Prisma.sql`
      SELECT ${TARGET_COLUMNS}
      ${TARGET_FROM}
      JOIN job_candidate_match_scores ms ON ms."jobPostId" = a."jobPostId" AND ms."candidateId" = a."candidateId"
      WHERE a."status" = 'PENDING' AND ${VISIBLE_JOB} AND j."autoReviewEnabled"
        AND ms."score" >= j."autoOutreachMinScore"
        ${scopeWhere(scope)}
      ORDER BY ${APPLIED_AT} ASC, a."id" ASC
      LIMIT ${limit}
    `);
  }

  /**
   * Hồ sơ đã tới hạn tự đóng (bước 4c), hạn sớm nhất trước, tối đa `limit` hồ sơ. Lọc hạn
   * bằng `CLOSE_DUE_AT` để giới hạn mỗi lượt không bị các hồ sơ không đóng (G3, G4 tắt) chiếm chỗ;
   * service xét lại từng dòng bằng `closeDecision`.
   */
  findCloseTargets(scope: AutomationScope, limit: number): Promise<CloseCandidateRow[]> {
    return this.prisma.$queryRaw<CloseCandidateRow[]>(Prisma.sql`
      SELECT ${TARGET_COLUMNS},
             x."closedOn" AS "jobClosedAt", x."lastInterviewAt" AS "lastInterviewAt",
             x."hasUpcoming" AS "hasUpcomingInterview",
             j."autoCloseInterviewedEnabled" AS "autoCloseInterviewedEnabled"
      ${TARGET_FROM}
      CROSS JOIN LATERAL (
        SELECT ${JOB_CLOSED_AT} AS "closedOn",
               ${LAST_INTERVIEW_AT} AS "lastInterviewAt",
               ${HAS_UPCOMING_INTERVIEW} AS "hasUpcoming"
      ) x
      WHERE ${OPEN_ON_CLOSED_JOB}
        AND x."closedOn" IS NOT NULL
        AND ${CLOSE_DUE_AT} <= ${NOW_UTC}
        ${scopeWhere(scope)}
      ORDER BY ${CLOSE_DUE_AT} ASC, a."id" ASC
      LIMIT ${limit}
    `);
  }
}
