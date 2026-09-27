import type { Prisma, PrismaClient } from "@prisma/client";
import type { Company as CompanyDto, CompanyDetail, CompanyVerificationStatus, PaginatedResponse } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { EmployerRepository } from "../employers/employer.repository";
import type { NotificationPayloadMap } from "../notifications/notification.types";
import type { NotificationsService } from "../notifications/notifications.service";
import { toCompanyDto } from "./company.mapper";
import type { CompanyRepository } from "./company.repository";

export class CompaniesService {
  private readonly prisma: PrismaClient;
  private readonly companyRepository: CompanyRepository;
  private readonly employerRepository: EmployerRepository;
  private readonly notificationsService: NotificationsService;

  constructor({
    prisma,
    companyRepository,
    employerRepository,
    notificationsService,
  }: {
    prisma: PrismaClient;
    companyRepository: CompanyRepository;
    employerRepository: EmployerRepository;
    notificationsService: NotificationsService;
  }) {
    this.prisma = prisma;
    this.companyRepository = companyRepository;
    this.employerRepository = employerRepository;
    this.notificationsService = notificationsService;
  }

  async list(status: CompanyVerificationStatus | undefined, cursor: string | undefined): Promise<PaginatedResponse<CompanyDto>> {
    const { items, hasMore, nextCursor } = await this.companyRepository.listByStatus(status, cursor);
    return { items: items.map(toCompanyDto), hasMore, ...(nextCursor ? { nextCursor } : {}) };
  }

  async getDetail(id: string): Promise<CompanyDetail> {
    const company = await this.requireCompany(id);
    const retractionCount = await this.companyRepository.countRetractions(id);
    return { ...toCompanyDto(company), retractionCount };
  }

  async listPublic(q?: string) {
    const companies = await this.prisma.company.findMany({
      where: {
        isVerified: true,
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      },
      include: {
        city: true,
        _count: {
          select: {
            jobPosts: { where: { status: "PUBLISHED" } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return companies.map(c => ({
      id: c.id,
      name: c.name,
      logoUrl: c.logoUrl,
      city: c.city ? c.city.name : null,
      jobCount: c._count.jobPosts,
    }));
  }

  async getPublicDetail(id: string): Promise<CompanyDto> {
    const company = await this.requireCompany(id);
    if (!company.isVerified) {
      throw new AppError(403, "Hồ sơ công ty này hiện chưa thể xem công khai");
    }
    const dto = toCompanyDto(company);
    return {
      ...dto,
      taxCode: "",
      businessLicenseUrl: null,
      verificationNote: null,
      rejectedAt: null,
      verificationMethod: null,
    } as any;
  }

  async verify(id: string): Promise<CompanyDto> {
    const company = await this.requireCompany(id);
    // Chặn gọi lại trên company đã xác minh — nếu không, mỗi lần bấm lại nút
    // duyệt sẽ sinh thêm một notification + một email trùng (cùng pattern guard
    // trạng thái đã có ở job-posts.service.ts).
    if (company.verificationStatus === "VERIFIED") {
      throw new AppError(409, "Company has already been verified");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await this.companyRepository.update(
        id,
        { verificationStatus: "VERIFIED", isVerified: true, verifiedAt: new Date(), rejectedAt: null },
        tx,
      );
      await this.notifyCompanyEmployers(id, "COMPANY_VERIFIED", { companyId: id, companyName: company.name }, tx);
      return result;
    });
    return toCompanyDto(updated);
  }

  async reject(id: string, reason: string): Promise<CompanyDto> {
    const company = await this.requireCompany(id);
    if (company.verificationStatus === "REJECTED") {
      throw new AppError(409, "Company has already been rejected");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await this.companyRepository.update(
        id,
        { verificationStatus: "REJECTED", isVerified: false, rejectedAt: new Date(), verificationNote: reason },
        tx,
      );
      await this.notifyCompanyEmployers(
        id,
        "COMPANY_REJECTED",
        { companyId: id, companyName: company.name, reason },
        tx,
      );
      return result;
    });
    return toCompanyDto(updated);
  }

  async setRequiresApproval(id: string, requiresApproval: boolean): Promise<CompanyDto> {
    await this.requireCompany(id);
    const updated = await this.companyRepository.update(id, { requiresApproval });
    return toCompanyDto(updated);
  }

  private async notifyCompanyEmployers<T extends "COMPANY_VERIFIED" | "COMPANY_REJECTED">(
    companyId: string,
    type: T,
    data: NotificationPayloadMap[T],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const employers = await this.employerRepository.findManyByCompanyId(companyId, tx);
    await this.notificationsService.notifyMany(type, employers.map((employer) => employer.userId), data, tx);
  }

  private async requireCompany(id: string) {
    const company = await this.companyRepository.findById(id);
    if (!company) {
      throw new AppError(404, "Company not found");
    }
    return company;
  }
}
