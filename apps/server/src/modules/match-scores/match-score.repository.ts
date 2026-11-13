import { Prisma, type PrismaClient } from "@prisma/client";
import { NOW_UTC } from "../candidate-outreach/candidate-outreach.repository";

// Bảng điểm lưu sẵn (AD-24, 0.3): đọc pool cần chấm, thay điểm của một tin và đếm
// tiến độ tuyển theo tin. Ngưỡng, đơn và lời mời không lưu trong bảng mà so lúc đọc
// (AD-24 mục 3), nên đổi ngưỡng của tin không cần chấm lại.

/** Mỗi lệnh INSERT tối đa chừng này dòng (pool lớn nhất ở bộ demo là 882). */
const INSERT_CHUNK_SIZE = 1_000;

/**
 * Tin "đang hiển thị": PUBLISHED và chưa quá hạn, cùng điều kiện với tìm kiếm công khai.
 * Cần bí danh `j` (job_posts). Dùng lại ở nhóm `focus=reject` của trang "Ứng viên" (AD-25).
 */
export const VISIBLE_JOB = Prisma.sql`j."status" = 'PUBLISHED' AND (j."expiresAt" IS NULL OR j."expiresAt" > ${NOW_UTC})`;

/**
 * Đếm Phù hợp của tin `j` (định nghĩa ở `HiringProgressRow`). Dùng làm LATERAL subquery,
 * chung cho tiến độ tuyển (bước 5) và danh sách tin (bước 6), để hai nơi luôn ra cùng số.
 * Mỗi ứng viên có tối đa một đơn vào một tin (unique jobPostId + candidateId).
 */
const MATCHED_COUNTS = Prisma.sql`
  SELECT
    COUNT(*) FILTER (
      WHERE (a."id" IS NULL AND c."isOpenToOutreach")
         OR a."status" NOT IN ('CANCELLED', 'REJECTED', 'JOB_CLOSED')
    )::int AS "matched",
    COUNT(*) FILTER (WHERE a."status" NOT IN ('CANCELLED', 'REJECTED', 'JOB_CLOSED'))::int AS "matchedApplied"
  FROM job_candidate_match_scores s
  JOIN candidates c ON c."id" = s."candidateId"
  LEFT JOIN applications a ON a."jobPostId" = s."jobPostId" AND a."candidateId" = s."candidateId"
  WHERE s."jobPostId" = j."id" AND s."score" >= j."autoOutreachMinScore"
`;

export interface MatchScoreRow {
  candidateId: string;
  score: number;
  /** true ⇒ chưa có embedding lúc chấm, điểm là rule-only. */
  semanticPending: boolean;
  weightsVersion: string;
}

export interface RescoreJobRow {
  id: string;
  matchScoresAt: Date | null;
}

/**
 * Tiến độ tuyển của một tin. `matched` = điểm ≥ ngưỡng tự mời của tin, thuộc một trong
 * hai nhóm (chốt 2026-11-11):
 * - chưa nộp: bật cho liên hệ và KHÔNG có đơn nào vào tin — đúng nhóm mà trang tìm
 *   ứng viên và tự mời 0.2 lấy ra;
 * - đã nộp: đơn đang xét hoặc đã tuyển (không phải CANCELLED / REJECTED / JOB_CLOSED).
 * Người đã huỷ đơn, bị từ chối hoặc có đơn bị hệ thống đóng (AD-25) không được đếm. `matchedApplied` = nhóm đã nộp.
 */
export interface HiringProgressRow {
  jobPostId: string;
  title: string;
  employerId: string;
  expiresAt: Date | null;
  hiringTarget: number;
  autoOutreachEnabled: boolean;
  /** null ⇒ tin chưa được chấm lần nào. */
  matchScoresAt: Date | null;
  matched: number;
  matchedApplied: number;
  /** Mọi lời mời của tin: cả tay lẫn tự động, mọi trạng thái (quyết định #9). */
  invited: number;
  acceptedInvitations: number;
  /** Đơn INTERVIEWING. */
  interviewing: number;
  /** Đơn ACCEPTED, khớp `hiredCount` của thẻ tự mời (0.2). */
  hired: number;
}

