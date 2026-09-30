"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationGroup } from "@sip/shared-types";
import type { AuthArea } from "@/lib/auth-area";
import {
  fetchNotifications,
  fetchUnreadCountByGroup,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";

/** Tab của trung tâm thông báo; `ALL` không phải nhóm của API mà là "không lọc". */
export type NotificationCenterTab = "ALL" | NotificationGroup;

/** Thứ tự tab theo khu vực — khớp `NOTIFICATION_GROUPS_BY_ROLE` phía server. */
export const NOTIFICATION_GROUPS_BY_AREA: Record<AuthArea, NotificationGroup[]> = {
  candidate: ["APPLICATIONS", "INTERVIEWS", "INVITATIONS"],
  employer: ["APPLICATIONS", "JOB_POSTS", "COMPANY", "INVITATIONS", "INTERVIEWS", "SUBSCRIPTION"],
  admin: ["JOB_POSTS", "COMPANY", "CATALOG", "PAYMENTS"],
};

/**
 * Mọi key nằm dưới `["notifications", area]` — cùng gốc với chuông, nên
 * SocketProvider (khi có thông báo mới) và mọi thao tác đánh dấu đã đọc làm
 * mới cả chuông lẫn trung tâm thông báo một lần.
 */
export function useNotificationUnreadByGroup(area: AuthArea) {
  return useQuery({
    queryKey: ["notifications", area, "unread-by-group"],
    queryFn: () => fetchUnreadCountByGroup(area),
  });
}

/** Trang đầu (mới nhất trước) của một nhóm; dashboard chỉ hiện vài mục đầu. */
export function useNotificationFeed(area: AuthArea, tab: NotificationCenterTab) {
  return useQuery({
    queryKey: ["notifications", area, "center", tab],
    queryFn: () => fetchNotifications(area, tab === "ALL" ? {} : { group: tab }),
    // Đổi tab thì giữ danh sách cũ tới khi có danh sách mới, không nháy về khung xám.
    placeholderData: (previous) => previous,
  });
}

export function useMarkNotificationRead(area: AuthArea) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(area, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", area] }),
  });
}

export function useMarkAllNotificationsRead(area: AuthArea) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(area),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", area] }),
  });
}
