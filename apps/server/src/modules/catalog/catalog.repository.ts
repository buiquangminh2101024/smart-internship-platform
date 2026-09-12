import type { City, CompanyType, Industry, Major, PrismaClient, Skill, University } from "@prisma/client";

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

  listMajors(): Promise<Major[]> {
    return this.prisma.major.findMany({ orderBy: { name: "asc" } });
  }

  listUniversities(): Promise<University[]> {
    return this.prisma.university.findMany({ orderBy: { name: "asc" } });
  }

  listSkills(): Promise<Skill[]> {
    return this.prisma.skill.findMany({ orderBy: { name: "asc" } });
  }
}
