import type { Prisma, PrismaClient, SkillAlias, SkillAliasSource } from "@prisma/client";
import { normalizeSkillName } from "./skill-normalize.util";

type Db = PrismaClient | Prisma.TransactionClient;

export class SkillAliasRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  /** Tra alias theo tên đã chuẩn hoá — bậc 0 của pipeline, rẻ nhất. */
  findByName(name: string, db: Db = this.prisma): Promise<(SkillAlias & { skill: { id: string; name: string } }) | null> {
    return db.skillAlias.findUnique({
      where: { alias: normalizeSkillName(name) },
      include: { skill: { select: { id: true, name: true } } },
    });
  }

  /**
   * Ghi alias mới khi một skill PENDING được gộp vào skill đích (feedback loop).
   * Dùng upsert vì alias là unique toàn bảng: cùng một biến thể có thể được hai
   * người gõ ra rồi gộp hai lần — lần sau chỉ cần trỏ lại skill đích mới.
   */
  async upsert(
    alias: string,
    skillId: string,
    source: SkillAliasSource,
    db: Db = this.prisma,
  ): Promise<void> {
    const normalized = normalizeSkillName(alias);
    if (!normalized) return;

    await db.skillAlias.upsert({
      where: { alias: normalized },
      update: { skillId, source },
      create: { alias: normalized, skillId, source },
    });
  }
}
