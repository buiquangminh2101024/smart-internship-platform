import type { NotificationType, Prisma, PrismaClient } from "@prisma/client";
import type { Notification as NotificationDto, PaginatedResponse, UnreadCountResponse } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import type { RealtimeNotifier } from "../../shared/ports/RealtimeNotifier";
import { toNotificationDto } from "./notification.mapper";
import {
  OUTBOX_AGGREGATE_NOTIFICATION,
  OUTBOX_EVENT_NOTIFICATION_EMAIL,
  type NotificationEmailPayload,
  type NotificationPayloadMap,
} from "./notification.types";
import type { NotificationsRepository } from "./notifications.repository";
import type { OutboxRepository } from "./outbox/outbox.repository";
import { renderNotification } from "./templates/notification-templates";

interface NotificationsConfig {
  CORS_ORIGIN: string;
}

export class NotificationsService {
  private readonly prisma: PrismaClient;
  private readonly notificationsRepository: NotificationsRepository;
  private readonly outboxRepository: OutboxRepository;
  private readonly realtimeNotifier: RealtimeNotifier;
  private readonly logger: Logger;
  private readonly webBaseUrl: string;

  constructor({
    prisma,
    notificationsRepository,
    outboxRepository,
    realtimeNotifier,
    logger,
    config,
  }: {
    prisma: PrismaClient;
    notificationsRepository: NotificationsRepository;
    outboxRepository: OutboxRepository;
    realtimeNotifier: RealtimeNotifier;
    logger: Logger;
    config: NotificationsConfig;
  }) {
    this.prisma = prisma;
    this.notificationsRepository = notificationsRepository;
    this.outboxRepository = outboxRepository;
    this.realtimeNotifier = realtimeNotifier;
    this.logger = logger;
    // CORS_ORIGIN chính là origin của web app (xem shared/config/env.ts) — dùng
    // luôn thay vì thêm một biến môi trường trùng nghĩa.
    this.webBaseUrl = config.CORS_ORIGIN;
  }

  // ─── Ghi (dùng bởi các module nghiệp vụ) ─────────────────────────────────

  /**
   * Tạo notification in-app + xếp email vào outbox, trong cùng transaction với
   * thay đổi nghiệp vụ nếu caller truyền `tx` — hoặc không có gì được ghi cả
   * (AD-8). Cố ý KHÔNG nuốt lỗi ghi DB: notification mất im lặng còn tệ hơn là
   * để cả thao tác nghiệp vụ rollback và client thử lại.
   */
  async notify<T extends NotificationType>(
    type: T,
    recipientUserId: string,
    data: NotificationPayloadMap[T],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;

    const recipient = await db.user.findUnique({ where: { id: recipientUserId }, select: { email: true } });
    if (!recipient) {
      this.logger.warn("Bỏ qua notification: không tìm thấy người nhận", { recipientUserId, type });
      return;
    }

    const rendered = renderNotification(type, data, { webBaseUrl: this.webBaseUrl });

    const notification = await this.notificationsRepository.create(
      { userId: recipientUserId, type, title: rendered.title, body: rendered.body, link: rendered.link },
      db,
    );

    if (rendered.email) {
      const payload: NotificationEmailPayload = {
        to: recipient.email,
        subject: rendered.email.subject,
        html: rendered.email.html,
        notificationType: type,
      };
      await this.outboxRepository.create(
        {
          eventType: OUTBOX_EVENT_NOTIFICATION_EMAIL,
          aggregateType: OUTBOX_AGGREGATE_NOTIFICATION,
          aggregateId: notification.id,
          payload: { ...payload },
        },
        db,
      );
    }

    // Fire-and-forget, cố ý nằm ngoài đảm bảo của transaction: nếu tx rollback
    // thì client có thể đã nhận một push thừa. Chấp nhận được vì push chỉ là gợi
    // ý "có cái mới, gọi lại API" — nguồn sự thật vẫn là bảng notifications.
    await this.realtimeNotifier.pushToUser(recipientUserId, {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      link: notification.link,
      createdAt: notification.createdAt,
    });
  }

  /** Gửi cùng một notification tới nhiều người (vd. mọi employer của một company). */
  async notifyMany<T extends NotificationType>(
    type: T,
    recipientUserIds: string[],
    data: NotificationPayloadMap[T],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    for (const userId of recipientUserIds) {
      await this.notify(type, userId, data, tx);
    }
  }

  // ─── Đọc (API cho mọi actor) ─────────────────────────────────────────────

  async list(
    userId: string,
    query: { unreadOnly?: boolean | undefined; cursor?: string | undefined },
  ): Promise<PaginatedResponse<NotificationDto>> {
    const page = await this.notificationsRepository.listForUser(userId, {
      unreadOnly: query.unreadOnly ?? false,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    return {
      items: page.items.map(toNotificationDto),
      hasMore: page.hasMore,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  }

  async unreadCount(userId: string): Promise<UnreadCountResponse> {
    return { count: await this.notificationsRepository.countUnread(userId) };
  }

  async markRead(userId: string, id: string): Promise<NotificationDto> {
    const updated = await this.notificationsRepository.markRead(id, userId);
    if (updated === 0) {
      // 0 dòng: hoặc không thuộc user (→ 404), hoặc đã đọc rồi (→ idempotent, trả về nguyên trạng).
      const existing = await this.notificationsRepository.exists(id, userId);
      if (!existing) throw new AppError(404, "Notification not found");
      return toNotificationDto(existing);
    }

    const notification = await this.notificationsRepository.exists(id, userId);
    if (!notification) throw new AppError(404, "Notification not found");
    return toNotificationDto(notification);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    return { updated: await this.notificationsRepository.markAllRead(userId) };
  }
}
