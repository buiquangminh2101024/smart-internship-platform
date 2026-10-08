"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ActivateUserRequest,
  AdminBulkActionResponse,
  AdminUserDetail,
  AdminUserListItem,
  AdminUserListQuery,
  AdminUserListResponse,
  BulkReactivateUsersRequest,
  BulkSuspendUsersRequest,
  RevokeSessionsRequest,
  SuspendUserRequest,
} from "@sip/shared-types";
import { apiFetch, ApiError } from "@/lib/api-client";
import { ADMIN_DASHBOARD_KEY } from "./useAdminDashboard";

/** Quản lý người dùng của Admin (AD-17, AD-18). Mọi key nằm dưới `ADMIN_USERS_KEY`. */
export const ADMIN_USERS_KEY = ["admin", "users"] as const;

/** Bộ lọc đọc từ query string — từng trường có thể vắng (`undefined`). */
export type AdminUserFilters = { [K in keyof AdminUserListQuery]?: AdminUserListQuery[K] | undefined };

function toSearch(filters: AdminUserFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.toString();
}

/**
 * Danh sách theo số trang (E6). Chuyển trang / đổi bộ lọc thì giữ trang cũ tới
 * khi có kết quả mới (`keepPreviousData`), không nháy về "Đang tải".
 */
export function useAdminUsers(filters: AdminUserFilters, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...ADMIN_USERS_KEY, "list", filters],
    queryFn: () => {
      const search = toSearch(filters);
      return apiFetch<AdminUserListResponse>("admin", `/admin/users${search ? `?${search}` : ""}`);
    },
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

/** Chi tiết một người (E4, E5, E8). 404 thì không thử lại — trang hiện "Không tìm thấy". */
export function useAdminUserDetail(userId: string) {
  return useQuery({
    queryKey: [...ADMIN_USERS_KEY, "detail", userId],
    queryFn: () => apiFetch<AdminUserDetail>("admin", `/admin/users/${encodeURIComponent(userId)}`),
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 3,
  });
}

/**
 * Sau mọi thao tác trên tài khoản: tải lại danh sách, chi tiết và "Hoạt động gần đây" của
 * dashboard (AuditLog). Gắn vào `onSettled` để cả khi lỗi (vd. 409: trạng thái
 * đã đổi ở nơi khác) danh sách cũng khớp trạng thái thật.
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

/** Buộc đăng xuất mọi thiết bị (E2), chỉ với `ACTIVE`. Lý do không bắt buộc. */
export function useRevokeUserSessions() {
  const invalidate = useInvalidateAfterStatusChange();
  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: RevokeSessionsRequest }) =>
      apiFetch<AdminUserListItem>("admin", `/admin/users/${userId}/revoke-sessions`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSettled: invalidate,
  });
}

/** Kích hoạt thủ công (E3), chỉ với `PENDING_VERIFICATION`. Lý do bắt buộc. */
export function useActivateUser() {
  const invalidate = useInvalidateAfterStatusChange();
  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: ActivateUserRequest }) =>
      apiFetch<AdminUserListItem>("admin", `/admin/users/${userId}/activate`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSettled: invalidate,
  });
}

/** Gửi hướng dẫn đặt lại mật khẩu (E1). 409 nếu chỉ có Google hoặc đang khoá; 429 sau 3 lần / giờ. */
export function useSendPasswordResetGuide() {
  const invalidate = useInvalidateAfterStatusChange();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<AdminUserListItem>("admin", `/admin/users/${userId}/send-password-reset-guide`, { method: "POST" }),
    onSettled: invalidate,
  });
}

/** Khoá hàng loạt (E7): luôn 200, kết quả từng người nằm trong `results`. */
export function useBulkSuspendUsers() {
  const invalidate = useInvalidateAfterStatusChange();
  return useMutation({
    mutationFn: (data: BulkSuspendUsersRequest) =>
      apiFetch<AdminBulkActionResponse>("admin", "/admin/users/bulk/suspend", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSettled: invalidate,
  });
}

export function useBulkReactivateUsers() {
  const invalidate = useInvalidateAfterStatusChange();
  return useMutation({
    mutationFn: (data: BulkReactivateUsersRequest) =>
      apiFetch<AdminBulkActionResponse>("admin", "/admin/users/bulk/reactivate", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSettled: invalidate,
  });
}
