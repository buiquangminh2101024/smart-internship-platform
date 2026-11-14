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
 * Điểm của các tin này vừa đổi số "Phù hợp" (0.6, AD-27 mục 6, Q5): giao diện nhà tuyển dụng
 * làm mới số liệu đang hiển thị. Không gắn với bản ghi Notification nào.
 */
export interface MatchScoresUpdatedPayload {
  jobPostIds: string[];
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
  /** Event `match-scores:updated` — số "Phù hợp" của các tin đã đổi (0.6, Q5). */
  pushMatchUpdate(userId: string, payload: MatchScoresUpdatedPayload): Promise<void> | void;
  /** Ngắt mọi socket đang mở của user — gọi sau khi Admin khoá tài khoản (AD-17). */
  disconnectUser(userId: string): Promise<void> | void;
}
