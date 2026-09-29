import type {
  JobPost,
  JobPostModerationAction,
  JobPostStatus,
  JobPostType,
  MajorRelevance,
  ModerationActionType,
  Prisma,
  PrismaClient,
  SkillImportance,
} from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

const PAGE_SIZE = 20;

// Quan hệ luôn kèm theo khi trả 1 tin ra ngoài — company/city/industry để
// render card "Thông tin công ty" + nhãn địa điểm/ngành mà frontend không phải
// gọi thêm catalog API, moderationActions (1 dòng mới nhất) cho banner từ
// chối/thu hồi (xem job-post.mapper.ts).
// Export để saved-jobs/applications dùng lại thay vì chép tay: các module đó
// cũng render JobPostDto qua toJobPostDto(), nên thiếu một quan hệ ở đây là
// mapper hỏng lúc chạy (đã xảy ra khi thêm `skills`).
export const jobPostInclude = {
  company: true,
  city: true,
  industry: true,
  moderationActions: { orderBy: { createdAt: "desc" }, take: 1, include: { actor: true } },
  // Kèm cả skill PENDING (do chính employer vừa đề xuất) — form sửa tin cần
  // thấy chúng; mapper mới là chỗ lọc bớt khi trả ra API công khai.
  skills: { include: { skill: { select: { id: true, name: true, status: true } } } },
  majors: { include: { major: { select: { id: true, name: true } } } },
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
  minExperienceYears?: number | null;
  requirementsExtra?: Prisma.InputJsonValue;
  requirementsConfirmedAt?: Date | null;
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

  async delete(id: string, db: Db = this.prisma): Promise<void> {
    await db.jobPost.delete({ where: { id } });
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

  /**
   * Ghi đè danh sách kỹ năng của tin (diff-write: xoá cái bỏ, cập nhật
   * importance của cái còn giữ, thêm cái mới). `minYears` undefined = giữ giá
   * trị đang lưu (form cũ không gửi số năm không được xoá mất số đã xác nhận).
   */
  async setSkills(
    jobPostId: string,
    skills: { skillId: string; importance: SkillImportance; minYears?: number | null }[],
    db: Db = this.prisma,
  ): Promise<void> {
    const skillIds = skills.map((skill) => skill.skillId);
    await db.jobPostSkill.deleteMany({ where: { jobPostId, skillId: { notIn: skillIds } } });
    if (skills.length === 0) return;

    // Dòng không kèm số năm: hai nhóm importance ⇒ tối đa 2 lệnh updateMany.
    for (const importance of ["REQUIRED", "PREFERRED"] as const) {
      const ids = skills
        .filter((skill) => skill.minYears === undefined && skill.importance === importance)
        .map((skill) => skill.skillId);
      if (ids.length === 0) continue;
      await db.jobPostSkill.updateMany({ where: { jobPostId, skillId: { in: ids } }, data: { importance } });
    }
    // Dòng có số năm: mỗi dòng một giá trị riêng, không gộp được (trần 30 kỹ năng).
    for (const skill of skills) {
      if (skill.minYears === undefined) continue;
      await db.jobPostSkill.updateMany({
        where: { jobPostId, skillId: skill.skillId },
        data: { importance: skill.importance, minYears: skill.minYears },
      });
    }
    await db.jobPostSkill.createMany({
      data: skills.map((skill) => ({
        jobPostId,
        skillId: skill.skillId,
        importance: skill.importance,
        minYears: skill.minYears ?? null,
      })),
      skipDuplicates: true,
    });
  }

  /** Đồng bộ toàn bộ tập ngành của tin — bảng chỉ có một cột dữ liệu nên xoá-rồi-tạo là đủ. */
  async setMajors(
    jobPostId: string,
    majors: { majorId: string; relevance: MajorRelevance }[],
    db: Db = this.prisma,
  ): Promise<void> {
    await db.jobPostMajor.deleteMany({ where: { jobPostId } });
    if (majors.length === 0) return;
    await db.jobPostMajor.createMany({ data: majors.map((major) => ({ jobPostId, ...major })) });
  }

  /** Id trong danh sách thực sự tồn tại trong catalog (mọi trạng thái). */
  async findExistingSkillIds(ids: string[], db: Db = this.prisma): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await db.skill.findMany({ where: { id: { in: ids } }, select: { id: true } });
    return new Set(rows.map((row) => row.id));
  }

  async findExistingMajorIds(ids: string[], db: Db = this.prisma): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await db.major.findMany({ where: { id: { in: ids } }, select: { id: true } });
    return new Set(rows.map((row) => row.id));
  }

  /** Tìm kiếm công khai — chỉ tin PUBLISHED và chưa quá hạn. */
  async findPublishedForSearch(
    filter: {
      q?: string;
      companyId?: string;
      cityId?: string;
      industryId?: string;
      jobType?: JobPostType;
      salaryMin?: number;
      skillIds?: string[];
    },
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
    if (filter.skillIds?.length) {
      // Mỗi skill là một điều kiện `some` riêng — gộp chung một `some` với
      // `skillId: { in: [...] }` sẽ thành "có BẤT KỲ skill nào", tức là OR.
      for (const skillId of filter.skillIds) {
        and.push({ skills: { some: { skillId } } });
      }
    }

    const rows = await this.prisma.jobPost.findMany({
      where: {
        status: "PUBLISHED",
        AND: and,
        ...(filter.companyId ? { companyId: filter.companyId } : {}),
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

  /**
   * Tăng tổng `viewCount` và lượt xem của ngày hôm nay (giờ Việt Nam) trong
   * `job_post_daily_stats` (AD-16) cùng một transaction. Upsert viết bằng SQL
   * thuần để tăng nguyên tử qua ON CONFLICT; id sinh ở DB vì cột không có default.
   */
  async incrementViewCount(id: string): Promise<JobPost> {
    const [updated] = await this.prisma.$transaction([
      this.prisma.jobPost.update({ where: { id }, data: { viewCount: { increment: 1 } } }),
      this.prisma.$executeRaw`
        INSERT INTO "job_post_daily_stats" ("id", "jobPostId", "date", "views")
        VALUES (gen_random_uuid()::text, ${id}, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 1)
        ON CONFLICT ("jobPostId", "date") DO UPDATE SET "views" = "job_post_daily_stats"."views" + 1
      `,
    ]);
    return updated;
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

  /** Cho cron job-post-expiring-notice.job.ts: tin PUBLISHED còn hạn nhưng hết trước `until`. */
  findPublishedExpiringBefore(
    until: Date,
  ): Promise<{ id: string; title: string; companyId: string; expiresAt: Date | null }[]> {
    return this.prisma.jobPost.findMany({
      where: { status: "PUBLISHED", expiresAt: { gt: new Date(), lte: until } },
      select: { id: true, title: true, companyId: true, expiresAt: true },
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
