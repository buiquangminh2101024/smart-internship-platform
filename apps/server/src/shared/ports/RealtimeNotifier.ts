import type { NotificationType } from "@prisma/client";

export interface RealtimeNotificationPayload {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: Date;
}

/**
 * Báo "có tin nhắn mới" — không gắn với bản ghi Notification nào (tin nhắn
 * không ghi vào bảng notifications, nguồn sự thật chưa-đọc là mốc đọc của
 * Conversation — xem docs/06-backend/phase-09-realtime-communication/PLAN.md).
 */
export interface RealtimeMessagePayload {
  conversationId: string;
  senderName: string;
  preview: string;
  createdAt: Date;
}

/** Phía kia vừa xoá hội thoại — người nhận chỉ còn xem lịch sử (AD-11). */
export interface ConversationUnavailablePayload {
  conversationId: string;
}

/**
 * Điểm nối realtime cho notification. Mọi thứ realtime ngoài nội dung chat đi
 * qua port này — bản Socket.IO đăng ký trong main.ts, fallback no-op khi
 * Socket.IO khởi tạo lỗi.
 */
export interface RealtimeNotifier {
  /** Event `notification:new` — các NotificationType nghiệp vụ (Phase 10). */
  pushToUser(userId: string, payload: RealtimeNotificationPayload): Promise<void> | void;
  /** Event `notification:new_message` — chỉ dành cho tin nhắn. */
  pushMessageToUser(userId: string, payload: RealtimeMessagePayload): Promise<void> | void;
  /** Event `conversation:unavailable` — khoá gửi tin ở phía chưa xoá. */
  notifyConversationUnavailable(userId: string, payload: ConversationUnavailablePayload): Promise<void> | void;
}
