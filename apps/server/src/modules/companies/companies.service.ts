import type { Company as CompanyDto, CompanyDetail, CompanyVerificationStatus, PaginatedResponse } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import { toCompanyDto } from "./company.mapper";
import type { CompanyRepository } from "./company.repository";

export class CompaniesService {
  private readonly companyRepository: CompanyRepository;

  constructor({ companyRepository }: { companyRepository: CompanyRepository }) {
    this.companyRepository = companyRepository;
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

  async verify(id: string): Promise<CompanyDto> {
    await this.requireCompany(id);
    const updated = await this.companyRepository.update(id, {
      verificationStatus: "VERIFIED",
      isVerified: true,
      verifiedAt: new Date(),
      rejectedAt: null,
    });
    return toCompanyDto(updated);
  }

  async reject(id: string, reason: string): Promise<CompanyDto> {
    await this.requireCompany(id);
    const updated = await this.companyRepository.update(id, {
      verificationStatus: "REJECTED",
      isVerified: false,
      rejectedAt: new Date(),
      verificationNote: reason,
    });
    return toCompanyDto(updated);
  }

  async setRequiresApproval(id: string, requiresApproval: boolean): Promise<CompanyDto> {
    await this.requireCompany(id);
    const updated = await this.companyRepository.update(id, { requiresApproval });
    return toCompanyDto(updated);
  }

  private async requireCompany(id: string) {
    const company = await this.companyRepository.findById(id);
    if (!company) {
      throw new AppError(404, "Company not found");
    }
    return company;
  }
}
