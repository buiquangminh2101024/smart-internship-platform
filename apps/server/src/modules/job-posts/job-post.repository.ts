import {
  Prisma,
  type JobPost,
  type JobPostModerationAction,
  type JobPostStatus,
  type JobQualityBand,
  type JobPostType,
  type MajorRelevance,
  type ModerationActionType,
  type PrismaClient,
  type SkillImportance,
} from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

const PAGE_SIZE = 20;
/** Cỡ trang các danh sách tin — đường `sort=match` của tìm kiếm công khai dùng cùng cỡ. */
export const JOB_POST_PAGE_SIZE = PAGE_SIZE;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Cửa sổ "sắp hết hạn" của tin cần chú ý (khác cửa sổ 3 ngày của thông báo JOB_POST_EXPIRING). */
export const ATTENTION_EXPIRING_DAYS = 7;

/** Tin PUBLISHED hết hạn trong `ATTENTION_EXPIRING_DAYS` ngày tới, tính từ `now`. */
function expiringSoonWhere(now: Date): Prisma.JobPostWhereInput {
  return {
    status: "PUBLISHED",
    expiresAt: { gt: now, lte: new Date(now.getTime() + ATTENTION_EXPIRING_DAYS * DAY_MS) },
  };
}

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
  // AD-29 — lúc gửi duyệt + điểm chất lượng, do JobQualityService.submissionColumns tính.
  submittedAt?: Date | null;
  qualityScore?: number | null;
  qualityBand?: JobQualityBand | null;
  qualityBreakdown?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  qualityVersion?: number | null;
  qualityScoredAt?: Date | null;
  submittedContentHash?: string | null;
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

// ─── Hàng đợi kiểm duyệt (AD-29 bước 6) ─────────────────────────────────────

export type ModerationQueueSort = "submitted_asc" | "score_desc" | "score_asc" | "created_desc";

export interface ModerationQueueFilter {
  status?: JobPostStatus;
  /** `UNSCORED` = tin chưa có điểm (`qualityBand` null). */
  band?: JobQualityBand | "UNSCORED";
  sort?: ModerationQueueSort;
}

/** Mặc định: tin chờ duyệt gửi trước xử lý trước; trạng thái khác mới tạo trước (như cũ). */
export function resolveModerationSort(filter: ModerationQueueFilter): ModerationQueueSort {
  return filter.sort ?? (filter.status === "PENDING" ? "submitted_asc" : "created_desc");
}

export function moderationWhere(filter: ModerationQueueFilter): Prisma.JobPostWhereInput {
  return {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.band === "UNSCORED" ? { qualityBand: null } : filter.band ? { qualityBand: filter.band } : {}),
  };
}

export function moderationOrderBy(sort: ModerationQueueSort): Prisma.JobPostOrderByWithRelationInput[] {
  switch (sort) {
    case "submitted_asc":
      return [{ submittedAt: { sort: "asc", nulls: "last" } }, { id: "asc" }];
    case "score_desc":
      return [{ qualityScore: { sort: "desc", nulls: "last" } }, { id: "asc" }];
    case "score_asc":
      return [{ qualityScore: { sort: "asc", nulls: "last" } }, { id: "asc" }];
    case "created_desc":
      return [{ createdAt: "desc" }, { id: "asc" }];
  }
}

type ModerationAnchor = { id: string; submittedAt: Date | null; qualityScore: number | null; createdAt: Date };

/**
 * Điều kiện "đứng sau tin mốc" theo đúng `moderationOrderBy(sort)` (giá trị null xếp cuối,
 * hoà thì `id` tăng dần):
 * - mốc có giá trị v ⇒ (giá trị đứng sau v) HOẶC (= v VÀ id > mốc) HOẶC (giá trị null);
 * - mốc null ⇒ (null VÀ id > mốc).
 */
