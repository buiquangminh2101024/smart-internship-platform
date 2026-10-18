"use client";

import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { AuditActivityItem, AuditActivityPage, AuditActivityStats } from "@sip/shared-types";
import { apiFetch, ApiError } from "@/lib/api-client";
import {
  FAILED_LOGIN_ACTION,
  toListSearch,
  toStatsSearch,
  type ActivityFilters,
} from "@/lib/audit-activity";

/**
 * Trang Nhật ký hoạt động (AD-20, plan FE "admin-audit-log"). Mọi key nằm dưới
 * `ADMIN_ACTIVITY_KEY` để nút "Tải lại" invalidate một lần. Hook `useAdminActivity`
 * của dashboard (key `["admin","dashboard","activity"]`) giữ nguyên.
 */
export const ADMIN_ACTIVITY_KEY = ["admin", "activity"] as const;

export const ACTIVITY_PAGE_SIZE = 50;
/** Hành trình (L12, L33): `order=asc`, tối đa 200 dòng. */
export const JOURNEY_LIMIT = 200;

const STALE_MS = 30_000;

/** 404 là kết quả (dòng không còn), không thử lại. */
function retryUnless404(failureCount: number, error: unknown): boolean {
  return !(error instanceof ApiError && error.status === 404) && failureCount < 3;
}

/**
 * Danh sách theo lô 50 dòng, tải thêm bằng cursor. `total` và `searchTruncated`
 * chỉ có ở trang đầu. Đổi bộ lọc thì giữ trang cũ tới khi có kết quả mới.
 */
export function useActivityList(filters: ActivityFilters) {
  const search = toListSearch(filters).toString();
  return useInfiniteQuery({
    queryKey: [...ADMIN_ACTIVITY_KEY, "list", search],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams(search);
      params.set("limit", String(ACTIVITY_PAGE_SIZE));
      if (pageParam) params.set("cursor", pageParam);
      return apiFetch<AuditActivityPage>("admin", `/admin/activity?${params.toString()}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : null),
    placeholderData: keepPreviousData,
    staleTime: STALE_MS,
  });
}

/**
 * Số liệu cho biểu đồ (L11, L31, L32). Bỏ đối tượng, người làm, phiên và lưu trữ
 * trước khi gửi. Xem nhật ký đã lưu trữ thì không gọi (L19, L23).
 */
export function useActivityStats(filters: ActivityFilters, options: { enabled: boolean }) {
  const search = toStatsSearch(filters).toString();
  return useQuery({
    queryKey: [...ADMIN_ACTIVITY_KEY, "stats", search],
    queryFn: () => apiFetch<AuditActivityStats>("admin", `/admin/activity/stats${search ? `?${search}` : ""}`),
    enabled: options.enabled && !filters.archived,
    placeholderData: keepPreviousData,
    staleTime: STALE_MS,
  });
}

/**
 * 3 lần "đăng nhập sai 5 lần" gần nhất khớp bộ lọc, cho thanh cảnh báo. Chỉ gọi
 * khi `/stats` báo `securityAlerts > 0`.
 */
export function useRecentFailedLogins(filters: ActivityFilters, options: { enabled: boolean }) {
  const params = toListSearch({ ...filters, actions: [FAILED_LOGIN_ACTION], resubmit: null });
  params.set("limit", "3");
  const search = params.toString();
  return useQuery({
    queryKey: [...ADMIN_ACTIVITY_KEY, "failed-logins", search],
    queryFn: () => apiFetch<AuditActivityPage>("admin", `/admin/activity?${search}`),
    enabled: options.enabled,
    staleTime: STALE_MS,
  });
}

/** Một dòng theo id (L35) — chỉ gọi khi `row` trên link không có trong các trang đã tải. */
export function useActivityItem(id: string | null, archived: boolean, options: { enabled: boolean }) {
  return useQuery({
    queryKey: [...ADMIN_ACTIVITY_KEY, "item", id, archived],
    queryFn: () =>
      apiFetch<AuditActivityItem>(
        "admin",
        `/admin/activity/${encodeURIComponent(id!)}${archived ? "?archived=true" : ""}`,
      ),
    enabled: options.enabled && id !== null,
    retry: retryUnless404,
    staleTime: STALE_MS,
  });
}

/** Hành trình của một đối tượng, cũ nhất trước (L12). Bật khi mở tab "Hành trình đối tượng". */
export function useEntityJourney(
  entity: { type: string; id: string } | null,
  archived: boolean,
  options: { enabled: boolean },
) {
  return useQuery({
    queryKey: [...ADMIN_ACTIVITY_KEY, "entity-journey", entity?.type, entity?.id, archived],
    queryFn: () => {
      const params = new URLSearchParams({
        entityType: entity!.type,
        entityId: entity!.id,
        order: "asc",
        limit: String(JOURNEY_LIMIT),
      });
      if (archived) params.set("archived", "true");
      return apiFetch<AuditActivityPage>("admin", `/admin/activity?${params.toString()}`);
    },
    enabled: options.enabled && entity !== null,
    staleTime: STALE_MS,
  });
}

/**
 * Thao tác của một người làm trong một khoảng ngày, cũ nhất trước (L33). Bật khi
 * mở tab "Hành trình người làm"; giao diện tự gom thành phiên.
 */
export function useActorJourney(
  actorId: string | null,
  range: { from: string; to: string } | null,
  archived: boolean,
  options: { enabled: boolean },
) {
  return useQuery({
    queryKey: [...ADMIN_ACTIVITY_KEY, "actor-journey", actorId, range?.from, range?.to, archived],
    queryFn: () => {
      const params = new URLSearchParams({ actorId: actorId!, order: "asc", limit: String(JOURNEY_LIMIT) });
      if (range) {
        params.set("from", range.from);
        params.set("to", range.to);
      }
      if (archived) params.set("archived", "true");
      return apiFetch<AuditActivityPage>("admin", `/admin/activity?${params.toString()}`);
    },
    enabled: options.enabled && actorId !== null,
    staleTime: STALE_MS,
  });
}
