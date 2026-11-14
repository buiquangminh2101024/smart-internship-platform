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

/** Một dòng điểm khi chấm theo ứng viên (0.6): như `MatchScoreRow` nhưng theo tin. */
export interface CandidateScoreRow {
  jobPostId: string;
  score: number;
  semanticPending: boolean;
  weightsVersion: string;
}

/**
 * Một cặp đổi trạng thái "đạt ngưỡng" (điểm ≥ `autoOutreachMinScore` của tin, cùng mốc với
 * số "Phù hợp") sau khi chấm theo ứng viên (0.6, việc kéo theo ở bước 4).
 */
export interface MatchTransition {
  candidateId: string;
  jobPostId: string;
  companyId: string;
  autoOutreachEnabled: boolean;
  /** true ⇒ vừa đạt ngưỡng (trước dưới ngưỡng hoặc chưa có dòng); false ⇒ vừa rớt khỏi ngưỡng. */
  matched: boolean;
}

export interface CandidateScoreWriteResult {
  rows: number;
  marksCleared: number;
  transitions: MatchTransition[];
  /**
   * Ứng viên lần đầu có điểm đầy đủ: trước lô không có dòng nào (với tin đang hiển thị) mà
   * điểm có phần ngữ nghĩa, nay có ít nhất một dòng như vậy (job alert lần đầu, Q3).
   * Dòng `semanticPending` (rule-only, chờ embedding) không tính, để báo theo điểm đầy đủ.
   */
  newlyScored: string[];
}

/** Dòng cũ (bị thay) của một ứng viên với tin đang hiển thị. */
export interface PreviousScoreRow {
  candidateId: string;
  jobPostId: string;
  score: number;
  semanticPending: boolean;
}

/** Tin đang hiển thị của các dòng vừa ghi hoặc vừa xoá, kèm ngưỡng. */
export interface TransitionJobRow {
  id: string;
  companyId: string;
  minScore: number;
  autoOutreachEnabled: boolean;
}

/**
 * So dòng cũ và dòng mới của một lô (thuần, để test). Chỉ xét tin còn trong `jobs` (đang
 * hiển thị lúc ghi). Dòng mới bị lọc vì tin thôi hiển thị không có trong `jobs` nên bỏ qua.
 */
export function diffCandidateScores(
  previous: PreviousScoreRow[],
  rowsByCandidate: Map<string, CandidateScoreRow[]>,
  jobs: Map<string, TransitionJobRow>,
): Pick<CandidateScoreWriteResult, "transitions" | "newlyScored"> {
  const before = new Map<string, Map<string, PreviousScoreRow>>();
  for (const row of previous) {
    let byJob = before.get(row.candidateId);
    if (!byJob) before.set(row.candidateId, (byJob = new Map()));
    byJob.set(row.jobPostId, row);
  }

  const transitions: MatchTransition[] = [];
  const newlyScored: string[] = [];
  const push = (candidateId: string, job: TransitionJobRow, matched: boolean) =>
    transitions.push({
      candidateId,
      jobPostId: job.id,
      companyId: job.companyId,
      autoOutreachEnabled: job.autoOutreachEnabled,
      matched,
    });

  for (const [candidateId, rows] of rowsByCandidate) {
    const old = before.get(candidateId) ?? new Map<string, PreviousScoreRow>();
    const seen = new Set<string>();
    let hasFullNow = false;
    for (const row of rows) {
      const job = jobs.get(row.jobPostId);
      if (!job) continue;
      seen.add(row.jobPostId);
      if (!row.semanticPending) hasFullNow = true;
      const was = (old.get(row.jobPostId)?.score ?? -1) >= job.minScore;
      const now = row.score >= job.minScore;
      if (was !== now) push(candidateId, job, now);
    }
    for (const [jobPostId, row] of old) {
      const job = jobs.get(jobPostId);
      if (!job || seen.has(jobPostId)) continue;
      if (row.score >= job.minScore) push(candidateId, job, false);
    }
    const hadFullBefore = [...old.values()].some((row) => !row.semanticPending);
    if (hasFullNow && !hadFullBefore) newlyScored.push(candidateId);
  }
  return { transitions, newlyScored };
}

export interface RescoreJobRow {
  id: string;
  matchScoresAt: Date | null;
}