export function moderationKeysetWhere(sort: ModerationQueueSort, anchor: ModerationAnchor): Prisma.JobPostWhereInput {
  const afterId = { id: { gt: anchor.id } };
  switch (sort) {
    case "submitted_asc": {
      const value = anchor.submittedAt;
      if (value === null) return { submittedAt: null, ...afterId };
      return { OR: [{ submittedAt: { gt: value } }, { submittedAt: value, ...afterId }, { submittedAt: null }] };
    }
    case "score_desc":
    case "score_asc": {
      const value = anchor.qualityScore;
      if (value === null) return { qualityScore: null, ...afterId };
      const beyond = sort === "score_desc" ? { lt: value } : { gt: value };
      return { OR: [{ qualityScore: beyond }, { qualityScore: value, ...afterId }, { qualityScore: null }] };
    }
    case "created_desc":
      return { OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, ...afterId }] };
  }
}

/** Điểm / vùng / breakdown của tin, đọc ngay sau khi đổi trạng thái (bước 5, 7). */
export interface JobPostQualitySnapshot {
  qualityScore: number | null;
  qualityBand: JobQualityBand | null;
  qualityBreakdown: Prisma.JsonValue | null;
}

/** Một tin của lô duyệt / từ chối hàng loạt (AD-29 bước 7). */
export interface BulkModerationPost {
  id: string;
  status: JobPostStatus;
  title: string;
  companyId: string;
  company: { name: string };
  qualityBreakdown: Prisma.JsonValue | null;
  /** Bước 8 — duyệt xong thì gọi tự mời cho công ty (như duyệt một tin). */
  autoOutreachEnabled: boolean;
}

export interface PublicJobSearchFilter {
  q?: string;
  companyId?: string;
  cityId?: string;
  industryId?: string;
  jobType?: JobPostType;
  salaryMin?: number;
  skillIds?: string[];
  skillMode?: "any" | "all";
  experience?: "none" | "lt1" | "1to2" | "gt2";
  salaryKind?: "disclosed" | "negotiable";
}

/** Q3 — nhóm kinh nghiệm theo `minExperienceYears` (Float); null và 0 đều là "không yêu cầu". */
const EXPERIENCE_WHERE: Record<NonNullable<PublicJobSearchFilter["experience"]>, Prisma.JobPostWhereInput> = {
  none: { OR: [{ minExperienceYears: null }, { minExperienceYears: { lte: 0 } }] },
  lt1: { minExperienceYears: { gt: 0, lt: 1 } },
  "1to2": { minExperienceYears: { gte: 1, lte: 2 } },
  gt2: { minExperienceYears: { gt: 2 } },
};

const SALARY_KIND_WHERE: Record<NonNullable<PublicJobSearchFilter["salaryKind"]>, Prisma.JobPostWhereInput> = {
  negotiable: { isNegotiable: true },
  disclosed: { isNegotiable: false, OR: [{ salaryMin: { not: null } }, { salaryMax: { not: null } }] },
};

/** Mới đăng trước, hoà theo id — thứ tự toàn phần để cursor theo id không lặp / sót tin. */
const SEARCH_ORDER: Prisma.JobPostOrderByWithRelationInput[] = [{ publishedAt: "desc" }, { id: "desc" }];

