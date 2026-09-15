import type { Logger } from "../shared/logger";
import type { RealtimeNotificationPayload, RealtimeNotifier } from "../shared/ports/RealtimeNotifier";

/**
 * Bản cài đặt tạm của RealtimeNotifier cho Phase 10: không đẩy gì cả, frontend
 * lấy notification bằng polling (GET /notifications/unread-count).
 *
 * TODO(Phase 9): thay bằng SocketIoRealtimeNotifier (emit tới room theo userId)
 * và đổi registration `realtimeNotifier` trong container.ts. Không sửa
 * NotificationsService — nó chỉ phụ thuộc interface này.
 */
export class NoopRealtimeNotifier implements RealtimeNotifier {
  private readonly logger: Logger;

  constructor({ logger }: { logger: Logger }) {
    this.logger = logger;
  }

  pushToUser(userId: string, payload: RealtimeNotificationPayload): void {
    this.logger.info("Realtime push skipped (Socket.IO chưa sẵn sàng — Phase 9)", {
      userId,
      notificationId: payload.id,
      type: payload.type,
    });
  }
}
