import type { Server as SocketIOServer } from "socket.io";
import type { Logger } from "../shared/logger";
import type {
  ConversationUnavailablePayload,
  RealtimeMessagePayload,
  RealtimeNotificationPayload,
  RealtimeNotifier,
} from "../shared/ports/RealtimeNotifier";

export const REALTIME_EVENT_NOTIFICATION = "notification:new";
export const REALTIME_EVENT_NEW_MESSAGE = "notification:new_message";
export const REALTIME_EVENT_CONVERSATION_UNAVAILABLE = "conversation:unavailable";

/**
 * Đẩy thông báo tới room `user:${userId}` mà socket gateway đã join sẵn lúc
 * kết nối (infrastructure/socket/index.ts). Lỗi emit chỉ log — push realtime là
 * best-effort, không được làm hỏng luồng nghiệp vụ đã ghi DB xong.
 */
export class SocketIoRealtimeNotifier implements RealtimeNotifier {
  private readonly io: SocketIOServer;
  private readonly logger: Logger;

  constructor({ socketIoServer, logger }: { socketIoServer: SocketIOServer; logger: Logger }) {
    this.io = socketIoServer;
    this.logger = logger;
  }

  pushToUser(userId: string, payload: RealtimeNotificationPayload): void {
    this.emit(userId, REALTIME_EVENT_NOTIFICATION, payload);
  }

  pushMessageToUser(userId: string, payload: RealtimeMessagePayload): void {
    this.emit(userId, REALTIME_EVENT_NEW_MESSAGE, payload);
  }

  notifyConversationUnavailable(userId: string, payload: ConversationUnavailablePayload): void {
    this.emit(userId, REALTIME_EVENT_CONVERSATION_UNAVAILABLE, payload);
  }

  private emit(userId: string, event: string, payload: unknown): void {
    try {
      this.io.to(`user:${userId}`).emit(event, payload);
    } catch (error) {
      this.logger.error("Realtime push thất bại", { userId, event, error });
    }
  }
}
