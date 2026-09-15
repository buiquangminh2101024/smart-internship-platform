import type { NotificationType } from "@prisma/client";

/**
 * Dữ liệu đầu vào để render template cho từng loại notification. Giữ ở
 * server-local (không đưa vào packages/shared-types) vì đây là write-shape nội
 * bộ, frontend không bao giờ nhìn thấy — nó chỉ nhận title/body/link đã render.
 */
export interface NotificationPayloadMap {
  APPLICATION_STATUS_CHANGED: {
    applicationId: string;
    jobPostId: string;
    jobPostTitle: string;
    companyName: string;
    oldStatus: string;
    newStatus: string;
  };
  JOB_POST_APPROVED: { jobPostId: string; jobPostTitle: string };
  JOB_POST_REJECTED: { jobPostId: string; jobPostTitle: string; reason?: string };
  JOB_POST_TAKEN_DOWN: { jobPostId: string; jobPostTitle: string; reason?: string };
  COMPANY_VERIFIED: { companyId: string; companyName: string };
  COMPANY_REJECTED: { companyId: string; companyName: string; reason?: string };
  MESSAGE_RECEIVED: { conversationId: string; senderName: string; preview: string };
}

// Khoá của map phải trùng khít enum Prisma: thêm giá trị vào enum mà quên khai
// báo payload (hoặc ngược lại) sẽ lỗi biên dịch ngay tại đây thay vì lúc chạy.
type AssertSameKeys =
  Exclude<NotificationType, keyof NotificationPayloadMap> extends never
    ? Exclude<keyof NotificationPayloadMap, NotificationType> extends never
      ? true
      : never
    : never;
const _assertSameKeys: AssertSameKeys = true;
void _assertSameKeys;

export interface RenderedEmail {
  subject: string;
  html: string;
}

export interface RenderedNotification {
  title: string;
  body: string | null;
  link: string | null;
  /** null = loại này cố ý không gửi email (chỉ hiển thị in-app). */
  email: RenderedEmail | null;
}

/** Payload ghi vào OutboxEvent.payload cho eventType = "NOTIFICATION_EMAIL". */
export interface NotificationEmailPayload {
  to: string;
  subject: string;
  html: string;
  notificationType: NotificationType;
}

export const OUTBOX_EVENT_NOTIFICATION_EMAIL = "NOTIFICATION_EMAIL";
export const OUTBOX_AGGREGATE_NOTIFICATION = "Notification";
