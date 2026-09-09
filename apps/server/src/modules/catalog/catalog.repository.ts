import type { City, CompanyType, Industry, PrismaClient } from "@prisma/client";

// Chỉ Industry/CompanyType/City — cần cho form công ty (Phase 4, xem
// employers module). University/Major thuộc phạm vi Candidate (Phase 3).
export class CatalogRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  listIndustries(): Promise<Industry[]> {
    return this.prisma.industry.findMany({ orderBy: { name: "asc" } });
  }

  listCompanyTypes(): Promise<CompanyType[]> {
    return this.prisma.companyType.findMany({ orderBy: { name: "asc" } });
  }

  listCities(): Promise<City[]> {
    return this.prisma.city.findMany({ orderBy: { name: "asc" } });
  }
}
