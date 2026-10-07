import { Prisma, type AuditLog, type PrismaClient, type Role } from "@prisma/client";
import type { AuditAction, AuditEntityType } from "./audit-log.actions";

type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditLogWriteData {
  actorId: string | null;
  actorRole: Role | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  summary: string;
  metadata?: Prisma.InputJsonValue;
}

export class AuditLogRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  create(data: AuditLogWriteData, db: Db = this.prisma): Promise<AuditLog> {
    return db.auditLog.create({ data });
  }

  /**
   * Mới nhất trước, phân trang cursor theo id (cùng khuôn NotificationsRepository.listForUser).
   * `actorRole` có giá trị thì chỉ lấy dòng của vai trò đó.
   */
  async listLatest(options: { cursor?: string | undefined; limit: number; actorRole?: Role | undefined }): Promise<{
    items: AuditLog[];
    nextCursor?: string;
    hasMore: boolean;
  }> {
    const rows = await this.prisma.auditLog.findMany({
      ...(options.actorRole ? { where: { actorRole: options.actorRole } } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: options.limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > options.limit;
    const items = hasMore ? rows.slice(0, options.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    return { items, hasMore, ...(nextCursor ? { nextCursor } : {}) };
  }

  /**
   * Dòng mới nhất của `action` cho từng entity, trong một truy vấn (AD-17: lý do,
   * người khoá, thời điểm khoá trên danh sách người dùng). Entity chưa có dòng
   * nào thì không có trong Map.
   */
  async findLatestByEntities(
    entityType: AuditEntityType,
    entityIds: string[],
    action: AuditAction,
  ): Promise<Map<string, AuditLog>> {
    if (entityIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<AuditLog[]>`
      SELECT DISTINCT ON ("entityId") *
      FROM audit_logs
      WHERE "entityType" = ${entityType}
        AND "action" = ${action}
        AND "entityId" IN (${Prisma.join(entityIds)})
      ORDER BY "entityId", "createdAt" DESC
    `;
    return new Map(rows.map((row) => [row.entityId, row]));
  }
}
