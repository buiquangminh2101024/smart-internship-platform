import { Prisma, type AuditLog, type PrismaClient, type Role } from "@prisma/client";
import type { AuditActivityGroup, AuditActorRoleFilter } from "@sip/shared-types";
import type { AuditAction, AuditEntityType } from "./audit-log.actions";
import { utcSql } from "./audit-log.where";

type Db = PrismaClient | Prisma.TransactionClient;

// Bảng lưu trữ có thêm `archivedAt`; đọc ra đúng hình dạng của AuditLog.
const AUDIT_LOG_SELECT = {
  id: true,
  actorId: true,
  actorRole: true,
  action: true,
  entityType: true,
  entityId: true,
  summary: true,
  metadata: true,
  createdAt: true,
} satisfies Prisma.AuditLogArchiveSelect;

export type StatSourceRow = Pick<AuditLog, "createdAt" | "action" | "entityType" | "actorRole" | "actorId">;

export interface HourlyActionRow {
  bucketStart: Date;
  action: string;
  entityType: string;
  actorRole: Role | null;
  actorId: string | null;
  count: number;
}

/** Một dòng của `audit_log_hourly_stats` (không kể id). */
export interface StatBucket {
  bucketStart: Date;
  actionGroup: AuditActivityGroup;
  actorKind: AuditActorRoleFilter;
  actorId: string | null;
  count: number;
}

// Cộng 7 giờ trên cột UTC ra giờ Việt Nam (không đổi giờ theo mùa).
const STAT_KEYS = {
  day: Prisma.sql`to_char("bucketStart" + interval '7 hours', 'YYYY-MM-DD')`,
  dow: Prisma.sql`EXTRACT(ISODOW FROM "bucketStart" + interval '7 hours')::int`,
  hour: Prisma.sql`EXTRACT(HOUR FROM "bucketStart" + interval '7 hours')::int`,
  group: Prisma.sql`"actionGroup"`,
  role: Prisma.sql`"actorKind"`,
  actorId: Prisma.sql`"actorId"`,
};

export type StatKey = keyof typeof STAT_KEYS;

interface StatKeyType {
  day: string;
  dow: number;
  hour: number;
  group: AuditActivityGroup;
  role: AuditActorRoleFilter;
  actorId: string | null;
}

