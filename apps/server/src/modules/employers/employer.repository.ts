import type { Company, Employer, Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type EmployerWithCompany = Employer & { company: Company };

// Sở hữu bởi module `employers`, nhưng đăng ký tập trung ở container.ts (như
// CompanyRepository từ Phase 4) vì từ Phase 5 module `subscriptions` cũng đọc
// companyId/isCompanyAdmin qua đây lúc checkout — xem subscriptions.service.ts.
export class EmployerRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  findByUserId(userId: string, db: Db = this.prisma): Promise<EmployerWithCompany | null> {
    return db.employer.findUnique({ where: { userId }, include: { company: true } });
  }

  // AD-19: chỉ phần danh tính cho EmployerIdentityCache — 1 câu thay vì 2 câu
  // của `include: company` ở findByUserId.
  findIdentityByUserId(userId: string, db: Db = this.prisma): Promise<Pick<Employer, "id" | "companyId"> | null> {
    return db.employer.findUnique({ where: { userId }, select: { id: true, companyId: true } });
  }

  create(
    data: { userId: string; companyId: string; isCompanyAdmin: boolean; title?: string; phone?: string },
    db: Db = this.prisma,
  ): Promise<Employer> {
    return db.employer.create({ data });
  }

  updateProfile(userId: string, data: { title?: string; phone?: string }, db: Db = this.prisma): Promise<Employer> {
    return db.employer.update({ where: { userId }, data });
  }

  // Phase 10: gửi notification cho MỌI employer của company (không chỉ
  // isCompanyAdmin) — bất kỳ ai trong số họ cũng có thể thao tác trên tin tuyển
  // dụng nên đều cần biết kết quả kiểm duyệt.
  findManyByCompanyId(companyId: string, db: Db = this.prisma): Promise<Pick<Employer, "id" | "userId">[]> {
    return db.employer.findMany({ where: { companyId }, select: { id: true, userId: true } });
  }

  /**
   * AD-29 bước 7 — NTD (kèm email) của nhiều công ty trong một câu, đọc trước cả lô duyệt /
   * từ chối hàng loạt để mỗi tin không phải đọc lại NTD và email từng người.
   */
  async findRecipientsByCompanyIds(
    companyIds: string[],
    db: Db = this.prisma,
  ): Promise<Map<string, { userId: string; email: string }[]>> {
    const rows = await db.employer.findMany({
      where: { companyId: { in: companyIds } },
      select: { companyId: true, userId: true, user: { select: { email: true } } },
    });
    const byCompany = new Map<string, { userId: string; email: string }[]>();
    for (const row of rows) {
      const list = byCompany.get(row.companyId) ?? [];
      list.push({ userId: row.userId, email: row.user.email });
      byCompany.set(row.companyId, list);
    }
    return byCompany;
  }

  // AD-16: thông báo gói sắp hết hạn chỉ gửi company admin — người duy nhất
  // được mua/gia hạn gói (subscriptions.service.ts#checkout).
  findCompanyAdminsByCompanyId(companyId: string, db: Db = this.prisma): Promise<Pick<Employer, "id" | "userId">[]> {
    return db.employer.findMany({ where: { companyId, isCompanyAdmin: true }, select: { id: true, userId: true } });
  }
}
