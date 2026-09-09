import type { Company, Employer, Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type EmployerWithCompany = Employer & { company: Company };

// Repository riêng của module `employers` (không dùng chung với `companies` —
// khác PROJECT_STRUCTURE.md §5 lifecycle của UserRepository vốn dùng chung
// auth/users vì cùng thao tác 1 bảng users cho 2 mục đích khác nhau; ở đây
// employers/companies là 2 aggregate khác nhau nên mỗi module giữ repository
// của model mình, chỉ CompanyRepository được dùng chéo — xem employers.service.ts).
export class EmployerRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  findByUserId(userId: string, db: Db = this.prisma): Promise<EmployerWithCompany | null> {
    return db.employer.findUnique({ where: { userId }, include: { company: true } });
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
}
