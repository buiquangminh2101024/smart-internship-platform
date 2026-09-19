import type { CatalogAliasSource, CatalogEntryStatus, Prisma, PrismaClient } from "@prisma/client";
import { normalizeUniversityName } from "./education-catalog-normalize.util";
import type {
  AdminEducationCatalogRow,
  CatalogEntryRow,
  EducationCatalogRepository,
  PendingCatalogVerification,
} from "./education-catalog.types";

type Db = PrismaClient | Prisma.TransactionClient;

const PAGE_SIZE = 20;

const entrySelect = { id: true, name: true, status: true } satisfies Prisma.UniversitySelect;

const adminSelect = {
  id: true,
  name: true,
  code: true,
  status: true,
  createdAt: true,
  createdBy: { select: { email: true } },
  pendingMatchUniversity: { select: { id: true, name: true } },
  _count: { select: { educations: true } },
} satisfies Prisma.UniversitySelect;

type AdminRow = Prisma.UniversityGetPayload<{ select: typeof adminSelect }>;

function toAdminRow(row: AdminRow): AdminEducationCatalogRow {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    status: row.status,
    createdByEmail: row.createdBy?.email ?? null,
    pendingMatch: row.pendingMatchUniversity,
    usageCount: row._count.educations,
    createdAt: row.createdAt,
  };
}

/** Cấu trúc y hệt major.repository.ts — khác model Prisma nên tách hai class. */
export class UniversityRepository implements EducationCatalogRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  findById(id: string): Promise<CatalogEntryRow | null> {
    return this.prisma.university.findUnique({ where: { id }, select: entrySelect });
  }

  async findAdminRow(id: string): Promise<AdminEducationCatalogRow | null> {
    const row = await this.prisma.university.findUnique({ where: { id }, select: adminSelect });
    return row ? toAdminRow(row) : null;
  }

  listForMatching(): Promise<CatalogEntryRow[]> {
    return this.prisma.university.findMany({ select: entrySelect });
  }

  async findByAlias(aliasKey: string): Promise<CatalogEntryRow | null> {
    const alias = await this.prisma.universityAlias.findUnique({
      where: { alias: aliasKey },
      select: { university: { select: entrySelect } },
    });
    return alias?.university ?? null;
  }

  findByNameInsensitive(name: string, excludeId?: string): Promise<CatalogEntryRow | null> {
    return this.prisma.university.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: entrySelect,
    });
  }

  createPending(data: { name: string; createdByUserId: string; pendingMatchId: string | null }): Promise<CatalogEntryRow> {
    return this.prisma.university.create({
      data: {
        name: data.name,
        status: "PENDING",
        createdByUserId: data.createdByUserId,
        pendingMatchUniversityId: data.pendingMatchId,
      },
      select: entrySelect,
    });
  }

  async findPendingVerification(limit: number): Promise<PendingCatalogVerification[]> {
    const rows = await this.prisma.university.findMany({
      where: { status: "PENDING", pendingMatchUniversityId: { not: null } },
      select: { id: true, name: true, pendingMatchUniversity: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return rows.flatMap((row) =>
      row.pendingMatchUniversity ? [{ id: row.id, name: row.name, pendingMatch: row.pendingMatchUniversity }] : [],
    );
  }

  async clearPendingMatch(id: string): Promise<void> {
    await this.prisma.university.update({ where: { id }, data: { pendingMatchUniversityId: null } });
  }

  async listForAdmin(
    status: CatalogEntryStatus | undefined,
    cursor: string | undefined,
  ): Promise<{ items: AdminEducationCatalogRow[]; hasMore: boolean; nextCursor?: string }> {
    const rows = await this.prisma.university.findMany({
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
    await this.prisma.university.update({
      where: { id },
      data: { status: "APPROVED", pendingMatchUniversityId: null },
    });
  }

  async renameApprove(id: string, correctedName: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.university.findUnique({ where: { id }, select: { name: true } });
      if (!current) return;

      await tx.university.update({
        where: { id },
        data: { name: correctedName, status: "APPROVED", pendingMatchUniversityId: null },
      });
      // Người khác gõ lại đúng cách viết cũ sẽ khớp ngay ở bậc 0.
      if (normalizeUniversityName(current.name) !== normalizeUniversityName(correctedName)) {
        await this.upsertAlias(current.name, id, "ADMIN_MERGE", tx);
      }
    });
  }

  /**
   * Từ chối = xoá hẳn. Education trỏ vào mục này bị set null (FK ON DELETE SET
   * NULL) — dòng học vấn vẫn còn, chỉ mất tên trường không hợp lệ.
   */
  async reject(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.detachPendingMatchReferences(id, tx);
      await tx.university.delete({ where: { id } });
    });
  }

  /**
   * Gộp `sourceId` (PENDING) vào `targetId`: chuyển Education sang mục đích, ghi
   * tên cũ thành alias (feedback loop — lần sau khớp ngay ở bậc 0), rồi xoá nguồn.
   */
  async merge(sourceId: string, targetId: string, aliasSource: CatalogAliasSource): Promise<void> {
    if (sourceId === targetId) return;

    await this.prisma.$transaction(async (tx) => {
      const source = await tx.university.findUnique({ where: { id: sourceId }, select: { name: true } });
      if (!source) return;

      await tx.education.updateMany({ where: { universityId: sourceId }, data: { universityId: targetId } });
      // Alias cũ của nguồn (nếu có) sẽ bị cascade xoá theo — chuyển sang đích trước.
      await tx.universityAlias.updateMany({ where: { universityId: sourceId }, data: { universityId: targetId } });
      await this.upsertAlias(source.name, targetId, aliasSource, tx);
      await this.detachPendingMatchReferences(sourceId, tx);
      await tx.university.delete({ where: { id: sourceId } });
    });
  }

  private async upsertAlias(name: string, universityId: string, source: CatalogAliasSource, db: Db): Promise<void> {
    const alias = normalizeUniversityName(name);
    if (!alias) return;
    await db.universityAlias.upsert({
      where: { alias },
      update: { universityId, source },
      create: { alias, universityId, source },
    });
  }

  private async detachPendingMatchReferences(id: string, db: Db): Promise<void> {
    await db.university.updateMany({ where: { pendingMatchUniversityId: id }, data: { pendingMatchUniversityId: null } });
  }
}
