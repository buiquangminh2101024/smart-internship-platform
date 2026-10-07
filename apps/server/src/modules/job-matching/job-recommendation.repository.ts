import { Prisma, type PrismaClient } from "@prisma/client";
import type { JobPost as JobPostDto } from "@sip/shared-types";
import { toJobPostDto } from "../job-posts/job-post.mapper";
import { jobPostInclude } from "../job-posts/job-post.repository";

// Giai đoạn A của "Việc làm phù hợp" (docs/06-backend/candidate-insights/PLAN.md):
// SQL lọc thô tin còn nhận hồ sơ. Chỉ đọc bảng job_posts — không sửa module job-posts,
// chỉ dùng lại jobPostInclude/toJobPostDto để trả đúng hình dạng JobPost công khai.

export class JobRecommendationRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  /**
   * Id tin PUBLISHED, chưa hết hạn, đăng trong `publishedSince` trở lại, mới nhất trước.
   * Candidate không khai ngành/loại việc mong muốn, nên điều kiện thu hẹp là "tin
   * yêu cầu ít nhất một kỹ năng (đã duyệt) mà hồ sơ có". Nếu được ít hơn `minPool`
   * tin thì nới lỏng đúng 1 lần — bỏ điều kiện kỹ năng, gộp thêm tin gần đây. Vẫn
   * thiếu thì trả ít hơn, không độn tin ngẫu nhiên.
   */
  async findCandidatePool(options: {
    skillIds: string[];
    publishedSince: Date;
    poolSize: number;
    minPool: number;
  }): Promise<string[]> {
    const base: Prisma.JobPostWhereInput = {
      status: "PUBLISHED",
      publishedAt: { gte: options.publishedSince },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
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
