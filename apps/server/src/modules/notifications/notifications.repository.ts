import type { Notification, NotificationType, Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

const PAGE_SIZE = 20;

export interface NotificationWriteData {
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
}

export class NotificationsRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  create(data: NotificationWriteData, db: Db = this.prisma): Promise<Notification> {
    return db.notification.create({ data });
  }

  async listForUser(
    userId: string,
    options: { unreadOnly: boolean; cursor?: string },
  ): Promise<{ items: Notification[]; nextCursor?: string; hasMore: boolean }> {
    const rows = await this.prisma.notification.findMany({
      where: { userId, ...(options.unreadOnly ? { isRead: false } : {}) },
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
