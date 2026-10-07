import type { Prisma, PrismaClient, Role, User, UserStatus } from "@prisma/client";
import type { CatalogSuggester } from "@sip/shared-types";

const ADMIN_PAGE_SIZE = 20;

// Cột cho danh sách người dùng của Admin (AD-17, U7) — kèm tên hiển thị.
const ADMIN_LIST_SELECT = {
  id: true,
  email: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  candidate: { select: { fullName: true } },
  employer: { select: { companyId: true, company: { select: { name: true } } } },
} satisfies Prisma.UserSelect;

export type AdminUserRow = Prisma.UserGetPayload<{ select: typeof ADMIN_LIST_SELECT }>;

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

  /** AD-17 (U7) — mới tạo trước, phân trang cursor theo id; `q` tìm theo email. */
  async listForAdmin(options: {
    role?: Role | undefined;
    status?: UserStatus | undefined;
    q?: string | undefined;
    cursor?: string | undefined;
  }): Promise<{ items: AdminUserRow[]; nextCursor?: string; hasMore: boolean }> {
    const where: Prisma.UserWhereInput = {
      ...(options.role ? { role: options.role } : {}),
      ...(options.status ? { status: options.status } : {}),
      ...(options.q ? { email: { contains: options.q, mode: "insensitive" } } : {}),
    };
    const rows = await this.prisma.user.findMany({
      where,
      select: ADMIN_LIST_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: ADMIN_PAGE_SIZE + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > ADMIN_PAGE_SIZE;
    const items = hasMore ? rows.slice(0, ADMIN_PAGE_SIZE) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    return { items, hasMore, ...(nextCursor ? { nextCursor } : {}) };
  }

  findForAdmin(id: string, tx?: Prisma.TransactionClient): Promise<AdminUserRow | null> {
    const db = tx ?? this.prisma;
    return db.user.findUnique({ where: { id }, select: ADMIN_LIST_SELECT });
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

  markVerified(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { status: "ACTIVE", emailVerifiedAt: new Date() },
    });
  }

  updatePassword(id: string, passwordHash: string): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }
}
