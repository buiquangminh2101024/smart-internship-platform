import { Prisma, type NotificationType, type PrismaClient, type Role } from "@prisma/client";
import type {
  Notification as NotificationDto,
  NotificationGroup,
  PaginatedResponse,
  UnreadCountByGroupResponse,
  UnreadCountResponse,
} from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import type { RealtimeNotifier } from "../../shared/ports/RealtimeNotifier";
import { NOTIFICATION_GROUP_BY_TYPE, NOTIFICATION_GROUPS_BY_ROLE, typesInGroup } from "./notification-groups";
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
    dedupeKey?: string,
  ): Promise<void> {
    const db = tx ?? this.prisma;

    const recipient = await db.user.findUnique({ where: { id: recipientUserId }, select: { email: true } });
    if (!recipient) {
      this.logger.warn("Bỏ qua notification: không tìm thấy người nhận", { recipientUserId, type });
      return;
    }

    const rendered = renderNotification(type, data, { webBaseUrl: this.webBaseUrl });

    const notification = await this.notificationsRepository.create(
      {
        userId: recipientUserId,
        type,
        title: rendered.title,
        body: rendered.body,
        link: rendered.link,
        dedupeKey: dedupeKey ?? null,
      },
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

  /**
   * Cho cron quét định kỳ (AD-16): mỗi `dedupeKey` chỉ sinh một thông báo dù job
   * chạy lại bao nhiêu lần. Tự mở transaction riêng cho từng người nhận (thông
   * báo + outbox email) để một bản ghi trùng không làm hỏng cả lượt quét: vi
   * phạm unique huỷ transaction của Postgres, nên không thể bắt lỗi rồi đi tiếp
   * trong cùng transaction. Trả về true nếu đã tạo mới.
   */
  async notifyOnce<T extends NotificationType>(
    type: T,
    recipientUserId: string,
    data: NotificationPayloadMap[T],
    dedupeKey: string,
  ): Promise<boolean> {
    // Kiểm tra trước để đường thường (đã báo rồi) không phải đi qua lỗi DB.
    if (await this.notificationsRepository.existsByDedupeKey(dedupeKey)) return false;
    try {
      await this.prisma.$transaction((tx) => this.notify(type, recipientUserId, data, tx, dedupeKey));
      return true;
    } catch (error) {
      // Hai tiến trình cùng tạo một khoá: bên chậm hơn vấp unique → coi như đã báo.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
  }

  // ─── Đọc (API cho mọi actor) ─────────────────────────────────────────────

  async list(
    userId: string,
    query: { unreadOnly?: boolean | undefined; cursor?: string | undefined; group?: NotificationGroup | undefined },
  ): Promise<PaginatedResponse<NotificationDto>> {
    const page = await this.notificationsRepository.listForUser(userId, {
      unreadOnly: query.unreadOnly ?? false,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.group ? { types: typesInGroup(query.group) } : {}),
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

  /**
   * `total` đếm mọi loại chưa đọc (khớp chuông / unread-count); `groups` chỉ gồm
   * nhóm của vai trò, nhóm không có gì = 0 để giao diện hiện đủ tab.
   */
  async unreadCountByGroup(userId: string, role: Role): Promise<UnreadCountByGroupResponse> {
    const rows = await this.notificationsRepository.countUnreadByType(userId);
    const groups: Partial<Record<NotificationGroup, number>> = {};
    for (const group of NOTIFICATION_GROUPS_BY_ROLE[role]) groups[group] = 0;

    let total = 0;
    for (const { type, count } of rows) {
      total += count;
      const group = NOTIFICATION_GROUP_BY_TYPE[type];
      if (group in groups) groups[group] = (groups[group] ?? 0) + count;
    }
    return { total, groups };
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
