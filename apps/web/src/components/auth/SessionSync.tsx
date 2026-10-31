"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UserProfile } from "@sip/shared-types";
import { apiFetch } from "@/lib/api-client";
import type { AuthArea } from "@/lib/auth-area";
import { setAreaCookie } from "@/lib/auth-storage";
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
    if (!data) return;
    // AD-22 — phiên đã đổi sang tài khoản khác (tab khác đăng nhập lại) trong lúc
    // request bay: kết quả này của phiên cũ, không ghi đè.
    const current = store.getState();
    if (!current.accessToken || (current.user && current.user.id !== data.id)) return;
    setUser(data);
    // /users/me thành công nghĩa là phiên còn hợp lệ ⇒ ghi lại cookie cho proxy.ts,
    // phòng khi trước đó cookie bị xoá nhầm (tab "còn phiên mà proxy chặn", AD-22).
    setAreaCookie(area);
  }, [area, data, setUser, store]);

  return null;
}
