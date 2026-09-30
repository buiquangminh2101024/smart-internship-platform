import type { Notification, NotificationType, Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

const PAGE_SIZE = 20;

export interface NotificationWriteData {
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  /** AD-16 — khoá chống lặp cho thông báo do cron tạo; null với thông báo thường. */
  dedupeKey?: string | null;
}

export class NotificationsRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  create(data: NotificationWriteData, db: Db = this.prisma): Promise<Notification> {
    return db.notification.create({ data });
  }

  async existsByDedupeKey(dedupeKey: string): Promise<boolean> {
    const row = await this.prisma.notification.findUnique({ where: { dedupeKey }, select: { id: true } });
    return row !== null;
  }

  async listForUser(
    userId: string,
    options: { unreadOnly: boolean; cursor?: string; types?: NotificationType[] },
  ): Promise<{ items: Notification[]; nextCursor?: string; hasMore: boolean }> {
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(options.unreadOnly ? { isRead: false } : {}),
        ...(options.types ? { type: { in: options.types } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > PAGE_SIZE;
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    return { items, hasMore, ...(nextCursor ? { nextCursor } : {}) };
  }

  countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  /** Số chưa đọc theo từng loại — một truy vấn, dùng index (userId, type, isRead). */
  async countUnreadByType(userId: string): Promise<Array<{ type: NotificationType; count: number }>> {
    const rows = await this.prisma.notification.groupBy({
      by: ["type"],
      where: { userId, isRead: false },
      _count: { _all: true },
    });
    return rows.map((row) => ({ type: row.type, count: row._count._all }));
  }

  /**
   * Scope theo userId ngay trong mệnh đề where (updateMany thay vì update) —
   * user không thể đánh dấu đã đọc notification của người khác, và count = 0
   * cho biết id không tồn tại HOẶC không thuộc user để controller trả 404.
   */
  async markRead(id: string, userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return result.count;
  }

  exists(id: string, userId: string): Promise<Notification | null> {
    return this.prisma.notification.findFirst({ where: { id, userId } });
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return result.count;
  }
}
