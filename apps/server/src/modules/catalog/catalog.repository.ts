import type { City, CompanyType, Industry, PrismaClient } from "@prisma/client";

type CatalogRow = { id: string; name: string };

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

  // Chỉ mục đã duyệt, cùng lý do với listSkills bên dưới: trường/ngành người
  // dùng tự gõ (PENDING) chưa được lọt vào dropdown công khai
  // (docs/06-backend/cv-ai-extraction-phase2/PLAN.md Quyết định #6).
  listMajors(): Promise<CatalogRow[]> {
    return this.prisma.major.findMany({
      where: { status: "APPROVED" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  listUniversities(): Promise<CatalogRow[]> {
    return this.prisma.university.findMany({
      where: { status: "APPROVED" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  // Chỉ skill đã duyệt: skill do người dùng tự gõ (PENDING) chỉ hiện trong hồ sơ/
  // tin của chính người tạo, không được lọt vào dropdown công khai khi chưa qua
  // kiểm duyệt (xem docs/06-backend/jobpost-skill-huong-b/PLAN.md).
  // `select` tường minh vì bảng skills có thêm cột nội bộ (createdByUserId,
  // pendingMatchSkillId) không được lộ ra endpoint công khai không cần đăng nhập.
  listSkills(): Promise<CatalogRow[]> {
    return this.prisma.skill.findMany({
      where: { status: "APPROVED" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }
}
