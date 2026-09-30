import type {
  Notification,
  NotificationGroup,
  NotificationType,
  PaginatedResponse,
  UnreadCountByGroupResponse,
  UnreadCountResponse,
} from "@sip/shared-types";
import { apiFetch } from "./api-client";
import type { AuthArea } from "./auth-area";

/** Nơi đặt trang danh sách thông báo của từng khu vực (mỗi shell có layout riêng). */
export const NOTIFICATIONS_HREF: Record<AuthArea, string> = {
  candidate: "/notifications",
  employer: "/employer/notifications",
  admin: "/admin/notifications",
};

export function fetchUnreadCount(area: AuthArea): Promise<UnreadCountResponse> {
  return apiFetch<UnreadCountResponse>(area, "/notifications/unread-count");
}

export function fetchUnreadCountByGroup(area: AuthArea): Promise<UnreadCountByGroupResponse> {
  return apiFetch<UnreadCountByGroupResponse>(area, "/notifications/unread-count/by-group");
}

export function fetchNotifications(
  area: AuthArea,
  options: { unreadOnly?: boolean; cursor?: string; group?: NotificationGroup } = {},
): Promise<PaginatedResponse<Notification>> {
  const params = new URLSearchParams();
  if (options.unreadOnly) params.set("unreadOnly", "true");
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.group) params.set("group", options.group);
  const query = params.toString();
  return apiFetch<PaginatedResponse<Notification>>(area, `/notifications${query ? `?${query}` : ""}`);
}

export function markNotificationRead(area: AuthArea, id: string): Promise<Notification> {
  return apiFetch<Notification>(area, `/notifications/${id}/read`, { method: "PATCH" });
}

export function markAllNotificationsRead(area: AuthArea): Promise<{ updated: number }> {
  return apiFetch<{ updated: number }>(area, "/notifications/read-all", { method: "PATCH" });
}

// ─── Trung tâm thông báo (AD-16) ─────────────────────────────────────────
// Ánh xạ loại → nhóm giống `apps/server/src/modules/notifications/notification-groups.ts`
// (API không trả nhóm trong từng thông báo). Record<NotificationType, ...> ép
// khai báo nhóm cho loại mới, như phía server.
export const NOTIFICATION_GROUP_BY_TYPE: Record<NotificationType, NotificationGroup> = {
  APPLICATION_STATUS_CHANGED: "APPLICATIONS",
  APPLICATION_RECEIVED: "APPLICATIONS",
  JOB_POST_APPROVED: "JOB_POSTS",
  JOB_POST_REJECTED: "JOB_POSTS",
  JOB_POST_TAKEN_DOWN: "JOB_POSTS",
  JOB_POST_EXPIRING: "JOB_POSTS",
  JOB_POST_SUBMITTED: "JOB_POSTS",
  COMPANY_VERIFIED: "COMPANY",
  COMPANY_REJECTED: "COMPANY",
  COMPANY_LINK_REQUESTED: "COMPANY",
  CANDIDATE_OUTREACH_INVITATION_RECEIVED: "INVITATIONS",
  CANDIDATE_OUTREACH_INVITATION_RESPONDED: "INVITATIONS",
  SUBSCRIPTION_EXPIRING: "SUBSCRIPTION",
  CATALOG_ENTRY_SUGGESTED: "CATALOG",
  PAYMENT_COMPLETED: "PAYMENTS",
  INTERVIEW_SCHEDULED: "INTERVIEWS",
  INTERVIEW_RESCHEDULED: "INTERVIEWS",
  INTERVIEW_CANCELLED: "INTERVIEWS",
  INTERVIEW_REMINDER: "INTERVIEWS",
};

export const NOTIFICATION_GROUP_META: Record<NotificationGroup, { label: string; icon: string }> = {
  APPLICATIONS: { label: "Hồ sơ", icon: "inbox" },
  JOB_POSTS: { label: "Tin tuyển dụng", icon: "clipboard-check" },
  COMPANY: { label: "Công ty", icon: "building-2" },
  INVITATIONS: { label: "Lời mời", icon: "send" },
  INTERVIEWS: { label: "Lịch phỏng vấn", icon: "calendar" },
  SUBSCRIPTION: { label: "Gói dịch vụ", icon: "credit-card" },
  CATALOG: { label: "Danh mục", icon: "tag" },
  PAYMENTS: { label: "Thanh toán", icon: "wallet" },
};

/**
 * Nhãn nút hành động theo loại (API không trả nhãn). Nút dẫn tới `link` server
 * đã render, nên nhãn phải khớp nơi link trỏ tới.
 */
export const NOTIFICATION_ACTION_LABEL: Record<NotificationType, string> = {
  APPLICATION_STATUS_CHANGED: "Xem hồ sơ ứng tuyển",
  APPLICATION_RECEIVED: "Xem hồ sơ",
  JOB_POST_APPROVED: "Xem tin",
  JOB_POST_REJECTED: "Sửa tin",
  JOB_POST_TAKEN_DOWN: "Xem chi tiết",
  JOB_POST_EXPIRING: "Xem tin",
  JOB_POST_SUBMITTED: "Duyệt tin",
  COMPANY_VERIFIED: "Xem hồ sơ công ty",
  COMPANY_REJECTED: "Xem hồ sơ công ty",
  COMPANY_LINK_REQUESTED: "Xác minh",
  CANDIDATE_OUTREACH_INVITATION_RECEIVED: "Xem lời mời",
  CANDIDATE_OUTREACH_INVITATION_RESPONDED: "Xem ứng viên",
  SUBSCRIPTION_EXPIRING: "Xem gói dịch vụ",
  CATALOG_ENTRY_SUGGESTED: "Duyệt",
  // Chưa có trang giao dịch — link trỏ về trang công ty đã thanh toán (D14).
  PAYMENT_COMPLETED: "Xem công ty",
  INTERVIEW_SCHEDULED: "Xem lịch phỏng vấn",
  INTERVIEW_RESCHEDULED: "Xem lịch phỏng vấn",
  INTERVIEW_CANCELLED: "Xem hồ sơ ứng tuyển",
  INTERVIEW_REMINDER: "Xem lịch phỏng vấn",
};

/** Loại cảnh báo (bị từ chối, bị gỡ, sắp hết hạn): tô marigold thay màu khu vực. */
export const WARNING_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  "JOB_POST_REJECTED",
  "JOB_POST_TAKEN_DOWN",
  "JOB_POST_EXPIRING",
  "COMPANY_REJECTED",
  "SUBSCRIPTION_EXPIRING",
]);

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}
