"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  DashboardRange,
  EmployerDashboardAnalytics,
  EmployerDashboardOverview,
  EmployerHiringProgress,
} from "@sip/shared-types";
import { apiFetch } from "@/lib/api-client";

/**
 * Dashboard Employer (AD-16) — hai truy vấn độc lập để mỗi khối có trạng thái
 * đang tải / lỗi riêng. Mọi key bắt đầu bằng `EMPLOYER_DASHBOARD_KEY` để
 * invalidate cả dashboard một lần (sau thao tác, khi có thông báo realtime).
 */
export const EMPLOYER_DASHBOARD_KEY = ["employer", "dashboard"] as const;

const STALE_MS = 30_000;

/** `enabled=false` khi công ty chưa xác minh (shell gọi hook này cho số trên nav). */
export function useEmployerDashboardOverview(enabled = true) {
  return useQuery({
    queryKey: [...EMPLOYER_DASHBOARD_KEY, "overview"],
    queryFn: () => apiFetch<EmployerDashboardOverview>("employer", "/employer/dashboard/overview"),
    enabled,
    staleTime: STALE_MS,
  });
}

export function useEmployerDashboardAnalytics(range: DashboardRange) {
  return useQuery({
    queryKey: [...EMPLOYER_DASHBOARD_KEY, "analytics", range],
    queryFn: () => apiFetch<EmployerDashboardAnalytics>("employer", `/employer/dashboard/analytics?range=${range}`),
    staleTime: STALE_MS,
    // Đổi 7/30/90 thì giữ biểu đồ cũ tới khi có số mới, không nháy về khung xám.
    placeholderData: (previous) => previous,
  });
}

/**
 * Tiến độ tuyển theo tin (0.3, AD-24). Nằm dưới `EMPLOYER_DASHBOARD_KEY`, nên mọi thông báo
 * realtime (kể cả AUTO_OUTREACH_SENT và ứng viên trả lời lời mời) đã làm mới khối này.
 */
export const HIRING_PROGRESS_KEY = [...EMPLOYER_DASHBOARD_KEY, "hiring-progress"] as const;

export function useEmployerHiringProgress() {
  return useQuery({
    queryKey: HIRING_PROGRESS_KEY,
    queryFn: () => apiFetch<EmployerHiringProgress>("employer", "/employer/dashboard/hiring-progress"),
    staleTime: STALE_MS,
  });
}
