import { Prisma, type OutreachInvitationStatus, type PrismaClient } from "@prisma/client";
import type { JobPost as JobPostDto } from "@sip/shared-types";
import { toJobPostDto } from "../job-posts/job-post.mapper";
import { jobPostInclude } from "../job-posts/job-post.repository";
import { VISIBLE_JOB } from "../match-scores/match-score.repository";

// "Việc làm phù hợp" (docs/06-backend/candidate-insights/PLAN.md, AD-26): đọc bảng
// điểm lưu sẵn theo ứng viên, hoặc SQL lọc thô tin còn nhận hồ sơ cho đường chấm trực
// tiếp. Chỉ đọc — không sửa module job-posts, chỉ dùng lại jobPostInclude/toJobPostDto
// để trả đúng hình dạng JobPost công khai.

/** D3 — lời mời còn hiệu lực hoặc đã được trả lời thì tin không hiện ở "Việc làm phù hợp". */
const EXCLUDED_INVITATION_STATUSES: OutreachInvitationStatus[] = ["PENDING", "ACCEPTED", "DECLINED"];

export interface ScoredJobRow {
  jobPostId: string;
  score: number;
}

export class JobRecommendationRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  /**
   * Id tin PUBLISHED, chưa hết hạn, chưa ứng tuyển / được mời (D3), mới nhất trước.
   * Candidate không khai ngành/loại việc mong muốn, nên điều kiện thu hẹp là "tin
   * yêu cầu ít nhất một kỹ năng (đã duyệt) mà hồ sơ có". Nếu được ít hơn `minPool`
   * tin thì nới lỏng đúng 1 lần — bỏ điều kiện kỹ năng, gộp thêm tin gần đây. Vẫn
   * thiếu thì trả ít hơn, không độn tin ngẫu nhiên.
   */
  async findCandidatePool(options: {
    candidateId: string;
    skillIds: string[];
    poolSize: number;
    minPool: number;
  }): Promise<string[]> {
    // AD-26: bỏ giới hạn 30 ngày; trừ tin đã ứng tuyển / đã được mời (D3).
    const base: Prisma.JobPostWhereInput = {
      status: "PUBLISHED",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      applications: { none: { candidateId: options.candidateId, status: { not: "CANCELLED" } } },
      outreachInvitations: { none: { candidateId: options.candidateId, status: { in: EXCLUDED_INVITATION_STATUSES } } },
    };

    const narrowed = await this.findIds(
      { ...base, skills: { some: { skillId: { in: options.skillIds }, skill: { status: "APPROVED" } } } },
      options.poolSize,
    );
    if (narrowed.length >= options.minPool) return narrowed;

    const relaxed = await this.findIds(
      { ...base, id: { notIn: narrowed } },
      options.poolSize - narrowed.length,
    );
    return [...narrowed, ...relaxed];
  }

  /**
   * AD-26 D1 — một trang "Việc làm phù hợp" từ bảng điểm lưu sẵn: tin đang hiển thị,
   * điểm ≥ `minScore`, trừ tin đã ứng tuyển / đã được mời (D3); điểm cao trước, hoà thì
   * mới đăng trước. Phân trang offset vì thứ tự theo điểm không hợp với cursor theo id.
   * Dùng index (candidateId, score DESC).
   */
  async findScoredPage(
    candidateId: string,
    options: { minScore: number; offset: number; take: number },
  ): Promise<{ rows: ScoredJobRow[]; total: number }> {
    const where = Prisma.sql`
      s."candidateId" = ${candidateId}
      AND s."score" >= ${options.minScore}
      AND ${VISIBLE_JOB}
      AND NOT EXISTS (
        SELECT 1 FROM applications a
        WHERE a."jobPostId" = s."jobPostId" AND a."candidateId" = s."candidateId" AND a."status" <> 'CANCELLED')
      AND NOT EXISTS (
        SELECT 1 FROM candidate_outreach_invitations i
        WHERE i."jobPostId" = s."jobPostId" AND i."candidateId" = s."candidateId"
          AND i."status" IN ('PENDING', 'ACCEPTED', 'DECLINED'))
    `;
    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<ScoredJobRow[]>(Prisma.sql`
        SELECT s."jobPostId", s."score"
        FROM job_candidate_match_scores s
        JOIN job_posts j ON j."id" = s."jobPostId"
        WHERE ${where}
        ORDER BY s."score" DESC, j."publishedAt" DESC NULLS LAST, s."jobPostId"
        OFFSET ${options.offset}
        LIMIT ${options.take}
      `),
      this.prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
        SELECT count(*)::int AS total
        FROM job_candidate_match_scores s
        JOIN job_posts j ON j."id" = s."jobPostId"
        WHERE ${where}
      `),
    ]);
    return { rows, total: counts[0]?.total ?? 0 };
  }

  /**
   * Ứng viên đã có dòng điểm cho ít nhất một tin đang hiển thị (bất kể điểm, đơn, lời
   * mời) — tức là đã qua lượt chấm. Không có ⇒ dùng đường chấm trực tiếp (D2).
   */
  async hasScoredVisibleJob(candidateId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ ok: number }>>(Prisma.sql`
      SELECT 1 AS ok
      FROM job_candidate_match_scores s
      JOIN job_posts j ON j."id" = s."jobPostId"
      WHERE s."candidateId" = ${candidateId} AND ${VISIBLE_JOB}
      LIMIT 1
    `);
    return rows.length > 0;
  }

  /** JobPost công khai (chỉ skill APPROVED) theo đúng thứ tự `ids`; id không còn tồn tại bị bỏ qua. */
  async findPublicByIds(ids: string[]): Promise<JobPostDto[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.jobPost.findMany({ where: { id: { in: ids } }, include: jobPostInclude });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [toJobPostDto(row, { publicOnly: true })] : [];
    });
  }

  /** Tin còn hiển thị công khai: PUBLISHED và chưa hết hạn (S5 của "Việc làm tương tự"). */
  async isPubliclyListed(jobPostId: string): Promise<boolean> {
    const count = await this.prisma.jobPost.count({
      where: { id: jobPostId, status: "PUBLISHED", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    });
    return count > 0;
  }

  /**
   * Nhánh dự phòng của "Việc làm tương tự" (S6, docs/06-backend/similar-jobs/PLAN.md):
   * tin công khai khác có ít nhất một kỹ năng APPROVED trùng với `jobPostId`, nhiều kỹ
   * năng trùng trước, hoà thì mới đăng trước. Không đụng bảng embedding.
   */
  async findBySharedSkills(jobPostId: string, take: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT o."jobPostId" AS id
      FROM job_post_skills s
      JOIN skills k ON k."id" = s."skillId" AND k."status" = 'APPROVED'
      JOIN job_post_skills o ON o."skillId" = s."skillId" AND o."jobPostId" <> s."jobPostId"
      JOIN job_posts p ON p."id" = o."jobPostId"
      WHERE s."jobPostId" = ${jobPostId}
        AND p."status" = 'PUBLISHED'
        AND (p."expiresAt" IS NULL OR p."expiresAt" > now())
      GROUP BY o."jobPostId", p."publishedAt"
      ORDER BY COUNT(*) DESC, p."publishedAt" DESC NULLS LAST
      LIMIT ${take}
    `);
    return rows.map((row) => row.id);
  }

  private async findIds(where: Prisma.JobPostWhereInput, take: number): Promise<string[]> {
    if (take <= 0) return [];
    const rows = await this.prisma.jobPost.findMany({
      where,
      select: { id: true },
      orderBy: { publishedAt: "desc" },
      take,
    });
    return rows.map((row) => row.id);
  }
}
