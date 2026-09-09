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
