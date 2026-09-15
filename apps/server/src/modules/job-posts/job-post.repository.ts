import type {
  JobPost,
  JobPostModerationAction,
  JobPostStatus,
  JobPostType,
  ModerationActionType,
  Prisma,
  PrismaClient,
} from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

const PAGE_SIZE = 20;

// Quan hệ luôn kèm theo khi trả 1 tin ra ngoài — company/city/industry để
// render card "Thông tin công ty" + nhãn địa điểm/ngành mà frontend không phải
// gọi thêm catalog API, moderationActions (1 dòng mới nhất) cho banner từ
// chối/thu hồi (xem job-post.mapper.ts).
const jobPostInclude = {
  company: true,
  city: true,
  industry: true,
  moderationActions: { orderBy: { createdAt: "desc" }, take: 1, include: { actor: true } },
  _count: { select: { applications: true } },
} satisfies Prisma.JobPostInclude;

export type JobPostWithRelations = Prisma.JobPostGetPayload<{ include: typeof jobPostInclude }>;

export interface JobPostWriteData {
  title?: string;
  description?: string;
  jobType?: JobPostType;
  industryId?: string | null;
  cityId?: string | null;
  address?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  isNegotiable?: boolean;
  requirements?: string | null;
  benefits?: string | null;
  expiresAt?: Date | null;
  status?: JobPostStatus;
  publishedAt?: Date | null;
  closedAt?: Date | null;
}

interface Page<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
}

function paginate<T extends { id: string }>(rows: T[]): Page<T> {
  const hasMore = rows.length > PAGE_SIZE;
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
  return { items, hasMore, ...(nextCursor ? { nextCursor } : {}) };
}

export class JobPostRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  findById(id: string, db: Db = this.prisma): Promise<JobPostWithRelations | null> {
    return db.jobPost.findUnique({ where: { id }, include: jobPostInclude });
  }

  create(
    data: JobPostWriteData & { companyId: string; employerId: string; title: string; description: string; jobType: JobPostType },
    db: Db = this.prisma,
  ): Promise<JobPostWithRelations> {
    return db.jobPost.create({ data, include: jobPostInclude });
  }

  update(id: string, data: JobPostWriteData, db: Db = this.prisma): Promise<JobPostWithRelations> {
    return db.jobPost.update({ where: { id }, data, include: jobPostInclude });
  }

  /** Danh sách tin của chính company (mọi trạng thái) — trang quản lý của Employer. */
  async findOwnedByCompany(
    companyId: string,
    filter: { status?: JobPostStatus; q?: string },
    cursor: string | undefined,
  ): Promise<Page<JobPostWithRelations>> {
    const rows = await this.prisma.jobPost.findMany({
      where: {
        companyId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.q ? { title: { contains: filter.q, mode: "insensitive" as const } } : {}),
      },
      include: jobPostInclude,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return paginate(rows);
  }

  /** Hàng đợi kiểm duyệt của Admin — mặc định PENDING, cho phép lọc trạng thái khác. */
  async findModerationQueue(
    status: JobPostStatus | undefined,
    cursor: string | undefined,
  ): Promise<Page<JobPostWithRelations>> {
    const rows = await this.prisma.jobPost.findMany({
      where: status ? { status } : {},
      include: jobPostInclude,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return paginate(rows);
  }

  /** Tìm kiếm công khai — chỉ tin PUBLISHED và chưa quá hạn. */
  async findPublishedForSearch(
    filter: { q?: string; cityId?: string; industryId?: string; jobType?: JobPostType; salaryMin?: number },
    cursor: string | undefined,
  ): Promise<Page<JobPostWithRelations>> {
    // Mỗi điều kiện "hoặc" là 1 phần tử của AND — không gộp chung key `OR` ở
    // cùng một object vì các nhánh sẽ ghi đè lẫn nhau.
    const and: Prisma.JobPostWhereInput[] = [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }];
    if (filter.salaryMin) {
      // Tin "Thỏa thuận" luôn hiện kể cả khi lọc theo lương tối thiểu — không
      // có salaryMax để so sánh, loại bỏ sẽ giấu mất phần lớn tin thực tập.
      and.push({
        OR: [{ isNegotiable: true }, { salaryMax: { gte: filter.salaryMin } }, { salaryMin: { gte: filter.salaryMin } }],
      });
    }
    if (filter.q) {
      and.push({
        OR: [
          { title: { contains: filter.q, mode: "insensitive" } },
          { description: { contains: filter.q, mode: "insensitive" } },
          { company: { name: { contains: filter.q, mode: "insensitive" } } },
        ],
      });
    }

    const rows = await this.prisma.jobPost.findMany({
      where: {
        status: "PUBLISHED",
        AND: and,
        ...(filter.cityId ? { cityId: filter.cityId } : {}),
        ...(filter.industryId ? { industryId: filter.industryId } : {}),
        ...(filter.jobType ? { jobType: filter.jobType } : {}),
      },
      include: jobPostInclude,
      orderBy: { publishedAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return paginate(rows);
  }

  countByStatus(where: Prisma.JobPostWhereInput): Promise<number> {
    return this.prisma.jobPost.count({ where });
  }

  createModerationAction(
    data: { jobPostId: string; action: ModerationActionType; actorId?: string | null; reason?: string | null },
    db: Db = this.prisma,
  ): Promise<JobPostModerationAction> {
    return db.jobPostModerationAction.create({ data });
  }

  incrementViewCount(id: string): Promise<JobPost> {
    return this.prisma.jobPost.update({ where: { id }, data: { viewCount: { increment: 1 } } });
  }

  // ─── dùng cho cron job-post-expiry.job.ts ────────────────────────────────

  /** Tin PUBLISHED đã quá hạn expiresAt → chuyển EXPIRED hàng loạt. */
  async expireOverdue(): Promise<number> {
    const result = await this.prisma.jobPost.updateMany({
      where: { status: "PUBLISHED", expiresAt: { not: null, lte: new Date() } },
      data: { status: "EXPIRED" },
    });
    return result.count;
  }

  /** Company (kèm verifiedAt) đang có ít nhất 1 tin PUBLISHED — đầu vào của sweep hết gói. */
  async findCompaniesWithPublishedPosts(): Promise<{ id: string; verifiedAt: Date | null }[]> {
    return this.prisma.company.findMany({
      where: { jobPosts: { some: { status: "PUBLISHED" } } },
      select: { id: true, verifiedAt: true },
    });
  }

  async expirePublishedByCompany(companyId: string): Promise<number> {
    const result = await this.prisma.jobPost.updateMany({
      where: { companyId, status: "PUBLISHED" },
      data: { status: "EXPIRED" },
    });
    return result.count;
  }
}
