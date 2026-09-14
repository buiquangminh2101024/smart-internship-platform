import type { Notification, PaginatedResponse, UnreadCountResponse } from "@sip/shared-types";
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

export function fetchNotifications(
  area: AuthArea,
  options: { unreadOnly?: boolean; cursor?: string } = {},
): Promise<PaginatedResponse<Notification>> {
  const params = new URLSearchParams();
  if (options.unreadOnly) params.set("unreadOnly", "true");
  if (options.cursor) params.set("cursor", options.cursor);
  const query = params.toString();
  return apiFetch<PaginatedResponse<Notification>>(area, `/notifications${query ? `?${query}` : ""}`);
}

export function markNotificationRead(area: AuthArea, id: string): Promise<Notification> {
  return apiFetch<Notification>(area, `/notifications/${id}/read`, { method: "PATCH" });
}

export function markAllNotificationsRead(area: AuthArea): Promise<{ updated: number }> {
  return apiFetch<{ updated: number }>(area, "/notifications/read-all", { method: "PATCH" });
}

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