/** Kết quả thay điểm của một tin khi tin còn hiển thị. */
export interface ReplaceForJobResult {
  /**
   * Ứng viên có dòng cũ `semanticPending` (rule-only) với tin này, lấy từ câu xoá
   * (`RETURNING`, không thêm câu). Lượt đêm gom lại để báo job alert lần đầu cho người
   * trước đó chỉ có điểm rule-only (AD-27 mục 6). Bình thường rỗng.
   */
  pendingBefore: string[];
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
   * (trả null) và xoá dòng cũ của tin. Câu xoá trả thêm người có dòng cũ rule-only.
   *
   * `matchScoresAt` ghi bằng SQL để không đổi `updatedAt` của tin: đây là việc của hệ
   * thống, không phải người đăng tin sửa tin (cùng lý do với `markExhausted` của 0.2).
   */
  async replaceForJob(jobPostId: string, rows: MatchScoreRow[], scoredAt: Date): Promise<ReplaceForJobResult | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const touched = await tx.$executeRaw(Prisma.sql`
          UPDATE job_posts j SET "matchScoresAt" = ${scoredAt}
          WHERE j."id" = ${jobPostId} AND ${VISIBLE_JOB}
        `);
        const pending = await tx.$queryRaw<Array<{ candidateId: string }>>(Prisma.sql`
          WITH deleted AS (
            DELETE FROM job_candidate_match_scores WHERE "jobPostId" = ${jobPostId}
            RETURNING "candidateId", "semanticPending"
          )
          SELECT "candidateId" FROM deleted WHERE "semanticPending"
        `);
        if (touched === 0) return null;

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
        return { pendingBefore: pending.map((row) => row.candidateId) };
      },
      // Mặc định 5 giây không đủ chắc cho Neon ở xa khi tin có ~1.000 dòng.
      { maxWait: 10_000, timeout: 30_000 },
    );
  }

  /**
   * Chấm lại theo ứng viên (0.6, AD-27 mục 4–5, plan bước 3): thay điểm của một lô ứng viên
   * trong **một** transaction, kèm xoá dấu "cần chấm lại".
   * - Xoá dòng của các ứng viên trong lô với các tin đang hiển thị, rồi ghi dòng mới. Dòng
   *   với tin đã thôi hiển thị giữ nguyên cho lượt đêm xoá (tiến độ của tin vừa đóng vẫn
   *   đọc bảng, như trước khi có 0.6).
   * - Tin thôi hiển thị trong lúc chấm thì bỏ dòng của tin đó (lọc lại `VISIBLE_JOB` trong
   *   transaction).
   * - `skipDuplicates`: lượt theo tin (lối a, lượt đêm) ghi cùng cặp xen giữa lúc xoá và lúc
   *   ghi thì giữ dòng của lượt kia thay vì làm hỏng cả lô; Q2 đánh dấu lại người đó nếu
   *   dòng kia tính từ hồ sơ cũ.
   * - Xoá dấu của `clearMarksFor` chỉ khi dấu ≤ `batchStartedAt` (D2): ứng viên sửa tiếp
   *   trong lúc chấm thì giữ dấu cho lượt sau.
   *
   * `batchStartedAt` lấy từ đồng hồ DB lúc chọn lô (cùng đồng hồ với dấu), trước khi nạp hồ sơ.
   *
   * Việc kéo theo (bước 4): câu xoá trả lại dòng cũ (`RETURNING`), câu lọc tin đang hiển thị
   * trả thêm công ty và ngưỡng, nên so được cũ / mới (`diffCandidateScores`) mà không thêm
   * round trip.
   */
  async replaceForCandidates(input: {
    rowsByCandidate: Map<string, CandidateScoreRow[]>;
    clearMarksFor: string[];
    batchStartedAt: Date;
    scoredAt: Date;
  }): Promise<CandidateScoreWriteResult> {
    const candidateIds = [...input.rowsByCandidate.keys()];
    if (candidateIds.length === 0 && input.clearMarksFor.length === 0) {
      return { rows: 0, marksCleared: 0, transitions: [], newlyScored: [] };
    }
    const newJobIds = [...input.rowsByCandidate.values()].flat().map((row) => row.jobPostId);

    return this.prisma.$transaction(
      async (tx) => {
        const previous =
          candidateIds.length === 0
            ? []
            : await tx.$queryRaw<PreviousScoreRow[]>(Prisma.sql`
                DELETE FROM job_candidate_match_scores s
                USING job_posts j
                WHERE j."id" = s."jobPostId" AND s."candidateId" IN (${Prisma.join(candidateIds)}) AND ${VISIBLE_JOB}
                RETURNING s."candidateId", s."jobPostId", s."score", s."semanticPending"
              `);

        let written = 0;
        const jobIds = [...new Set([...newJobIds, ...previous.map((row) => row.jobPostId)])];
        const jobs = new Map<string, TransitionJobRow>();
        if (jobIds.length > 0) {
          const rows = await tx.$queryRaw<TransitionJobRow[]>(Prisma.sql`
            SELECT j."id", j."companyId", j."autoOutreachMinScore" AS "minScore", j."autoOutreachEnabled"
            FROM job_posts j WHERE j."id" IN (${Prisma.join(jobIds)}) AND ${VISIBLE_JOB}
          `);
          for (const row of rows) jobs.set(row.id, row);
          const data = [...input.rowsByCandidate].flatMap(([candidateId, rows]) =>
            rows
              .filter((row) => jobs.has(row.jobPostId))
              .map((row) => ({
                jobPostId: row.jobPostId,
                candidateId,
                score: row.score,
                semanticPending: row.semanticPending,
                weightsVersion: row.weightsVersion,
                scoredAt: input.scoredAt,
              })),
          );
          for (let i = 0; i < data.length; i += INSERT_CHUNK_SIZE) {
            const { count } = await tx.jobCandidateMatchScore.createMany({
              data: data.slice(i, i + INSERT_CHUNK_SIZE),
              skipDuplicates: true,
            });
            written += count;
          }
        }

        const marksCleared =
          input.clearMarksFor.length === 0
            ? 0
            : await tx.$executeRaw(Prisma.sql`
                UPDATE candidates SET "matchRescoreRequestedAt" = NULL
                WHERE "id" IN (${Prisma.join(input.clearMarksFor)})
                  AND "matchRescoreRequestedAt" <= ${input.batchStartedAt}
              `);
        return { rows: written, marksCleared, ...diffCandidateScores(previous, input.rowsByCandidate, jobs) };
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  }

  /**
   * Số dòng điểm với tin đang hiển thị của từng ứng viên (lượt đêm, job alert lần đầu: so
   * với số tin mà người đó có dòng rule-only). Ứng viên không có dòng ⇒ không có trong Map.
   */
  async countVisibleRows(candidateIds: string[]): Promise<Map<string, number>> {
    if (candidateIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<Array<{ candidateId: string; count: number }>>(Prisma.sql`
      SELECT s."candidateId", COUNT(*)::int AS "count"
      FROM job_candidate_match_scores s
      JOIN job_posts j ON j."id" = s."jobPostId"
      WHERE s."candidateId" IN (${Prisma.join(candidateIds)}) AND ${VISIBLE_JOB}
      GROUP BY s."candidateId"
    `);
    return new Map(rows.map((row) => [row.candidateId, row.count]));
  }

  /**
   * Q2 (AD-27): sau khi lượt theo tin ghi điểm, đánh dấu lại người trong pool đã sửa hồ sơ
   * sau lúc nạp hồ sơ (`matchProfileChangedAt > since`) mà dấu đã bị xoá — tức lượt theo
   * ứng viên đã chấm họ, rồi lượt này ghi đè bằng điểm từ hồ sơ cũ. Người còn dấu thì để
   * nguyên (lượt theo ứng viên sắp ghi đè đúng). Ghi bằng SQL, không đổi `updatedAt`.
   */
  async markChangedSince(candidateIds: string[], since: Date): Promise<number> {
    if (candidateIds.length === 0) return 0;
    return this.prisma.$executeRaw(Prisma.sql`
      UPDATE candidates SET "matchRescoreRequestedAt" = ${NOW_UTC}
      WHERE "id" IN (${Prisma.join(candidateIds)})
        AND "matchRescoreRequestedAt" IS NULL
        AND "matchProfileChangedAt" > ${since}
    `);
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