/** Điều kiện tìm kiếm công khai — một nguồn cho cả đường mới đăng và đường theo điểm (AD-26). */
function publicSearchWhere(filter: PublicJobSearchFilter): Prisma.JobPostWhereInput {
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
  if (filter.salaryKind) and.push(SALARY_KIND_WHERE[filter.salaryKind]);
  if (filter.experience) and.push(EXPERIENCE_WHERE[filter.experience]);
  if (filter.q) {
    and.push({
      OR: [
        { title: { contains: filter.q, mode: "insensitive" } },
        { description: { contains: filter.q, mode: "insensitive" } },
        { company: { name: { contains: filter.q, mode: "insensitive" } } },
        // AD-26 (D6) — tìm cả tên kỹ năng đã duyệt của tin (skill PENDING không lộ ra công khai).
        { skills: { some: { skill: { status: "APPROVED", name: { contains: filter.q, mode: "insensitive" } } } } },
      ],
    });
  }
  if (filter.skillIds?.length) {
    if (filter.skillMode === "all") {
      // Mỗi skill là một điều kiện `some` riêng — gộp chung một `some` với
      // `skillId: { in: [...] }` sẽ thành "có BẤT KỲ skill nào", tức là OR.
      for (const skillId of filter.skillIds) {
        and.push({ skills: { some: { skillId } } });
      }
    } else {
      // Q4 — mặc định "có ít nhất một".
      and.push({ skills: { some: { skillId: { in: filter.skillIds } } } });
    }
  }
  return {
    status: "PUBLISHED",
    AND: and,
    ...(filter.companyId ? { companyId: filter.companyId } : {}),
    ...(filter.cityId ? { cityId: filter.cityId } : {}),
    ...(filter.industryId ? { industryId: filter.industryId } : {}),
    ...(filter.jobType ? { jobType: filter.jobType } : {}),
  };
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

  /**
   * AD-29 (điểm 8) — đổi trạng thái chỉ khi tin còn đúng `from`, trong một câu
   * `UPDATE … WHERE id AND status`. `false` ⇒ tin đã bị người khác chuyển trạng thái
   * (hoặc đã bị xoá): hai Admin bấm cùng lúc chỉ một người thắng.
   */
  async transitionIfStatus(id: string, from: JobPostStatus, data: JobPostWriteData, db: Db = this.prisma): Promise<boolean> {
    const { count } = await db.jobPost.updateMany({ where: { id, status: from }, data });
    return count === 1;
  }

  /**
   * AD-29 — điểm / vùng hiện tại của tin. Gọi trong transaction ngay sau
   * `transitionIfStatus` thắng: dòng tin đang bị khoá nên lối chấm nền không ghi
   * xen vào được, giá trị đọc ra là điểm của tin đúng lúc được quyết định.
   */
  findQuality(id: string, db: Db = this.prisma): Promise<JobPostQualitySnapshot | null> {
    return db.jobPost.findUnique({ where: { id }, select: { qualityScore: true, qualityBand: true, qualityBreakdown: true } });
  }

  /**
   * AD-29 bước 7 — đọc trước cả lô duyệt / từ chối bằng một câu: chỉ các cột lô cần
   * (trạng thái để bỏ qua sớm, tiêu đề / tên công ty cho thông báo và audit, breakdown
   * cho lý do tự sinh). Không kèm `jobPostInclude`: lô không trả DTO.
   */
  findForBulkModeration(ids: string[], db: Db = this.prisma): Promise<BulkModerationPost[]> {
    return db.jobPost.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        status: true,
        title: true,
        companyId: true,
        company: { select: { name: true } },
        qualityBreakdown: true,
        autoOutreachEnabled: true,
      },
    });
  }

  async delete(id: string, db: Db = this.prisma): Promise<void> {
    await db.jobPost.delete({ where: { id } });
  }

  /**
   * Danh sách tin của chính company (mọi trạng thái) — trang quản lý của Employer.
   * `attention`: chỉ tin cần chú ý (xem `attentionWhere`); không đi cùng `status`.
   */
  async findOwnedByCompany(
    companyId: string,
    filter: { status?: JobPostStatus; attention?: boolean; q?: string },
    cursor: string | undefined,
  ): Promise<Page<JobPostWithRelations>> {
    const attention = filter.attention ? await this.attentionWhere(companyId, new Date()) : null;
    const rows = await this.prisma.jobPost.findMany({
      where: {
        companyId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(attention ?? {}),
        ...(filter.q ? { title: { contains: filter.q, mode: "insensitive" as const } } : {}),
      },
      include: jobPostInclude,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return paginate(rows);
  }

  // ─── Tin cần chú ý — định nghĩa DUY NHẤT, dùng cho cả danh sách và số đếm ───
  // của dashboard, để số trên thẻ luôn bằng số dòng của trang danh sách.

  /** Số tin cần chú ý của company, tách theo hai loại. */
  async countAttention(companyId: string): Promise<{ rejected: number; expiringIn7Days: number }> {
    const [rejectedIds, expiringIn7Days] = await Promise.all([
      this.findRejectedDraftIds(companyId),
      this.prisma.jobPost.count({ where: { companyId, ...expiringSoonWhere(new Date()) } }),
    ]);
    return { rejected: rejectedIds.length, expiringIn7Days };
  }

  /**
   * Tin cần chú ý: bị Admin từ chối (DRAFT, thao tác kiểm duyệt gần nhất là
   * REJECTED) HOẶC PUBLISHED hết hạn trong 7 ngày tới. Hai tập khác trạng thái
   * nên không trùng nhau.
   */
  private async attentionWhere(companyId: string, now: Date): Promise<Prisma.JobPostWhereInput> {
    const rejectedIds = await this.findRejectedDraftIds(companyId);
    return { OR: [{ id: { in: rejectedIds } }, expiringSoonWhere(now)] };
  }

  /**
   * Id các tin DRAFT có thao tác kiểm duyệt gần nhất là REJECTED. "Gần nhất"
   * không viết được bằng where của Prisma nên dùng SQL; số dòng mỗi company nhỏ.
   */
  private async findRejectedDraftIds(companyId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT j."id"
      FROM job_posts j
      JOIN LATERAL (
        SELECT ma."action" FROM job_post_moderation_actions ma
        WHERE ma."jobPostId" = j."id" ORDER BY ma."createdAt" DESC LIMIT 1
      ) last ON last."action" = 'REJECTED'
      WHERE j."companyId" = ${companyId} AND j."status" = 'DRAFT'
    `);
    return rows.map((row) => row.id);
  }

  /**
   * Hàng đợi kiểm duyệt của Admin (AD-29 bước 6): lọc trạng thái / vùng chất lượng,
   * sắp theo `filter.sort`, luôn kèm `id` tăng dần làm khoá phụ. Phân trang theo khoá
   * (xem `moderationKeysetWhere`), không dùng `cursor` của Prisma vì cột điểm và
   * `submittedAt` cho phép null. `cursor` là id tin cuối của trang trước; tin đó đã được
   * duyệt / từ chối (rời bộ lọc) vẫn dùng làm mốc được, nên trang sau không bị nhảy.
   * Trả `null` khi cursor không trỏ tới tin nào (đã bị xoá / gõ sai).
   */
  async findModerationQueue(
    filter: ModerationQueueFilter,
    cursor: string | undefined,
  ): Promise<(Page<JobPostWithRelations> & { total: number }) | null> {
    const sort = resolveModerationSort(filter);
    const base = moderationWhere(filter);
    let after: Prisma.JobPostWhereInput | null = null;
    if (cursor) {
      const anchor = await this.prisma.jobPost.findUnique({
        where: { id: cursor },
        select: { id: true, submittedAt: true, qualityScore: true, createdAt: true },
      });
      if (!anchor) return null;
      after = moderationKeysetWhere(sort, anchor);
    }
    const [rows, total] = await Promise.all([
      this.prisma.jobPost.findMany({
        where: after ? { AND: [base, after] } : base,
        include: jobPostInclude,
        orderBy: moderationOrderBy(sort),
        take: PAGE_SIZE + 1,
      }),
      this.prisma.jobPost.count({ where: base }),
    ]);
    return { ...paginate(rows), total };
  }

  /** Id tin khớp bộ lọc hàng đợi theo đúng thứ tự, tối đa `limit`, kèm tổng số khớp. */
  async findModerationIds(filter: ModerationQueueFilter, limit: number): Promise<{ ids: string[]; total: number }> {
    const where = moderationWhere(filter);
    const [rows, total] = await Promise.all([
      this.prisma.jobPost.findMany({
        where,
        select: { id: true },
        orderBy: moderationOrderBy(resolveModerationSort(filter)),
        take: limit,
      }),
      this.prisma.jobPost.count({ where }),
    ]);
    return { ids: rows.map((row) => row.id), total };
  }

  /** Số tin PENDING theo vùng chất lượng; `null` (chưa chấm) gom vào UNSCORED. */
  async countPendingByBand(): Promise<Record<JobQualityBand | "UNSCORED", number>> {
    const groups = await this.prisma.jobPost.groupBy({
      by: ["qualityBand"],
      where: { status: "PENDING" },
      _count: { _all: true },
    });
    const counts = { SUGGEST_APPROVE: 0, NEEDS_REVIEW: 0, SUGGEST_REJECT: 0, UNSCORED: 0 };
    for (const group of groups) counts[group.qualityBand ?? "UNSCORED"] = group._count._all;
    return counts;
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

  /**
   * Id trong danh sách là ngành APPROVED. Ngành PENDING có thể bị từ chối hoặc
   * bị cron gộp, nên không cho gắn vào tin (giao diện cũng chỉ liệt kê APPROVED).
   */
  async findExistingMajorIds(ids: string[], db: Db = this.prisma): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await db.major.findMany({ where: { id: { in: ids }, status: "APPROVED" }, select: { id: true } });
    return new Set(rows.map((row) => row.id));
  }

  /**
   * Tìm kiếm công khai — chỉ tin PUBLISHED và chưa quá hạn, mới đăng trước, cursor theo id.
   * `total` đếm cùng điều kiện (AD-26), chạy song song với trang.
   */
  async findPublishedForSearch(
    filter: PublicJobSearchFilter,
    cursor: string | undefined,
  ): Promise<Page<JobPostWithRelations> & { total: number }> {
    const where = publicSearchWhere(filter);
    const [rows, total] = await Promise.all([
      this.prisma.jobPost.findMany({
        where,
        include: jobPostInclude,
        // `id` làm thứ tự hoà: chỉ sắp `publishedAt` thì cursor theo id lặp / sót tin cùng
        // `publishedAt` (bước 4 đo trên Neon: duyệt hết trang ra 311/312 tin, có tin lặp).
        orderBy: SEARCH_ORDER,
        take: PAGE_SIZE + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      this.prisma.jobPost.count({ where }),
    ]);
    return { ...paginate(rows), total };
  }

  /**
   * AD-26 (D5) — mọi id qua bộ lọc công khai, mới đăng trước, cho đường `sort=match` /
   * `minMatch` của ứng viên: service ghép điểm rồi sắp và phân trang offset. Dùng chung
   * `publicSearchWhere` để hai đường không lệch bộ lọc; số tin đang hiển thị chỉ vài trăm.
   */
  async findPublishedIdsForSearch(filter: PublicJobSearchFilter): Promise<string[]> {
    const rows = await this.prisma.jobPost.findMany({
      where: publicSearchWhere(filter),
      select: { id: true },
      orderBy: SEARCH_ORDER,
    });
    return rows.map((row) => row.id);
  }

  /** Tin theo id, giữ đúng thứ tự `ids`; tin không còn tồn tại bị bỏ. */
  async findManyWithRelationsByIds(ids: string[]): Promise<JobPostWithRelations[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.jobPost.findMany({ where: { id: { in: ids } }, include: jobPostInclude });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  /** AD-26 (D5) — tin trong `jobPostIds` mà ứng viên đã lưu / đã ứng tuyển (trừ CANCELLED, Q1). */
  async findViewerState(
    candidateId: string,
    jobPostIds: string[],
  ): Promise<{ saved: Set<string>; applied: Set<string> }> {
    if (jobPostIds.length === 0) return { saved: new Set(), applied: new Set() };
    const [saved, applied] = await Promise.all([
      this.prisma.savedJob.findMany({
        where: { candidateId, jobPostId: { in: jobPostIds } },
        select: { jobPostId: true },
      }),
      this.prisma.application.findMany({
        where: { candidateId, jobPostId: { in: jobPostIds }, status: { not: "CANCELLED" } },
        select: { jobPostId: true },
      }),
    ]);
    return {
      saved: new Set(saved.map((row) => row.jobPostId)),
      applied: new Set(applied.map((row) => row.jobPostId)),
    };
  }

  countByStatus(where: Prisma.JobPostWhereInput): Promise<number> {
    return this.prisma.jobPost.count({ where });
  }

  createModerationAction(
    data: {
      jobPostId: string;
      action: ModerationActionType;
      actorId?: string | null;
      reason?: string | null;
      // AD-29 — điểm / vùng của tin lúc Admin quyết định.
      qualityScore?: number | null;
      qualityBand?: JobQualityBand | null;
      /** AD-29 bước 7 — quyết định qua duyệt / từ chối hàng loạt. */
      bulk?: boolean;
    },
    db: Db = this.prisma,
  ): Promise<JobPostModerationAction> {
    return db.jobPostModerationAction.create({ data });
  }

  /** Số dòng `action` đã có của một tin — `SUBMITTED` ≥ 1 nghĩa là lần gửi tới là gửi lại (L28, AD-20). */
  countModerationActions(jobPostId: string, action: ModerationActionType, db: Db = this.prisma): Promise<number> {
    return db.jobPostModerationAction.count({ where: { jobPostId, action } });
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
