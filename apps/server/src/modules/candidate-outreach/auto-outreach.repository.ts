import { Prisma, type AutoOutreachExhaustedReason, type PrismaClient } from "@prisma/client";
import { BLOCKING_INVITATION_STATUSES, CANDIDATE_DAILY_INVITATION_CAP } from "./candidate-outreach.config";
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
  /** Lần chấm bảng điểm gần nhất của tin (AD-24). null ⇒ chưa chấm, lượt tự mời đi đường cũ. */
  matchScoresAt: Date | null;
}

/** Một người trong hàng chờ tự mời đọc từ bảng điểm (0.6 bước 6, AD-27 mục 7). */
export interface ScoredOutreachCandidate {
  candidateId: string;
  score: number;
  weightsVersion: string;
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
        j."matchScoresAt",
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
   * Ứng viên vừa bật cho liên hệ (AD-27 mục 1, plan live-rescore bước 2): xoá dấu "hết ứng
   * viên" của các tin đang chạy tự mời (cùng điều kiện `findRunnableJobs`) có chung ít nhất
   * một kỹ năng APPROVED với ứng viên (cùng điều kiện pool của bộ chấm). Trả các công ty có
   * tin vừa được xoá dấu để kích hoạt lượt tự mời. Tin chưa có dấu không cần xoá: cron 15
   * phút xét lại như thường.
   */
  async clearExhaustedForCandidate(candidateId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ companyId: string }>>(Prisma.sql`
      WITH cleared AS (
        UPDATE job_posts j
        SET "autoOutreachExhaustedAt" = NULL, "autoOutreachExhaustedReason" = NULL
        WHERE j."autoOutreachExhaustedAt" IS NOT NULL
          AND j."status" = 'PUBLISHED'
          AND j."autoOutreachEnabled" = true
          AND (j."expiresAt" IS NULL OR j."expiresAt" > ${NOW_UTC})
          AND EXISTS (
            SELECT 1
            FROM job_post_skills jps
            JOIN candidate_skills cs ON cs."skillId" = jps."skillId" AND cs."candidateId" = ${candidateId}
            JOIN skills s ON s."id" = jps."skillId" AND s."status" = 'APPROVED'
            WHERE jps."jobPostId" = j."id"
          )
        RETURNING j."companyId"
      )
      SELECT DISTINCT "companyId" FROM cleared
    `);
    return rows.map((row) => row.companyId);
  }

  /**
   * Sau lượt chấm theo ứng viên (0.6, AD-27 mục 6, plan live-rescore bước 4): trong các cặp
   * (ứng viên, tin) vừa đạt ngưỡng, giữ cặp có tin đang chạy tự mời (cùng điều kiện
   * `findRunnableJobs`) và ứng viên còn mời được (cùng điều kiện `searchCandidatePool` có
   * `excludeCappedToday`: bật cho liên hệ, chưa nộp đơn, không có lời mời chặn, chưa đủ trần
   * hôm nay). Xoá dấu "hết ứng viên" của các tin đó và trả các công ty của chúng (kể cả tin
   * chưa có dấu) để kích hoạt lượt tự mời. Một câu.
   */
  async clearExhaustedForMatches(pairs: Array<{ candidateId: string; jobPostId: string }>): Promise<string[]> {
    if (pairs.length === 0) return [];
    const rows = await this.prisma.$queryRaw<Array<{ companyId: string }>>(Prisma.sql`
      WITH eligible AS (
        SELECT DISTINCT j."id", j."companyId"
        FROM unnest(${pairs.map((pair) => pair.candidateId)}::text[], ${pairs.map((pair) => pair.jobPostId)}::text[])
          AS p("candidateId", "jobPostId")
        JOIN job_posts j ON j."id" = p."jobPostId"
        JOIN candidates c ON c."id" = p."candidateId" AND c."isOpenToOutreach" = true
        WHERE j."status" = 'PUBLISHED'
          AND j."autoOutreachEnabled" = true
          AND (j."expiresAt" IS NULL OR j."expiresAt" > ${NOW_UTC})
          AND NOT EXISTS (
            SELECT 1 FROM applications a
            WHERE a."candidateId" = p."candidateId" AND a."jobPostId" = j."id"
          )
          AND NOT EXISTS (
            SELECT 1 FROM candidate_outreach_invitations i
            WHERE i."candidateId" = p."candidateId" AND i."jobPostId" = j."id"
              AND i."status"::text IN (${Prisma.join(BLOCKING_INVITATION_STATUSES)})
          )
          AND (
            SELECT COUNT(*) FROM candidate_outreach_invitations r
            WHERE r."candidateId" = p."candidateId" AND r."createdAt" >= ${START_OF_UTC_DAY}
          ) < ${CANDIDATE_DAILY_INVITATION_CAP}
      ),
      cleared AS (
        UPDATE job_posts
        SET "autoOutreachExhaustedAt" = NULL, "autoOutreachExhaustedReason" = NULL
        WHERE "id" IN (SELECT "id" FROM eligible) AND "autoOutreachExhaustedAt" IS NOT NULL
      )
      SELECT DISTINCT "companyId" FROM eligible ORDER BY "companyId"
    `);
    return rows.map((row) => row.companyId);
  }

  /**
   * Hàng chờ tự mời của một tin đọc từ bảng điểm (0.6 bước 6, AD-27 mục 7), không chấm lại:
   * điểm ≥ `minScore` và còn mời được (cùng điều kiện `searchCandidatePool` có
   * `excludeCappedToday`: bật cho liên hệ, chưa nộp đơn, không có lời mời chặn, chưa đủ trần
   * hôm nay). Điểm giảm dần; bằng điểm thì nhiều kỹ năng APPROVED chung với tin hơn trước
   * (như thứ tự của pool cũ), rồi theo id. Dòng `semanticPending` (rule-only) vẫn được lấy,
   * như số "Phù hợp" đang đếm. Dùng index `(jobPostId, score)`.
   *
   * `includeCappedToday` (trang tìm ứng viên, 0.6 bước 7): không bỏ người đã nhận đủ trần
   * hôm nay, như `searchCandidatePool` không bật `excludeCappedToday` — trang vẫn hiện họ
   * kèm `cappedToday`.
   */
  async findScoredQueue(
    jobPostId: string,
    minScore: number,
    limit: number,
    options: { includeCappedToday?: boolean } = {},
  ): Promise<ScoredOutreachCandidate[]> {
    if (limit <= 0) return [];
    const cappedFilter = options.includeCappedToday
      ? Prisma.empty
      : Prisma.sql`AND (
          SELECT COUNT(*) FROM candidate_outreach_invitations r
          WHERE r."candidateId" = s."candidateId" AND r."createdAt" >= ${START_OF_UTC_DAY}
        ) < ${CANDIDATE_DAILY_INVITATION_CAP}`;
    return this.prisma.$queryRaw<ScoredOutreachCandidate[]>(Prisma.sql`
      SELECT s."candidateId", s."score", s."weightsVersion"
      FROM job_candidate_match_scores s
      JOIN candidates c ON c."id" = s."candidateId" AND c."isOpenToOutreach" = true
      WHERE s."jobPostId" = ${jobPostId}
        AND s."score" >= ${minScore}
        AND NOT EXISTS (
          SELECT 1 FROM applications a
          WHERE a."candidateId" = s."candidateId" AND a."jobPostId" = ${jobPostId}
        )
        AND NOT EXISTS (
          SELECT 1 FROM candidate_outreach_invitations i
          WHERE i."candidateId" = s."candidateId" AND i."jobPostId" = ${jobPostId}
            AND i."status"::text IN (${Prisma.join(BLOCKING_INVITATION_STATUSES)})
        )
        ${cappedFilter}
      ORDER BY
        s."score" DESC,
        (
          SELECT COUNT(*) FROM candidate_skills cs
          JOIN job_post_skills jps ON jps."skillId" = cs."skillId" AND jps."jobPostId" = ${jobPostId}
          JOIN skills sk ON sk."id" = cs."skillId" AND sk."status" = 'APPROVED'
          WHERE cs."candidateId" = s."candidateId"
        ) DESC,
        s."candidateId"
      LIMIT ${limit}
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
