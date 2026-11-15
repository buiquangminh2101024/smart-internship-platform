import type { Logger } from "../shared/logger";
import type {
  ConversationUnavailablePayload,
  MatchScoresUpdatedPayload,
  RealtimeMessagePayload,
  RealtimeNotificationPayload,
  RealtimeNotifier,
} from "../shared/ports/RealtimeNotifier";

/**
 * Fallback của RealtimeNotifier khi Socket.IO khởi tạo thất bại (xem main.ts):
 * không đẩy gì cả, frontend vẫn lấy notification bằng REST (polling dự phòng).
 */
export class NoopRealtimeNotifier implements RealtimeNotifier {
  private readonly logger: Logger;

  constructor({ logger }: { logger: Logger }) {
    this.logger = logger;
  }

  pushToUser(userId: string, payload: RealtimeNotificationPayload): void {
    this.logger.info("Realtime push skipped (Socket.IO không khả dụng)", {
      userId,
      notificationId: payload.id,
      type: payload.type,
    });
  }

  pushMessageToUser(userId: string, payload: RealtimeMessagePayload): void {
    this.logger.info("Realtime message push skipped (Socket.IO không khả dụng)", {
      userId,
      conversationId: payload.conversationId,
    });
  }

  notifyConversationUnavailable(userId: string, payload: ConversationUnavailablePayload): void {
    this.logger.info("Realtime conversation:unavailable skipped (Socket.IO không khả dụng)", {
      userId,
      conversationId: payload.conversationId,
    });
  }

  /** Không ghi log: mỗi lượt chấm có thể gửi cho nhiều employer; giao diện tự tải lại khi quay lại tab. */
  pushMatchUpdate(_userId: string, _payload: MatchScoresUpdatedPayload): void {}

  disconnectUser(userId: string): void {
    this.logger.info("Realtime disconnect skipped (Socket.IO không khả dụng)", { userId });
  }
}
