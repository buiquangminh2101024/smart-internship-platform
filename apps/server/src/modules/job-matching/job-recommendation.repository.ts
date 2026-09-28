import type { Prisma, PrismaClient } from "@prisma/client";
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
