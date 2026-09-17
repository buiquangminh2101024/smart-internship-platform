import type { Prisma, PrismaClient, User } from "@prisma/client";

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