export class MatchScoreRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  // ─── Chấm ────────────────────────────────────────────────────────────────

  /**
   * Mọi ứng viên có chung ≥ 1 kỹ năng APPROVED với tin. Khác `searchCandidatePool`:
   * không lọc opt-in, đơn hay lời mời, không LIMIT (quyết định #2). Người nộp đơn mà
   * không có kỹ năng chung thì không có ở đây, nên không được chấm.
   */
  async findScoringPool(jobPostId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT DISTINCT cs."candidateId" AS id
      FROM candidate_skills cs
      JOIN job_post_skills jps ON jps."skillId" = cs."skillId" AND jps."jobPostId" = ${jobPostId}
      JOIN skills s ON s."id" = cs."skillId" AND s."status" = 'APPROVED'
      ORDER BY cs."candidateId"
    `);
    return rows.map((row) => row.id);
  }

  async isJobVisible(jobPostId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ ok: number }>>(Prisma.sql`
      SELECT 1 AS ok FROM job_posts j WHERE j."id" = ${jobPostId} AND ${VISIBLE_JOB}
    `);
    return rows.length > 0;
  }

  /**
   * Tin đang hiển thị cần chấm, chấm lâu nhất trước (null = chưa chấm lần nào, đứng đầu).
   * Job đêm hết thời gian thì dừng; tin còn lại vẫn cũ nhất nên đêm sau được chấm trước.
   */
  findJobsToRescore(filter: { companyId?: string; jobPostId?: string } = {}): Promise<RescoreJobRow[]> {
    const companyFilter = filter.companyId ? Prisma.sql`AND j."companyId" = ${filter.companyId}` : Prisma.empty;
    const jobFilter = filter.jobPostId ? Prisma.sql`AND j."id" = ${filter.jobPostId}` : Prisma.empty;
    return this.prisma.$queryRaw<RescoreJobRow[]>(Prisma.sql`
      SELECT j."id", j."matchScoresAt"
      FROM job_posts j
      WHERE ${VISIBLE_JOB} ${companyFilter} ${jobFilter}
      ORDER BY j."matchScoresAt" ASC NULLS FIRST, j."id"
    `);
  }

  /**
   * Thay toàn bộ điểm của một tin trong một transaction: người đọc không bao giờ thấy
   * bảng của tin trống giữa chừng. Tin đã thôi hiển thị trong lúc chấm thì không ghi
   * (trả false) và xoá dòng cũ của tin.
   *
   * `matchScoresAt` ghi bằng SQL để không đổi `updatedAt` của tin: đây là việc của hệ
   * thống, không phải người đăng tin sửa tin (cùng lý do với `markExhausted` của 0.2).
   */
  async replaceForJob(jobPostId: string, rows: MatchScoreRow[], scoredAt: Date): Promise<boolean> {
    return this.prisma.$transaction(
      async (tx) => {
        const touched = await tx.$executeRaw(Prisma.sql`
          UPDATE job_posts j SET "matchScoresAt" = ${scoredAt}
          WHERE j."id" = ${jobPostId} AND ${VISIBLE_JOB}
        `);
        await tx.jobCandidateMatchScore.deleteMany({ where: { jobPostId } });
        if (touched === 0) return false;

        for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
          await tx.jobCandidateMatchScore.createMany({
            data: rows.slice(i, i + INSERT_CHUNK_SIZE).map((row) => ({
              jobPostId,
              candidateId: row.candidateId,
              score: row.score,
              semanticPending: row.semanticPending,
              weightsVersion: row.weightsVersion,
              scoredAt,
            })),
          });
        }
        return true;
      },
      // Mặc định 5 giây không đủ chắc cho Neon ở xa khi tin có ~1.000 dòng.
      { maxWait: 10_000, timeout: 30_000 },
    );
  }

  /**
   * Xoá dòng của tin không còn hiển thị (hết hạn, đóng, bị gỡ...) và đặt lại
   * `matchScoresAt` = null, để nếu tin hiển thị lại thì được coi là chưa chấm. Job đêm gọi.
   */
  async deleteForInactiveJobs(): Promise<{ deletedRows: number; resetJobs: number }> {
    return this.prisma.$transaction(async (tx) => {
      const deletedRows = await tx.$executeRaw(Prisma.sql`
        DELETE FROM job_candidate_match_scores s
        USING job_posts j
        WHERE j."id" = s."jobPostId" AND NOT (${VISIBLE_JOB})
      `);
      const resetJobs = await tx.$executeRaw(Prisma.sql`
        UPDATE job_posts j SET "matchScoresAt" = NULL
        WHERE j."matchScoresAt" IS NOT NULL AND NOT (${VISIBLE_JOB})
      `);
      return { deletedRows, resetJobs };
    });
  }

  // ─── Đọc tiến độ ─────────────────────────────────────────────────────────

  /** Mọi tin đang hiển thị của công ty. Service xếp "cần chú ý" và cắt 5 tin. */
  progressForCompany(companyId: string): Promise<HiringProgressRow[]> {
    return this.progress(Prisma.sql`j."companyId" = ${companyId} AND ${VISIBLE_JOB}`);
  }

  /** Một tin, ở mọi trạng thái (thẻ tự mời hiện cả khi tin chưa hiển thị). */
  async progressForJob(jobPostId: string): Promise<HiringProgressRow | null> {
    const rows = await this.progress(Prisma.sql`j."id" = ${jobPostId}`);
    return rows[0] ?? null;
  }

  /**
   * Số Phù hợp của các tin trong một trang danh sách tin (bước 6), một câu gộp. Chỉ tin
   * đang hiển thị có trong Map; tin khác trạng thái thì không có khoá.
   */
  /**
   * AD-26 (D5) — điểm lưu của MỘT ứng viên cho các tin trong `jobPostIds` (tin không có
   * dòng thì không có trong Map). Dùng index (candidateId, score DESC).
   */
  async scoresForCandidate(candidateId: string, jobPostIds: string[]): Promise<Map<string, number>> {
    if (jobPostIds.length === 0) return new Map();
    const rows = await this.prisma.jobCandidateMatchScore.findMany({
      where: { candidateId, jobPostId: { in: jobPostIds } },
      select: { jobPostId: true, score: true },
    });
    return new Map(rows.map((row) => [row.jobPostId, row.score]));
  }

  async matchedCounts(jobPostIds: string[]): Promise<Map<string, number>> {
    if (jobPostIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<Array<{ jobPostId: string; matched: number }>>(Prisma.sql`
      SELECT j."id" AS "jobPostId", m."matched"
      FROM job_posts j
      CROSS JOIN LATERAL (${MATCHED_COUNTS}) m
      WHERE j."id" IN (${Prisma.join(jobPostIds)}) AND ${VISIBLE_JOB}
    `);
    return new Map(rows.map((row) => [row.jobPostId, row.matched]));
  }

  /**
   * Một câu gộp cho mọi tin thoả `where`. Phần đếm điểm dùng index (jobPostId, score);
   * đơn tra theo unique (jobPostId, candidateId), nên LEFT JOIN không nhân đôi dòng.
   */
  private progress(where: Prisma.Sql): Promise<HiringProgressRow[]> {
    return this.prisma.$queryRaw<HiringProgressRow[]>(Prisma.sql`
      SELECT
        j."id" AS "jobPostId", j."title", j."employerId", j."expiresAt", j."hiringTarget",
        j."autoOutreachEnabled", j."matchScoresAt",
        m."matched", m."matchedApplied",
        inv."invited", inv."acceptedInvitations",
        app."interviewing", app."hired"
      FROM job_posts j
      CROSS JOIN LATERAL (${MATCHED_COUNTS}) m
      CROSS JOIN LATERAL (
        SELECT
          COUNT(*)::int AS "invited",
          COUNT(*) FILTER (WHERE i."status" = 'ACCEPTED')::int AS "acceptedInvitations"
        FROM candidate_outreach_invitations i
        WHERE i."jobPostId" = j."id"
      ) inv
      CROSS JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE a."status" = 'INTERVIEWING')::int AS "interviewing",
          COUNT(*) FILTER (WHERE a."status" = 'ACCEPTED')::int AS "hired"
        FROM applications a
        WHERE a."jobPostId" = j."id"
      ) app
      WHERE ${where}
      ORDER BY j."id"
    `);
  }
}
