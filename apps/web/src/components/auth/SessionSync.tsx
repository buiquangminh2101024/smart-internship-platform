"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UserProfile } from "@sip/shared-types";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Re-verify session mỗi khi app load (theo đúng plan Phase 2 frontend —
 * PLAN.md dòng 51): sau khi zustand persist rehydrate xong, nếu có
 * accessToken thì gọi GET /users/me để xác nhận token còn hợp lệ + đồng bộ
 * lại user (role/status có thể đã đổi ở nơi khác). Lỗi 401 đã được
 * apiFetch tự xử lý (refresh-on-401 → clear session nếu vẫn thất bại).
 */
export function SessionSync() {
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);

  const { data } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<UserProfile>("/users/me"),
    enabled: hasHydrated && !!accessToken,
    retry: false,
  });

  useEffect(() => {
    if (data) setUser(data);
  }, [data, setUser]);

  return null;
}
