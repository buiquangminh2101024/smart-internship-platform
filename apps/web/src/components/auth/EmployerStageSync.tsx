"use client";

import { useEffect } from "react";
import { useEmployerMe } from "@/hooks/useEmployerMe";
import { employerStageToCookieValue, setEmployerStageCookie } from "@/lib/auth-storage";

/**
 * Đồng bộ cookie sip_employer_stage (đọc bởi proxy.ts, xem AD-1/AD-4) mỗi khi
 * app load lại với một session employer hợp lệ — bổ sung cho SessionSync
 * (chỉ đồng bộ UserProfile qua /users/me, không biết gì về Employer/Company).
 */
export function EmployerStageSync() {
  const { data } = useEmployerMe();

  useEffect(() => {
    if (data) setEmployerStageCookie(employerStageToCookieValue(data.stage));
  }, [data]);

  return null;
}
