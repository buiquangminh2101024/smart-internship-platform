import type { JobPostStatus, Prisma, PrismaClient, Role, User, UserStatus } from "@prisma/client";
import type { AdminUserLoginMethod, AdminUserSort, CatalogSuggester } from "@sip/shared-types";

export const ADMIN_PAGE_SIZE = 20;
// P6 — trang chi tiết trả tối đa chừng này dòng mới nhất cho mỗi danh sách.
export const ADMIN_DETAIL_LIMIT = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

// Cột cho danh sách người dùng của Admin (AD-17, U7) — kèm tên hiển thị.
const ADMIN_LIST_SELECT = {
  id: true,
  email: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  // Chỉ để tính hasPassword / hasGoogle; toAdminUserListItem không trả hash ra ngoài.
  passwordHash: true,
  googleId: true,
  candidate: { select: { fullName: true } },
  employer: { select: { companyId: true, company: { select: { name: true } } } },
} satisfies Prisma.UserSelect;

export type AdminUserRow = Prisma.UserGetPayload<{ select: typeof ADMIN_LIST_SELECT }>;

const JOB_AND_COMPANY_REF = {
  jobPost: { select: { id: true, title: true } },
  company: { select: { id: true, name: true } },
} as const;

// Trang chi tiết (E4, E5): cột của danh sách + mốc buộc đăng xuất + dữ liệu theo
// vai trò. Không chọn phone, dateOfBirth (ứng viên) và fileUrl (CV).
const ADMIN_DETAIL_SELECT = {
  ...ADMIN_LIST_SELECT,
  sessionsRevokedAt: true,
  candidate: {
    select: {
      fullName: true,
      headline: true,
      isOpenToOutreach: true,
      educations: {
        select: {
          degree: true,
          startYear: true,
          endYear: true,
          isCurrent: true,
          university: { select: { name: true } },
          major: { select: { name: true } },
        },
        orderBy: [{ isCurrent: "desc" }, { startYear: "desc" }, { createdAt: "desc" }],
      },
      skills: { select: { skill: { select: { name: true } } }, orderBy: { skill: { name: "asc" } } },
      cvs: {
        select: { id: true, fileName: true, uploadedAt: true, isDefault: true, isHidden: true },
        orderBy: { uploadedAt: "desc" },
      },
      // Application không có companyId riêng ⇒ lấy công ty qua tin.
      applications: {
        select: {
          id: true,
          status: true,
          createdAt: true,
          jobPost: { select: { id: true, title: true, company: { select: { id: true, name: true } } } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: ADMIN_DETAIL_LIMIT,
      },
      outreachInvitations: {
        select: { id: true, status: true, createdAt: true, expiresAt: true, ...JOB_AND_COMPANY_REF },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: ADMIN_DETAIL_LIMIT,
      },
      _count: { select: { applications: true, outreachInvitations: true } },
    },
  },
  employer: {
    select: {
      id: true,
      companyId: true,
      isCompanyAdmin: true,
      title: true,
      company: { select: { name: true, verificationStatus: true } },
    },
  },
} satisfies Prisma.UserSelect;

export type AdminUserDetailRow = Prisma.UserGetPayload<{ select: typeof ADMIN_DETAIL_SELECT }>;

export interface AdminUserListOptions {
  role?: Role | undefined;
  status?: UserStatus | undefined;
  q?: string | undefined;
  loginMethod?: AdminUserLoginMethod | undefined;
  emailVerified?: boolean | undefined;
  createdFrom?: string | undefined;
  createdTo?: string | undefined;
  sort: AdminUserSort;
  page: number;
}

const ADMIN_LIST_ORDER: Record<AdminUserSort, Prisma.UserOrderByWithRelationInput[]> = {
  newest: [{ createdAt: "desc" }, { id: "desc" }],
  oldest: [{ createdAt: "asc" }, { id: "asc" }],
  email: [{ email: "asc" }, { id: "asc" }],
};

const LOGIN_METHOD_WHERE: Record<AdminUserLoginMethod, Prisma.UserWhereInput> = {
  PASSWORD: { passwordHash: { not: null }, googleId: null },
  GOOGLE: { passwordHash: null, googleId: { not: null } },
  BOTH: { passwordHash: { not: null }, googleId: { not: null } },
};

/** `YYYY-MM-DD` (đã kiểm ở DTO) ⇒ 00:00 giờ Việt Nam của ngày đó. */
function vnStartOfDay(date: string): Date {
  return new Date(`${date}T00:00:00+07:00`);
}

// Dùng chung giữa module `auth` (xác thực/token) và `users` (hồ sơ/quản trị
// tài khoản) — xem PROJECT_STRUCTURE.md §5 lý do 2 module tách tầng service
// nhưng cùng thao tác trên bảng `users`.
export class UserRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  findByGoogleId(googleId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { googleId } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** AD-12 — danh sách userId của mọi tài khoản Admin, để fan-out notification. */
  async findAdminIds(tx?: Prisma.TransactionClient): Promise<string[]> {
    const db = tx ?? this.prisma;
    const rows = await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
    return rows.map((row) => row.id);
  }

  /** AD-16 — email theo userId, để hiển thị người thực hiện trong nhật ký hoạt động. */
  async findEmailsByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } });
    return new Map(rows.map((row) => [row.id, row.email]));
  }

  /**
   * AD-16 (D14) — tên hiển thị của người đề xuất mục danh mục: ứng viên lấy họ
   * tên, nhà tuyển dụng lấy tên công ty, Admin để null. Dùng chung cho hàng chờ
   * danh mục trên dashboard và thông báo CATALOG_ENTRY_SUGGESTED.
   */
  async findCatalogSuggesters(ids: string[]): Promise<Map<string, CatalogSuggester>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        role: true,
        candidate: { select: { fullName: true } },
        employer: { select: { company: { select: { name: true } } } },
      },
    });
    return new Map(
      rows.map((row) => {
        const name = row.role === "CANDIDATE" ? row.candidate?.fullName : row.role === "EMPLOYER" ? row.employer?.company.name : null;
        return [row.id, { role: row.role, name: name?.trim() || null }];
      }),
    );
  }

  /**
   * AD-17 (U7), Mở rộng 1 (E6) — phân trang theo số trang, kèm tổng số. `q` khớp
   * email, họ tên ứng viên hoặc tên công ty. Luôn sắp thêm theo `id` để hai dòng
   * cùng `createdAt` không đổi chỗ giữa các trang.
   */
  async listForAdmin(options: AdminUserListOptions): Promise<{ items: AdminUserRow[]; total: number }> {
    const conditions: Prisma.UserWhereInput[] = [];
    if (options.role) conditions.push({ role: options.role });
    if (options.status) conditions.push({ status: options.status });
    if (options.q) {
      const contains = { contains: options.q, mode: "insensitive" } as const;
      conditions.push({
        OR: [
          { email: contains },
          { candidate: { is: { fullName: contains } } },
          { employer: { is: { company: { is: { name: contains } } } } },
        ],
      });
    }
    if (options.loginMethod) conditions.push(LOGIN_METHOD_WHERE[options.loginMethod]);
    if (options.emailVerified !== undefined) {
      conditions.push({ emailVerifiedAt: options.emailVerified ? { not: null } : null });
    }
    if (options.createdFrom) conditions.push({ createdAt: { gte: vnStartOfDay(options.createdFrom) } });
    if (options.createdTo) {
      // Tính cả ngày createdTo ⇒ nhỏ hơn 00:00 ngày hôm sau.
      conditions.push({ createdAt: { lt: new Date(vnStartOfDay(options.createdTo).getTime() + DAY_MS) } });
    }

    const where: Prisma.UserWhereInput = { AND: conditions };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: ADMIN_LIST_SELECT,
        orderBy: ADMIN_LIST_ORDER[options.sort],
        skip: (options.page - 1) * ADMIN_PAGE_SIZE,
        take: ADMIN_PAGE_SIZE,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  findForAdmin(id: string, tx?: Prisma.TransactionClient): Promise<AdminUserRow | null> {
    const db = tx ?? this.prisma;
    return db.user.findUnique({ where: { id }, select: ADMIN_LIST_SELECT });
  }

  /**
   * Trang chi tiết người dùng của Admin (E4, E5), một truy vấn lồng.
   *
   * Đọc thẳng bảng của module khác (Candidate, Cv, Application,
   * CandidateOutreachInvitation, Employer, Company) thay vì gọi service của các
   * module đó, giống module `dashboard`: đây là API chỉ đọc cho Admin, không ghi
   * bảng của ai, nên không cần đi qua quy tắc nghiệp vụ của module sở hữu. Module
   * kia đổi cấu trúc bảng thì sửa ở đây.
   */
  findDetailForAdmin(id: string): Promise<AdminUserDetailRow | null> {
    return this.prisma.user.findUnique({ where: { id }, select: ADMIN_DETAIL_SELECT });
  }

  /** Số tin do Employer này tạo, theo trạng thái (E5). Cùng lý do đọc chéo bảng như findDetailForAdmin. */
  async countJobPostsByStatus(employerId: string): Promise<Map<JobPostStatus, number>> {
    const rows = await this.prisma.jobPost.groupBy({ by: ["status"], where: { employerId }, _count: { _all: true } });
    return new Map(rows.map((row) => [row.status, row._count._all]));
  }

  /**
   * Đổi trạng thái chỉ khi trạng thái hiện tại nằm trong `from` — false nếu không
   * đổi được (user đã bị Admin khác khoá/mở khoá trước đó), để service trả 409.
   */
  async setStatus(id: string, from: UserStatus[], to: UserStatus, tx?: Prisma.TransactionClient): Promise<boolean> {
    const db = tx ?? this.prisma;
    const { count } = await db.user.updateMany({ where: { id, status: { in: from } }, data: { status: to } });
    return count === 1;
  }

  createWithPassword(params: {
    email: string;
    passwordHash: string;
    role: "CANDIDATE" | "EMPLOYER";
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: params.email.toLowerCase(),
        passwordHash: params.passwordHash,
        role: params.role,
      },
    });
  }

  createWithGoogle(params: {
    email: string;
    googleId: string;
    role: "CANDIDATE" | "EMPLOYER";
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: params.email.toLowerCase(),
        googleId: params.googleId,
        role: params.role,
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });
  }

  linkGoogleId(id: string, googleId: string): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { googleId } });
  }

  /**
   * G1 (AD-17): liên kết Google vào tài khoản chưa xác thực ⇒ kích hoạt và xoá
   * mật khẩu. Mật khẩu đó chưa ai chứng minh là của chủ email — giữ lại thì người
   * đăng ký trước bằng email của nạn nhân đăng nhập được (chiếm tài khoản trước).
   * Chỉ đổi khi vẫn PENDING_VERIFICATION; trạng thái vừa đổi (vd. bị khoá) thì
   * chỉ liên kết, không kích hoạt.
   */
  async linkGoogleToUnverified(id: string, googleId: string): Promise<User> {
    const { count } = await this.prisma.user.updateMany({
      where: { id, status: "PENDING_VERIFICATION" },
      data: { googleId, status: "ACTIVE", emailVerifiedAt: new Date(), passwordHash: null },
    });
    return count === 1 ? this.prisma.user.findUniqueOrThrow({ where: { id } }) : this.linkGoogleId(id, googleId);
  }

  /**
   * Kích hoạt thủ công (AD-18, E3/P1): chỉ đổi khi vẫn PENDING_VERIFICATION. Ghi
   * cả `emailVerifiedAt` để lần khoá rồi mở khoá sau không đưa người này về
   * PENDING_VERIFICATION (U4). Trả false nếu trạng thái đã đổi giữa chừng.
   */
  async activateManually(id: string, tx?: Prisma.TransactionClient): Promise<boolean> {
    const db = tx ?? this.prisma;
    const { count } = await db.user.updateMany({
      where: { id, status: "PENDING_VERIFICATION" },
      data: { status: "ACTIVE", emailVerifiedAt: new Date() },
    });
    return count === 1;
  }

  markVerified(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { status: "ACTIVE", emailVerifiedAt: new Date() },
    });
  }

  updatePassword(id: string, passwordHash: string, tx?: Prisma.TransactionClient): Promise<User> {
    const db = tx ?? this.prisma;
    return db.user.update({ where: { id }, data: { passwordHash } });
  }

  /** Ghi mốc "đăng xuất mọi thiết bị" (AD-18) — chỉ gọi qua SessionRevocationService. */
  async markSessionsRevoked(id: string, at: Date, tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.prisma;
    await db.user.update({ where: { id }, data: { sessionsRevokedAt: at } });
  }
}
