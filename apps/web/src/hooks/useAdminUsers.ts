"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AdminUserListItem,
  AdminUserListQuery,
  PaginatedResponse,
  SuspendUserRequest,
} from "@sip/shared-types";
import { apiFetch } from "@/lib/api-client";
import { ADMIN_DASHBOARD_KEY } from "./useAdminDashboard";

/** Quản lý người dùng của Admin (AD-17). Mọi key nằm dưới `ADMIN_USERS_KEY`. */
export const ADMIN_USERS_KEY = ["admin", "users"] as const;

/** Bộ lọc đọc từ query string — từng trường có thể vắng (`undefined`). */
export type AdminUserFilters = { [K in keyof Omit<AdminUserListQuery, "cursor">]?: AdminUserListQuery[K] | undefined };

export function useAdminUsers(filters: AdminUserFilters) {
  return useInfiniteQuery({
    queryKey: [...ADMIN_USERS_KEY, filters],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (filters.role) params.set("role", filters.role);
      if (filters.status) params.set("status", filters.status);
      if (filters.q) params.set("q", filters.q);
      if (pageParam) params.set("cursor", pageParam);
      const search = params.toString();
      return apiFetch<PaginatedResponse<AdminUserListItem>>("admin", `/admin/users${search ? `?${search}` : ""}`);
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    // Gõ tìm kiếm thì giữ danh sách cũ tới khi có kết quả mới, không nháy về "Đang tải".
    placeholderData: (previous) => previous,
  });
}

/**
 * Sau khoá / mở khoá: tải lại danh sách và "Hoạt động gần đây" của dashboard
 * (AuditLog `USER_SUSPENDED` / `USER_REACTIVATED`). Gắn vào `onSettled` để cả
 * khi lỗi (vd. 409: trạng thái đã đổi ở nơi khác) danh sách cũng khớp trạng thái thật.
 */
function useInvalidateAfterStatusChange() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
    void queryClient.invalidateQueries({ queryKey: [...ADMIN_DASHBOARD_KEY, "activity"] });
  };
}

export function useSuspendUser() {
  const invalidate = useInvalidateAfterStatusChange();
  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: SuspendUserRequest }) =>
      apiFetch<AdminUserListItem>("admin", `/admin/users/${userId}/suspend`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSettled: invalidate,
  });
}

export function useReactivateUser() {
  const invalidate = useInvalidateAfterStatusChange();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<AdminUserListItem>("admin", `/admin/users/${userId}/reactivate`, { method: "POST" }),
    onSettled: invalidate,
  });
}
