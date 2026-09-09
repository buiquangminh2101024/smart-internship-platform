"use client";

import { useEffect } from "react";
import { useEmployerAuthStore } from "@/stores/auth-store";

/**
 * "Thoát giữa chừng thì tự động logout" — không thể đảm bảo gọi API logout
 * (thu hồi token phía server, cần header Authorization) một cách đáng tin
 * cậy khi đóng tab/refresh (`beforeunload`/`pagehide` không chờ được network
 * call). Best-effort: xoá session phía client (localStorage + cookie) đồng
 * bộ trong `pagehide` — không xoá khi điều hướng trong app (SPA route change
 * không unload document nên `pagehide` không fire ở đó), vì escape trong app
 * đã bị proxy.ts chặn ngược lại `hoan-tat-thu-tuc` cho mọi route
 * `/employer/(portal)/*` khác khi stage vẫn là "onboarding".
 *
 * Lưới an toàn thật sự là proxy.ts + GET /employers/me: đăng nhập lại mà
 * chưa có Employer sẽ luôn bị đưa lại trang này (xem lib/auth.ts
 * resolveEmployerDestination), bất kể beforeunload có kịp chạy hay không.
 */
export function OnboardingExitGuard({ completed }: { completed: boolean }) {
  useEffect(() => {
    if (completed) return;

    function handlePageHide() {
      useEmployerAuthStore.getState().clear();
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [completed]);

  return null;
}
