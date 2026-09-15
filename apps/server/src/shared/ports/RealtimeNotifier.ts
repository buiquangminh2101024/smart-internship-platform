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
 * Điểm nối realtime cho notification. Phase 10 chỉ định nghĩa port + bản no-op;
 * bản dùng Socket.IO thuộc Phase 9 (đang làm song song) — khi Phase 9 xong chỉ
 * cần đổi registration trong container.ts, NotificationsService không đổi.
 */
export interface RealtimeNotifier {
  pushToUser(userId: string, payload: RealtimeNotificationPayload): Promise<void> | void;
}
