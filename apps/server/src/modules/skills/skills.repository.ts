import type { CatalogAliasSource, CatalogEntryStatus, Prisma, PrismaClient, Skill } from "@prisma/client";
import type { SkillAliasRepository } from "./skill-alias.repository";

type Db = PrismaClient | Prisma.TransactionClient;

const PAGE_SIZE = 20;

const adminSkillSelect = {
  id: true,
  name: true,
  status: true,
  createdAt: true,
  createdBy: { select: { id: true, email: true, role: true } },
  pendingMatchSkill: { select: { id: true, name: true } },
  _count: { select: { candidateSkills: true, jobPostSkills: true } },
} satisfies Prisma.SkillSelect;

export type AdminSkillRow = Prisma.SkillGetPayload<{ select: typeof adminSkillSelect }>;

export interface PendingVerification {
  id: string;
  name: string;
  pendingMatchSkill: { id: string; name: string };
}

export class SkillsRepository {
  private readonly prisma: PrismaClient;
  private readonly skillAliasRepository: SkillAliasRepository;

  constructor({
    prisma,
    skillAliasRepository,
  }: {
    prisma: PrismaClient;
    skillAliasRepository: SkillAliasRepository;
  }) {
    this.prisma = prisma;
    this.skillAliasRepository = skillAliasRepository;
  }

  findById(id: string): Promise<Skill | null> {
    return this.prisma.skill.findUnique({ where: { id } });
  }

  findAdminRow(id: string): Promise<AdminSkillRow | null> {
    return this.prisma.skill.findUnique({ where: { id }, select: adminSkillSelect });
  }

  /**
   * Toàn bộ skill APPROVED để so khớp token ở bậc 1. Catalog kỹ năng là danh mục
   * nhỏ (hàng trăm dòng, không phải hàng triệu) nên load hết vào RAM rồi tính
   * similarity trong process rẻ hơn nhiều so với đẩy fuzzy xuống SQL.
   */
  listApproved(): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.skill.findMany({
      where: { status: "APPROVED" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  createPending(data: {
    name: string;
    createdByUserId: string;
    pendingMatchSkillId?: string | null;
  }): Promise<Skill> {
    return this.prisma.skill.create({
      data: {
        name: data.name,
        status: "PENDING",
        createdByUserId: data.createdByUserId,
        pendingMatchSkillId: data.pendingMatchSkillId ?? null,
      },
    });
  }

  /** Hàng đợi của cron: skill vùng xám đang chờ Gemini xác nhận. */
  async findPendingVerification(limit: number): Promise<PendingVerification[]> {
    const rows = await this.prisma.skill.findMany({
      where: { status: "PENDING", pendingMatchSkillId: { not: null } },
      select: { id: true, name: true, pendingMatchSkill: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return rows.filter((row): row is PendingVerification => row.pendingMatchSkill !== null);
  }

  /** Đánh dấu "đã qua LLM" — vòng cron sau không hỏi lại skill này nữa. */
  async clearPendingMatch(skillId: string, db: Db = this.prisma): Promise<void> {
    await db.skill.update({ where: { id: skillId }, data: { pendingMatchSkillId: null } });
  }

  async listForAdmin(
    status: CatalogEntryStatus | undefined,
    cursor: string | undefined,
  ): Promise<{ items: AdminSkillRow[]; hasMore: boolean; nextCursor?: string }> {
    const rows = await this.prisma.skill.findMany({
      where: status ? { status } : {},
      select: adminSkillSelect,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > PAGE_SIZE;
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    return { items, hasMore, ...(nextCursor ? { nextCursor } : {}) };
  }

  approve(id: string): Promise<Skill> {
    return this.prisma.skill.update({
      where: { id },
      data: { status: "APPROVED", pendingMatchSkillId: null },
    });
  }

  /**
   * Từ chối = xoá hẳn skill. CandidateSkill/JobPostSkill trỏ vào nó bị cascade
   * xoá theo — chấp nhận mất liên kết, vì skill này bị kết luận là không hợp lệ.
   */
  async reject(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.detachPendingMatchReferences(id, tx);
      await tx.skill.delete({ where: { id } });
    });
  }

  /**
   * Gộp skill `sourceId` (PENDING) vào `targetId`: chuyển mọi liên kết sang skill
   * đích, ghi lại tên cũ thành alias (feedback loop — lần sau gõ đúng tên đó sẽ
   * khớp ngay ở bậc 0, không cần LLM), rồi xoá skill nguồn.
   */
  async merge(sourceId: string, targetId: string, aliasSource: CatalogAliasSource): Promise<void> {
    if (sourceId === targetId) return;

    await this.prisma.$transaction(async (tx) => {
      const source = await tx.skill.findUnique({ where: { id: sourceId }, select: { name: true } });
      if (!source) return;

      // Tạo liên kết mới TRƯỚC khi xoá skill nguồn (xoá sẽ cascade mất liên kết
      // cũ). skipDuplicates cho trường hợp tin/hồ sơ đã gắn sẵn skill đích.
      const jobPostLinks = await tx.jobPostSkill.findMany({ where: { skillId: sourceId } });
      if (jobPostLinks.length > 0) {
        await tx.jobPostSkill.createMany({
          data: jobPostLinks.map((link) => ({ jobPostId: link.jobPostId, skillId: targetId })),
          skipDuplicates: true,
        });
      }

      const candidateLinks = await tx.candidateSkill.findMany({ where: { skillId: sourceId } });
      if (candidateLinks.length > 0) {
        await tx.candidateSkill.createMany({
          data: candidateLinks.map((link) => ({
            candidateId: link.candidateId,
            skillId: targetId,
            yearsOfExperience: link.yearsOfExperience,
          })),
          skipDuplicates: true,
        });
      }

      await this.skillAliasRepository.upsert(source.name, targetId, aliasSource, tx);
      await this.detachPendingMatchReferences(sourceId, tx);
      await tx.skill.delete({ where: { id: sourceId } });
    });
  }

  /**
   * pendingMatchSkillId không có onDelete: Cascade (cố ý — không muốn xoá lây
   * skill khác), nên phải gỡ tham chiếu trước khi xoá, nếu không Postgres chặn
   * vì ràng buộc khoá ngoại.
   */
  private async detachPendingMatchReferences(skillId: string, db: Db): Promise<void> {
    await db.skill.updateMany({ where: { pendingMatchSkillId: skillId }, data: { pendingMatchSkillId: null } });
  }
}
