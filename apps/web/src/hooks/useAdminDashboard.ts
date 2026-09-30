"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ActivityActorFilter,
  AdminDashboardAnalytics,
  AdminDashboardOverview,
  AdminDashboardTasks,
  AuditActivityItem,
  CatalogEntryKind,
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

export function useAdminDashboardTasks() {
  return useQuery({
    queryKey: [...ADMIN_DASHBOARD_KEY, "tasks"],
    queryFn: () => apiFetch<AdminDashboardTasks>("admin", "/admin/dashboard/tasks"),
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

// ─── Thao tác duyệt ngay trên dashboard ──────────────────────────────────

export type ModerationQueue = "jobPosts" | "companies" | "catalog";
export type ModerationDecision = "approve" | "reject";

export interface ModerationInput {
  queue: ModerationQueue;
  id: string;
  decision: ModerationDecision;
  /** Bắt buộc khi từ chối tin và công ty; danh mục không có lý do. */
  reason?: string;
  /** Loại mục danh mục — chọn đúng API kỹ năng / trường / ngành. */
  kind?: CatalogEntryKind;
}

const CATALOG_PATH: Record<CatalogEntryKind, string> = {
  SKILL: "skills",
  UNIVERSITY: "universities",
  MAJOR: "majors",
};

// Cùng API với các trang quản lý (`/admin/jobs/[id]`, `/admin/companies/[id]`,
// `/admin/skills`, `/admin/education-catalog`).
function moderationPath({ queue, id, decision, kind }: ModerationInput): string {
  if (queue === "jobPosts") return `/admin/job-posts/${id}/${decision}`;
  if (queue === "companies") return `/companies/${id}/${decision === "approve" ? "verify" : "reject"}`;
  return `/admin/${CATALOG_PATH[kind ?? "SKILL"]}/${id}/${decision}`;
}

/** Key danh sách của các trang quản lý, để khi mở trang đó thấy ngay trạng thái mới. */
function managementKeys({ queue, id, kind }: ModerationInput): unknown[][] {
  if (queue === "jobPosts") return [["adminJobPosts"], ["adminJobPostStats"], ["adminJobPost", id]];
  if (queue === "companies") return [["admin-companies"], ["admin-company", id]];
  if (kind === "UNIVERSITY") return [["adminUniversities"], ["catalog", "universities"]];
  if (kind === "MAJOR") return [["adminMajors"], ["catalog", "majors"]];
  return [["adminSkills"], ["catalog", "skills"]];
}

/**
 * Duyệt / từ chối một mục. Xong thì tải lại số tổng quan (thẻ, tab, menu, dòng
 * đầu trang) và hoạt động gần đây; `tasks` chỉ bị đánh dấu cũ (không tải lại)
 * để hàng vừa xử lý còn ở chỗ cũ với nhãn trạng thái mới.
 */
export function useModerate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ModerationInput) =>
      apiFetch("admin", moderationPath(input), {
        method: "POST",
        ...(input.reason ? { body: JSON.stringify({ reason: input.reason }) } : {}),
      }),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: [...ADMIN_DASHBOARD_KEY, "tasks"], refetchType: "none" });
      void queryClient.invalidateQueries({ queryKey: [...ADMIN_DASHBOARD_KEY, "overview"] });
      void queryClient.invalidateQueries({ queryKey: [...ADMIN_DASHBOARD_KEY, "activity"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications", "admin"] });
      for (const queryKey of managementKeys(input)) void queryClient.invalidateQueries({ queryKey });
    },
  });
}
