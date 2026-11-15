"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  ActivityActorFilter,
  AdminAutomationStatus,
  AdminDashboardAnalytics,
  AdminDashboardOverview,
  AuditActivityItem,
  DashboardRange,
  PaginatedResponse,
} from "@sip/shared-types";
import { apiFetch } from "@/lib/api-client";

/**
 * Dashboard Admin bản D (AD-16, D14) — các truy vấn độc lập để mỗi khối có
 * trạng thái đang tải / lỗi riêng. Mọi key bắt đầu bằng `ADMIN_DASHBOARD_KEY`
 * (kể cả hoạt động gần đây) để "Làm mới" và socket invalidate cả trang một lần.
 */
export const ADMIN_DASHBOARD_KEY = ["admin", "dashboard"] as const;

const STALE_MS = 30_000;
const ACTIVITY_LIMIT = 5;

/** Shell cũng gọi hook này cho số chờ trên menu — cùng key nên không gọi API hai lần. */
export function useAdminDashboardOverview() {
  return useQuery({
    queryKey: [...ADMIN_DASHBOARD_KEY, "overview"],
    queryFn: () => apiFetch<AdminDashboardOverview>("admin", "/admin/dashboard/overview"),
    staleTime: STALE_MS,
  });
}

export function useAdminDashboardAnalytics(range: DashboardRange) {
  return useQuery({
    queryKey: [...ADMIN_DASHBOARD_KEY, "analytics", range],
    queryFn: () => apiFetch<AdminDashboardAnalytics>("admin", `/admin/dashboard/analytics?range=${range}`),
    staleTime: STALE_MS,
    // Đổi 7/30/90 thì giữ biểu đồ cũ tới khi có số mới, không nháy về khung xám.
    placeholderData: (previous) => previous,
  });
}

export function useAdminActivity(actor: ActivityActorFilter) {
  return useQuery({
    queryKey: [...ADMIN_DASHBOARD_KEY, "activity", actor],
    queryFn: () =>
      apiFetch<PaginatedResponse<AuditActivityItem>>("admin", `/admin/activity?limit=${ACTIVITY_LIMIT}&actor=${actor}`),
    staleTime: STALE_MS,
    placeholderData: (previous) => previous,
  });
}

/** Thẻ "Hệ thống tự động" làm mới mỗi 15 giây (bằng nhịp realtime của 0.6), chỉ khi tab đang hiển thị. */
const AUTOMATION_REFRESH_MS = 15_000;

/** GET /admin/automation-status (0.6 bước 8, plan frontend F5). Nằm dưới ADMIN_DASHBOARD_KEY để "Làm mới" làm mới luôn. */
export function useAutomationStatus() {
  return useQuery({
    queryKey: [...ADMIN_DASHBOARD_KEY, "automation-status"],
    queryFn: () => apiFetch<AdminAutomationStatus>("admin", "/admin/automation-status"),
    refetchInterval: AUTOMATION_REFRESH_MS,
    refetchIntervalInBackground: false,
  });
}

/** Ba hàng chờ của Admin — khoá của thẻ hàng chờ (`AdminQueues`) và số chờ trên menu. */
export type ModerationQueue = "jobPosts" | "companies" | "catalog";
