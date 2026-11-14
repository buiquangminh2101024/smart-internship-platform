import { Prisma, type PrismaClient } from "@prisma/client";
import { NOW_UTC } from "../candidate-outreach/candidate-outreach.repository";

/**
 * Đọc / ghi dấu "cần chấm lại" trên `candidates` (AD-27 mục 1, D1). Ghi bằng SQL để
 * không đổi `Candidate.updatedAt`: đây là việc của hệ thống, không phải ứng viên sửa hồ sơ.
 * Giờ lấy từ đồng hồ DB (`NOW_UTC`), cùng đồng hồ với mốc "lúc bắt đầu lô" khi xoá dấu (D2).
 */
export class LiveRescoreRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  /**
   * Đặt dấu và `matchProfileChangedAt` (Q2) bằng cùng một giờ. Trả số ứng viên đã đánh dấu.
   */
  async markCandidates(candidateIds: string[]): Promise<number> {
    const ids = [...new Set(candidateIds)];
    if (ids.length === 0) return 0;
    return this.prisma.$executeRaw(Prisma.sql`
      UPDATE candidates
      SET "matchRescoreRequestedAt" = ${NOW_UTC}, "matchProfileChangedAt" = ${NOW_UTC}
      WHERE "id" IN (${Prisma.join(ids)})
    `);
  }

  /** Ứng viên có ít nhất một kỹ năng trong danh sách (mọi trạng thái của kỹ năng). */
  async findCandidateIdsBySkills(skillIds: string[]): Promise<string[]> {
    if (skillIds.length === 0) return [];
    const rows = await this.prisma.$queryRaw<Array<{ candidateId: string }>>(Prisma.sql`
      SELECT DISTINCT "candidateId" FROM candidate_skills
      WHERE "skillId" IN (${Prisma.join(skillIds)})
    `);
    return rows.map((row) => row.candidateId);
  }

  /** Ứng viên có ít nhất một dòng học vấn gắn ngành trong danh sách. */
  async findCandidateIdsByMajors(majorIds: string[]): Promise<string[]> {
    if (majorIds.length === 0) return [];
    const rows = await this.prisma.$queryRaw<Array<{ candidateId: string }>>(Prisma.sql`
      SELECT DISTINCT "candidateId" FROM educations
      WHERE "majorId" IN (${Prisma.join(majorIds)})
    `);
    return rows.map((row) => row.candidateId);
  }
}
