import type { Prisma, PrismaClient, User } from "@prisma/client";
import type { CatalogSuggester } from "@sip/shared-types";

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
