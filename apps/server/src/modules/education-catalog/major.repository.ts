import type { CatalogAliasSource, CatalogEntryStatus, Prisma, PrismaClient } from "@prisma/client";
import { normalizeMajorName } from "./education-catalog-normalize.util";
import type {
  AdminEducationCatalogRow,
  CatalogEntryRow,
  EducationCatalogRepository,
  PendingCatalogVerification,
} from "./education-catalog.types";

type Db = PrismaClient | Prisma.TransactionClient;

const PAGE_SIZE = 20;

const entrySelect = { id: true, name: true, status: true } satisfies Prisma.MajorSelect;

const adminSelect = {
  id: true,
  name: true,
  status: true,
  createdAt: true,
  createdBy: { select: { email: true } },
  pendingMatchMajor: { select: { id: true, name: true } },
  _count: { select: { educations: true } },
} satisfies Prisma.MajorSelect;

type AdminRow = Prisma.MajorGetPayload<{ select: typeof adminSelect }>;

function toAdminRow(row: AdminRow): AdminEducationCatalogRow {
  return {
    id: row.id,
    name: row.name,
    code: null,
    status: row.status,
    createdByEmail: row.createdBy?.email ?? null,
    pendingMatch: row.pendingMatchMajor,
    usageCount: row._count.educations,
    createdAt: row.createdAt,
  };
}

/** Cấu trúc y hệt university.repository.ts — khác model Prisma nên tách hai class. */
export class MajorRepository implements EducationCatalogRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  findById(id: string): Promise<CatalogEntryRow | null> {
    return this.prisma.major.findUnique({ where: { id }, select: entrySelect });
  }

  async findAdminRow(id: string): Promise<AdminEducationCatalogRow | null> {
    const row = await this.prisma.major.findUnique({ where: { id }, select: adminSelect });
    return row ? toAdminRow(row) : null;
  }

  listForMatching(): Promise<CatalogEntryRow[]> {
    return this.prisma.major.findMany({ select: entrySelect });
  }

  async findByAlias(aliasKey: string): Promise<CatalogEntryRow | null> {
    const alias = await this.prisma.majorAlias.findUnique({
      where: { alias: aliasKey },
      select: { major: { select: entrySelect } },
    });
    return alias?.major ?? null;
  }

  findByNameInsensitive(name: string, excludeId?: string): Promise<CatalogEntryRow | null> {
    return this.prisma.major.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: entrySelect,
    });
  }

  createPending(data: { name: string; createdByUserId: string; pendingMatchId: string | null }): Promise<CatalogEntryRow> {
    return this.prisma.major.create({
      data: {
        name: data.name,
        status: "PENDING",
        createdByUserId: data.createdByUserId,
        pendingMatchMajorId: data.pendingMatchId,
      },
      select: entrySelect,
    });
  }

  async findPendingVerification(limit: number): Promise<PendingCatalogVerification[]> {
    const rows = await this.prisma.major.findMany({
      where: { status: "PENDING", pendingMatchMajorId: { not: null } },
      select: { id: true, name: true, pendingMatchMajor: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return rows.flatMap((row) =>
      row.pendingMatchMajor ? [{ id: row.id, name: row.name, pendingMatch: row.pendingMatchMajor }] : [],
    );
  }

  async clearPendingMatch(id: string): Promise<void> {
    await this.prisma.major.update({ where: { id }, data: { pendingMatchMajorId: null } });
  }

  async listForAdmin(
    status: CatalogEntryStatus | undefined,
    cursor: string | undefined,
  ): Promise<{ items: AdminEducationCatalogRow[]; hasMore: boolean; nextCursor?: string }> {
    const rows = await this.prisma.major.findMany({
      where: status ? { status } : {},
      select: adminSelect,
      // id làm khoá phụ: dữ liệu seed hàng loạt có cùng createdAt, thiếu khoá
      // phụ thì phân trang theo cursor có thể lặp/bỏ sót dòng.
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > PAGE_SIZE;
    const items = (hasMore ? rows.slice(0, PAGE_SIZE) : rows).map(toAdminRow);
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    return { items, hasMore, ...(nextCursor ? { nextCursor } : {}) };
  }

  async approve(id: string): Promise<void> {
    await this.prisma.major.update({
      where: { id },
      data: { status: "APPROVED", pendingMatchMajorId: null },
    });
  }

  async renameApprove(id: string, correctedName: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.major.findUnique({ where: { id }, select: { name: true } });
      if (!current) return;

      await tx.major.update({
        where: { id },
        data: { name: correctedName, status: "APPROVED", pendingMatchMajorId: null },
      });
      // Người khác gõ lại đúng cách viết cũ sẽ khớp ngay ở bậc 0.
      if (normalizeMajorName(current.name) !== normalizeMajorName(correctedName)) {
        await this.upsertAlias(current.name, id, "ADMIN_MERGE", tx);
      }
    });
  }

  /**
   * Từ chối = xoá hẳn. Education trỏ vào mục này bị set null (FK ON DELETE SET
   * NULL) — dòng học vấn vẫn còn, chỉ mất tên ngành không hợp lệ.
   */
  async reject(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.detachPendingMatchReferences(id, tx);
      await tx.major.delete({ where: { id } });
    });
  }

  /**
   * Gộp `sourceId` (PENDING) vào `targetId`: chuyển Education sang mục đích, ghi
   * tên cũ thành alias (feedback loop — lần sau khớp ngay ở bậc 0), rồi xoá nguồn.
   */
  async merge(sourceId: string, targetId: string, aliasSource: CatalogAliasSource): Promise<void> {
    if (sourceId === targetId) return;

    await this.prisma.$transaction(async (tx) => {
      const source = await tx.major.findUnique({ where: { id: sourceId }, select: { name: true } });
      if (!source) return;

      await tx.education.updateMany({ where: { majorId: sourceId }, data: { majorId: targetId } });
      // Alias cũ của nguồn (nếu có) sẽ bị cascade xoá theo — chuyển sang đích trước.
      await tx.majorAlias.updateMany({ where: { majorId: sourceId }, data: { majorId: targetId } });
      await this.upsertAlias(source.name, targetId, aliasSource, tx);
      await this.detachPendingMatchReferences(sourceId, tx);
      await tx.major.delete({ where: { id: sourceId } });
    });
  }

  private async upsertAlias(name: string, majorId: string, source: CatalogAliasSource, db: Db): Promise<void> {
    const alias = normalizeMajorName(name);
    if (!alias) return;
    await db.majorAlias.upsert({
      where: { alias },
      update: { majorId, source },
      create: { alias, majorId, source },
    });
  }

  private async detachPendingMatchReferences(id: string, db: Db): Promise<void> {
    await db.major.updateMany({ where: { pendingMatchMajorId: id }, data: { pendingMatchMajorId: null } });
  }
}
