"use client";

import { useQuery } from "@tanstack/react-query";
import type { EmployerMeResponse } from "@sip/shared-types";
import { apiFetch } from "@/lib/api-client";
import { useEmployerAuthStore } from "@/stores/auth-store";

/**
 * GET /employers/me — dùng chung bởi EmployerStageSync (đồng bộ cookie
 * proxy.ts đọc) và các trang onboarding/profile (đọc trực tiếp dữ liệu hiển
 * thị). Cùng queryKey nên React Query dedupe khi cả hai mount cùng lúc.
 */
export function useEmployerMe() {
  const hasHydrated = useEmployerAuthStore((s) => s.hasHydrated);
  const accessToken = useEmployerAuthStore((s) => s.accessToken);

  return useQuery({
    queryKey: ["employerMe"],
    queryFn: () => apiFetch<EmployerMeResponse>("employer", "/employers/me"),
    enabled: hasHydrated && !!accessToken,
    retry: false,
  });
}
