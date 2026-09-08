"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UserProfile } from "@sip/shared-types";
import { apiFetch } from "@/lib/api-client";
import type { AuthArea } from "@/lib/auth-area";
import { authStoreForArea } from "@/stores/auth-store";

export interface SessionSyncProps {
  area: AuthArea;
}

/**
 * Re-verify session của một area mỗi khi app load (theo đúng plan Phase 2
 * frontend — PLAN.md dòng 51, mở rộng theo area ở AD-4): sau khi zustand
 * persist rehydrate xong, nếu area đó có accessToken thì gọi GET /users/me để
 * xác nhận token còn hợp lệ + đồng bộ lại user. Nếu area chưa có token thì
 * query bị `enabled: false`, không phát sinh request. Lỗi 401 đã được
 * apiFetch tự xử lý (refresh-on-401 → clear đúng session của area đó nếu vẫn
 * thất bại).
 */
export function SessionSync({ area }: SessionSyncProps) {
  const store = authStoreForArea(area);
  const hasHydrated = store((s) => s.hasHydrated);
  const accessToken = store((s) => s.accessToken);
  const setUser = store((s) => s.setUser);

  const { data } = useQuery({
    queryKey: ["me", area],
    queryFn: () => apiFetch<UserProfile>(area, "/users/me"),
    enabled: hasHydrated && !!accessToken,
    retry: false,
  });

  useEffect(() => {
    if (data) setUser(data);
  }, [data, setUser]);

  return null;
}
