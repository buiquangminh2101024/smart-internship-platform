import type { Logger } from "../shared/logger";
import type {
  ConversationUnavailablePayload,
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
}
