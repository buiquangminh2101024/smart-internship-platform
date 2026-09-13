"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { apiFetch } from "@/lib/api-client";
import { useCandidateAuthStore, useCurrentUser } from "@/stores/auth-store";
import { Icon } from "@/components/ui/Icon";
import { SideNav, type SideNavItem } from "./SideNav";
import { PortalTopbar, buildCrumbs } from "./PortalTopbar";

// Điều hướng Candidate Portal — Phase 7 bật CV + Tin đã lưu (bỏ `soon`).
// Applications (Phase 8) vẫn để `soon`. Pine là màu brand mặc định (data-role
// không đặt thì alias brand-* về Pine — xem AD-7).
const NAV_ITEMS: SideNavItem[] = [
  { label: "Hồ sơ ứng viên", icon: "user-round", href: "/profile" },
  { label: "Quản lý CV", icon: "file-text", href: "/cv" },
  { label: "Việc làm đã lưu", icon: "bookmark", href: "/saved-jobs" },
  { label: "Ứng tuyển của tôi", icon: "briefcase-business", soon: true },
  { label: "Tin nhắn", icon: "messages-square", href: "/messages", soon: true },
];

const CRUMB_LABELS: Record<string, string> = {
  profile: "Hồ sơ ứng viên",
  cv: "Quản lý CV",
  "saved-jobs": "Việc làm đã lưu",
  applications: "Ứng tuyển",
  messages: "Tin nhắn",
};

/**
 * App shell cho khu vực Candidate (profile/cv/saved-jobs).
 * `data-role` không đặt → brand-* mặc định là Pine (màu công cụ chính).
 * Xem AD-7 trong ARCHITECTURE_DECISIONS.md.
 */
export function CandidatePortalShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useCurrentUser("candidate");

  async function handleLogout() {
    const refreshToken = useCandidateAuthStore.getState().refreshToken ?? undefined;
    try {
      await apiFetch("candidate", "/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) });
    } catch {
      // Xóa session phía client ngay cả khi API logout thất bại.
    } finally {
      useCandidateAuthStore.getState().clear();
      router.push("/");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-page">
      <PortalTopbar
        roleLabel="Ứng viên"
        homeHref="/profile"
        crumbs={buildCrumbs(pathname, { label: "InternHub", href: "/" }, CRUMB_LABELS)}
        userEmail={user?.email}
        accountHref="/profile"
        onLogout={handleLogout}
      />

      <div className="flex flex-1 items-stretch">
        <SideNav
          items={NAV_ITEMS}
          header={
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pine-100 text-pine-700">
                <Icon name="user-round" size={16} />
              </span>
              <span className="grid">
                <span className="text-sm font-semibold text-text-strong">Tài khoản ứng viên</span>
                <span className="truncate text-xs text-text-muted">{user?.email ?? "—"}</span>
              </span>
            </div>
          }
        />

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