export type StatSum<K extends StatKey> = { [P in K]: StatKeyType[P] } & { count: number };

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
   * Một trang nhật ký (L7, L12, L23): mới nhất trước (hoặc cũ nhất trước với
   * `order=asc`), phân trang cursor theo id (cùng khuôn NotificationsRepository.listForUser).
   * `archived` đọc bảng lưu trữ, cùng cột và cùng bộ lọc.
   */
  async list(
    where: Prisma.AuditLogWhereInput,
    options: { cursor?: string | undefined; limit: number; order: "asc" | "desc"; archived: boolean },
  ): Promise<{ items: AuditLog[]; nextCursor?: string; hasMore: boolean }> {
    const rows = await this.findMany(where, {
      archived: options.archived,
      order: options.order,
      take: options.limit + 1,
      cursor: options.cursor,
    });
    const hasMore = rows.length > options.limit;
    const items = hasMore ? rows.slice(0, options.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    return { items, hasMore, ...(nextCursor ? { nextCursor } : {}) };
  }

  /** Cho xuất CSV (L13): tối đa `take` dòng, không cursor. */
  listForExport(
    where: Prisma.AuditLogWhereInput,
    options: { order: "asc" | "desc"; archived: boolean; take: number },
  ): Promise<AuditLog[]> {
    return this.findMany(where, options);
  }

  count(where: Prisma.AuditLogWhereInput, archived = false): Promise<number> {
    return archived
      ? this.prisma.auditLogArchive.count({ where: where as Prisma.AuditLogArchiveWhereInput })
      : this.prisma.auditLog.count({ where });
  }

  /** L35 — một dòng theo id; `archived` đọc bảng lưu trữ. */
  findById(id: string, archived = false): Promise<AuditLog | null> {
    return archived
      ? this.prisma.auditLogArchive.findUnique({ where: { id }, select: AUDIT_LOG_SELECT })
      : this.prisma.auditLog.findUnique({ where: { id } });
  }

  private findMany(
    where: Prisma.AuditLogWhereInput,
    options: { archived: boolean; order: "asc" | "desc"; take: number; cursor?: string | undefined },
  ): Promise<AuditLog[]> {
    const args = {
      orderBy: [{ createdAt: options.order }, { id: options.order }],
      take: options.take,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    };
    return options.archived
      ? this.prisma.auditLogArchive.findMany({
          ...args,
          where: where as Prisma.AuditLogArchiveWhereInput,
          select: AUDIT_LOG_SELECT,
        })
      : this.prisma.auditLog.findMany({ ...args, where });
  }

  /**
   * Các cột đủ để gộp số (L18): phần chưa gộp, hoặc cả khoảng khi lọc theo `action`.
   * `archived` đọc bảng lưu trữ, cho phần khoảng ngày lấn qua mốc lưu trữ (Q11).
   */
  findStatRows(where: Prisma.AuditLogWhereInput, archived = false): Promise<StatSourceRow[]> {
    const select = { createdAt: true, action: true, entityType: true, actorRole: true, actorId: true } as const;
    return archived
      ? this.prisma.auditLogArchive.findMany({ where: where as Prisma.AuditLogArchiveWhereInput, select })
      : this.prisma.auditLog.findMany({ where, select });
  }

  /** Số dòng theo `action` (L32: dòng chảy tin); `archived` đọc bảng lưu trữ. */
  async countByAction(where: Prisma.AuditLogWhereInput, archived = false): Promise<Map<string, number>> {
    const rows = archived
      ? await this.prisma.auditLogArchive.groupBy({
          by: ["action"],
          where: where as Prisma.AuditLogArchiveWhereInput,
          _count: { _all: true },
        })
      : await this.prisma.auditLog.groupBy({ by: ["action"], where, _count: { _all: true } });
    return new Map(rows.map((row) => [row.action, row._count._all]));
  }

  /**
   * `createdAt` của dòng mới nhất trong bảng lưu trữ; null khi chưa chuyển dòng nào.
   * Dòng được chuyển theo thứ tự cũ nhất trước, nên dòng mới hơn mốc này chỉ có ở bảng chính.
   */
  async findLatestArchivedAt(): Promise<Date | null> {
    const result = await this.prisma.auditLogArchive.aggregate({ _max: { createdAt: true } });
    return result._max.createdAt;
  }

  // ─── Bảng thống kê theo giờ (AD-20, L16–L19) ───────────────────────────

  /** Giờ mới nhất đã gộp; null khi bảng còn rỗng. */
  async findLatestStatBucket(): Promise<Date | null> {
    const result = await this.prisma.auditLogHourlyStat.aggregate({ _max: { bucketStart: true } });
    return result._max.bucketStart;
  }

  /** Thời điểm của dòng nhật ký đầu tiên từ `gte` trở đi (không có `gte` ⇒ dòng cũ nhất). */
  async findFirstCreatedAt(gte?: Date): Promise<Date | null> {
    const row = await this.prisma.auditLog.findFirst({
      ...(gte ? { where: { createdAt: { gte } } } : {}),
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    return row?.createdAt ?? null;
  }

  /** Số dòng của [gte, lt) theo giờ (UTC) × action × người làm, để cron gộp thành nhóm. */
  aggregateHours(gte: Date, lt: Date): Promise<HourlyActionRow[]> {
    return this.prisma.$queryRaw<HourlyActionRow[]>`
      SELECT date_trunc('hour', "createdAt") AS "bucketStart",
             "action", "entityType", "actorRole"::text AS "actorRole", "actorId",
             COUNT(*)::int AS "count"
      FROM audit_logs
      WHERE "createdAt" >= ${utcSql(gte)} AND "createdAt" < ${utcSql(lt)}
      GROUP BY 1, 2, 3, 4, 5
    `;
  }

  /**
   * Thay toàn bộ số của các khoảng giờ `ranges` bằng `buckets` trong một
   * transaction (L16: "xoá rồi ghi lại", nên chạy lại cùng giờ ra cùng kết quả).
   */
  async replaceStats(ranges: Array<{ gte: Date; lt: Date }>, buckets: StatBucket[]): Promise<void> {
    if (ranges.length === 0) return;
    await this.prisma.$transaction(
      async (tx) => {
        await tx.auditLogHourlyStat.deleteMany({ where: { OR: ranges.map((range) => ({ bucketStart: range })) } });
        if (buckets.length > 0) await tx.auditLogHourlyStat.createMany({ data: buckets });
      },
      { timeout: 60_000 },
    );
  }

  /**
   * Tổng `count` của bảng thống kê theo các chiều `keys` (ngày, thứ, giờ tính
   * theo giờ Việt Nam). Có `limit` thì lấy các nhóm lớn nhất trước (top người làm).
   */
  sumStats<K extends StatKey>(where: Prisma.Sql, keys: readonly K[], limit?: number): Promise<Array<StatSum<K>>> {
    const columns = keys.map((key) => Prisma.sql`${STAT_KEYS[key]} AS ${Prisma.raw(`"${key}"`)}`);
    const groupBy = keys.map((_, index) => Prisma.raw(String(index + 1)));
    return this.prisma.$queryRaw<Array<StatSum<K>>>`
      SELECT ${Prisma.join(columns)}, SUM("count")::int AS "count"
      FROM audit_log_hourly_stats
      WHERE ${where}
      GROUP BY ${Prisma.join(groupBy)}
      ${limit === undefined ? Prisma.empty : Prisma.sql`ORDER BY "count" DESC, 1 LIMIT ${limit}`}
    `;
  }

  // ─── Lưu trữ (AD-20, L20–L22) ──────────────────────────────────────────

  /**
   * Chuyển tối đa `batchSize` dòng cũ nhất có `createdAt < cutoff` sang
   * `audit_logs_archive` bằng một câu lệnh (L20): xoá và chép cùng thành công
   * hoặc cùng thất bại. Trả số dòng đã chuyển.
   */
  archiveBatch(cutoff: Date, batchSize: number, archivedAt: Date): Promise<number> {
    return this.prisma.$executeRaw`
      WITH moved AS (
        DELETE FROM audit_logs
        WHERE "id" IN (
          SELECT "id" FROM audit_logs
          WHERE "createdAt" < ${utcSql(cutoff)}
          ORDER BY "createdAt", "id"
          LIMIT ${batchSize}
        )
        RETURNING *
      )
      INSERT INTO audit_logs_archive
        ("id", "actorId", "actorRole", "action", "entityType", "entityId", "summary", "metadata", "createdAt", "archivedAt")
      SELECT "id", "actorId", "actorRole", "action", "entityType", "entityId", "summary", "metadata", "createdAt",
             ${utcSql(archivedAt)}
      FROM moved
    `;
  }

  /** Số dòng sẽ chuyển với mốc `cutoff` (cho `--dry-run`, L22). */
  countOlderThan(cutoff: Date): Promise<number> {
    return this.prisma.auditLog.count({ where: { createdAt: { lt: cutoff } } });
  }

  /**
   * `limit` dòng mới nhất của một entity kèm tổng số (AD-18: lịch sử trên trang chi tiết người dùng).
   * Chỉ đọc bảng chính (L24): lịch sử cũ hơn `AUDIT_RETENTION_DAYS` ngày nằm ở nhật ký đã lưu trữ.
   */
  async listByEntity(
    entityType: AuditEntityType,
    entityId: string,
    limit: number,
  ): Promise<{ items: AuditLog[]; total: number }> {
    const where = { entityType, entityId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  }

  /**
   * Dòng mới nhất của `action` cho từng entity, trong một truy vấn (AD-17: lý do,
   * người khoá, thời điểm khoá trên danh sách người dùng). Entity không có dòng
   * nào trong bảng chính thì tìm thêm trong bảng lưu trữ (L24); không có ở cả
   * hai thì không có trong Map.
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
    const latest = new Map(rows.map((row) => [row.entityId, row]));

    const missing = entityIds.filter((id) => !latest.has(id));
    if (missing.length === 0) return latest;
    const archived = await this.prisma.$queryRaw<AuditLog[]>`
      SELECT DISTINCT ON ("entityId")
             "id", "actorId", "actorRole", "action", "entityType", "entityId", "summary", "metadata", "createdAt"
      FROM audit_logs_archive
      WHERE "entityType" = ${entityType}
        AND "action" = ${action}
        AND "entityId" IN (${Prisma.join(missing)})
      ORDER BY "entityId", "createdAt" DESC
    `;
    for (const row of archived) latest.set(row.entityId, row);
    return latest;
  }
}
