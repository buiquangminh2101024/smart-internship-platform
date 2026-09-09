import type { Company, CompanyVerificationMethod, CompanyVerificationStatus, Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

const PAGE_SIZE = 20;

// Shape đơn giản hoá thay vì Prisma.CompanyUncheckedCreateInput/UpdateInput —
// employers.service.ts dùng chung một object cho cả tạo mới lẫn nộp lại
// (resubmit), field nào cũng optional trừ `name`/`taxCode` bắt buộc lúc tạo.
export interface CompanyWriteData {
  name?: string;
  taxCode?: string;
  industryId?: string | null;
  companyTypeId?: string | null;
  cityId?: string | null;
  address?: string | null;
  description?: string | null;
  website?: string | null;
  foundedYear?: number | null;
  verificationStatus?: CompanyVerificationStatus;
  verificationMethod?: CompanyVerificationMethod | null;
  businessLicenseUrl?: string | null;
  verificationNote?: string | null;
  rejectedAt?: Date | null;
  isVerified?: boolean;
  verifiedAt?: Date | null;
  requiresApproval?: boolean;
}

// Dùng chéo bởi `employers` (tạo/nộp lại Company lúc hoàn tất thủ tục) và
// `companies` (hàng đợi + hành động xác thực của Admin) — đăng ký tập trung
// trong container.ts như UserRepository, xem PROJECT_STRUCTURE.md §5.
export class CompanyRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  findById(id: string, db: Db = this.prisma): Promise<Company | null> {
    return db.company.findUnique({ where: { id } });
  }

  create(data: CompanyWriteData & { name: string; taxCode: string }, db: Db = this.prisma): Promise<Company> {
    return db.company.create({ data });
  }

  update(id: string, data: CompanyWriteData, db: Db = this.prisma): Promise<Company> {
    return db.company.update({ where: { id }, data });
  }

  async listByStatus(
    status: CompanyVerificationStatus | undefined,
    cursor: string | undefined,
  ): Promise<{ items: Company[]; nextCursor?: string; hasMore: boolean }> {
    const rows = await this.prisma.company.findMany({
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(status ? { where: { verificationStatus: status } } : {}),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > PAGE_SIZE;
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    return { items, hasMore, ...(nextCursor ? { nextCursor } : {}) };
  }

  countRetractions(companyId: string): Promise<number> {
    return this.prisma.jobPostModerationAction.count({
      where: { action: "RETRACTED", jobPost: { companyId } },
    });
  }
}
