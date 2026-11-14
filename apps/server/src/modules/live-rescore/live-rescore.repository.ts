import { Prisma, type PrismaClient } from "@prisma/client";
import { NOW_UTC } from "../candidate-outreach/candidate-outreach.repository";
import { VISIBLE_JOB } from "../match-scores/match-score.repository";

/**
 * Đọc / ghi dấu "cần chấm lại" trên `candidates` (AD-27 mục 1, D1). Ghi bằng SQL để
 * không đổi `Candidate.updatedAt`: đây là việc của hệ thống, không phải ứng viên sửa hồ sơ.
 * Giờ lấy từ đồng hồ DB (`NOW_UTC`), cùng đồng hồ với mốc "lúc bắt đầu lô" khi xoá dấu (D2).
 */
export class LiveRescoreRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  /**
   * Đặt dấu và `matchProfileChangedAt` (Q2) bằng cùng một giờ. Trả số ứng viên đã đánh dấu.
   */
  async markCandidates(candidateIds: string[]): Promise<number> {
    const ids = [...new Set(candidateIds)];
    if (ids.length === 0) return 0;
    return this.prisma.$executeRaw(Prisma.sql`
      UPDATE candidates
      SET "matchRescoreRequestedAt" = ${NOW_UTC}, "matchProfileChangedAt" = ${NOW_UTC}
      WHERE "id" IN (${Prisma.join(ids)})
    `);
  }

  /**
   * Lô kế tiếp của lượt chấm: tối đa `limit` ứng viên có dấu, dấu cũ nhất trước, trừ người
   * lượt này đã xử lý (người giữ dấu vì lỗi hay vượt giới hạn embedding không bị chọn lại
   * trong cùng lượt). `startedAt` là giờ của DB lúc chọn — mốc "bắt đầu lô" để xoá dấu (D2),
   * cùng đồng hồ với dấu và luôn trước lúc nạp hồ sơ.
   */
  async findMarkedBatch(limit: number, exclude: ReadonlySet<string>): Promise<{ ids: string[]; startedAt: Date }> {
    const excluded = exclude.size > 0 ? Prisma.sql`AND NOT ("id" = ANY(${[...exclude]}::text[]))` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Array<{ id: string | null; now: Date }>>(Prisma.sql`
      SELECT c."id", n."now"
      FROM (SELECT ${NOW_UTC} AS "now") n
      LEFT JOIN LATERAL (
        SELECT "id" FROM candidates
        WHERE "matchRescoreRequestedAt" IS NOT NULL ${excluded}
        ORDER BY "matchRescoreRequestedAt", "id"
        LIMIT ${limit}
      ) c ON true
    `);
    return {
      ids: rows.flatMap((row) => (row.id ? [row.id] : [])),
      startedAt: rows[0]?.now ?? new Date(),
    };
  }

  /** Số ứng viên đang có dấu (tóm tắt lượt, Q6). */
  async countMarked(): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS count FROM candidates WHERE "matchRescoreRequestedAt" IS NOT NULL
    `);
    return rows[0]?.count ?? 0;
  }

  /**
   * Pool ngược của cả lô (D4, Q8), một câu: với mỗi ứng viên, các tin đang hiển thị có chung
   * ≥ 1 kỹ năng APPROVED. Đối xứng với `MatchScoreRepository.findScoringPool` (pool theo
   * tin), nên một cặp có trong pool theo tin thì cũng có ở đây. Ứng viên không có tin nào
   * không có trong Map.
   */
  async findJobPools(candidateIds: string[]): Promise<Map<string, string[]>> {
    const pools = new Map<string, string[]>();
    if (candidateIds.length === 0) return pools;
    const rows = await this.prisma.$queryRaw<Array<{ candidateId: string; jobPostId: string }>>(Prisma.sql`
      SELECT DISTINCT cs."candidateId", jps."jobPostId"
      FROM candidate_skills cs
      JOIN skills s ON s."id" = cs."skillId" AND s."status" = 'APPROVED'
      JOIN job_post_skills jps ON jps."skillId" = cs."skillId"
      JOIN job_posts j ON j."id" = jps."jobPostId"
      WHERE cs."candidateId" IN (${Prisma.join(candidateIds)}) AND ${VISIBLE_JOB}
      ORDER BY cs."candidateId", jps."jobPostId"
    `);
    for (const row of rows) {
      const pool = pools.get(row.candidateId);
      if (pool) pool.push(row.jobPostId);
      else pools.set(row.candidateId, [row.jobPostId]);
    }
    return pools;
  }

  /** Ứng viên có ít nhất một kỹ năng trong danh sách (mọi trạng thái của kỹ năng). */
  async findCandidateIdsBySkills(skillIds: string[]): Promise<string[]> {
    if (skillIds.length === 0) return [];
    const rows = await this.prisma.$queryRaw<Array<{ candidateId: string }>>(Prisma.sql`
      SELECT DISTINCT "candidateId" FROM candidate_skills
      WHERE "skillId" IN (${Prisma.join(skillIds)})
    `);
    return rows.map((row) => row.candidateId);
  }

  /**
   * Tin đang hiển thị gắn ít nhất một kỹ năng trong danh sách (mọi trạng thái của kỹ năng),
   * cho hàng chờ chấm lại theo tin khi danh mục đổi (Q1). Gọi **trước** khi đổi, như
   * `findCandidateIdsBySkills`.
   */
  async findVisibleJobIdsBySkills(skillIds: string[]): Promise<string[]> {
    if (skillIds.length === 0) return [];
    const rows = await this.prisma.$queryRaw<Array<{ jobPostId: string }>>(Prisma.sql`
      SELECT DISTINCT jps."jobPostId"
      FROM job_post_skills jps
      JOIN job_posts j ON j."id" = jps."jobPostId"
      WHERE jps."skillId" IN (${Prisma.join(skillIds)}) AND ${VISIBLE_JOB}
    `);
    return rows.map((row) => row.jobPostId);
  }

  /** Như `findVisibleJobIdsBySkills`, cho ngành (`job_post_majors`). */
  async findVisibleJobIdsByMajors(majorIds: string[]): Promise<string[]> {
    if (majorIds.length === 0) return [];
    const rows = await this.prisma.$queryRaw<Array<{ jobPostId: string }>>(Prisma.sql`
      SELECT DISTINCT jpm."jobPostId"
      FROM job_post_majors jpm
      JOIN job_posts j ON j."id" = jpm."jobPostId"
      WHERE jpm."majorId" IN (${Prisma.join(majorIds)}) AND ${VISIBLE_JOB}
    `);
    return rows.map((row) => row.jobPostId);
  }

  /** Ứng viên có ít nhất một dòng học vấn gắn ngành trong danh sách. */
  async findCandidateIdsByMajors(majorIds: string[]): Promise<string[]> {
    if (majorIds.length === 0) return [];
    const rows = await this.prisma.$queryRaw<Array<{ candidateId: string }>>(Prisma.sql`
      SELECT DISTINCT "candidateId" FROM educations
      WHERE "majorId" IN (${Prisma.join(majorIds)})
    `);
    return rows.map((row) => row.candidateId);
  }
}
