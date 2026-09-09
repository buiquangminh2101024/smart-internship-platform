import type { Company as PrismaCompany } from "@prisma/client";
import type { Company as CompanyDto } from "@sip/shared-types";

export function toCompanyDto(company: PrismaCompany): CompanyDto {
  return {
    id: company.id,
    name: company.name,
    description: company.description,
    logoUrl: company.logoUrl,
    bannerUrl: company.bannerUrl,
    website: company.website,
    industryId: company.industryId,
    companyTypeId: company.companyTypeId,
    cityId: company.cityId,
    address: company.address,
    taxCode: company.taxCode,
    foundedYear: company.foundedYear,
    isVerified: company.isVerified,
    requiresApproval: company.requiresApproval,
    verifiedAt: company.verifiedAt?.toISOString() ?? null,
    verificationStatus: company.verificationStatus,
    verificationMethod: company.verificationMethod,
    businessLicenseUrl: company.businessLicenseUrl,
    verificationNote: company.verificationNote,
    rejectedAt: company.rejectedAt?.toISOString() ?? null,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
  };
}
