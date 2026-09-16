"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { apiFetch } from "@/lib/api-client";
import { useCandidateAuthStore, useCurrentUser } from "@/stores/auth-store";
import { Icon } from "@/components/ui/Icon";
import { SideNav, type SideNavItem } from "./SideNav";
import { CandidateHomeHeader } from "@/components/marketing/CandidateHomeHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";

// Điều hướng Candidate Portal — Phase 7 bật CV + Tin đã lưu (bỏ `soon`).
// Applications (Phase 8) vẫn để `soon`. Pine là màu brand mặc định (data-role
// không đặt thì alias brand-* về Pine — xem AD-7).
const NAV_ITEMS: SideNavItem[] = [
  { label: "Hồ sơ ứng viên", icon: "user-round", href: "/profile" },
  { label: "Quản lý CV", icon: "file-text", href: "/cv" },
  { label: "Việc làm đã lưu", icon: "bookmark", href: "/saved-jobs" },
  { label: "Ứng tuyển của tôi", href: "/applications", icon: "briefcase-business" },
  { label: "Tin nhắn", icon: "messages-square", href: "/messages" },
  { label: "Cài đặt", icon: "settings", href: "/settings" },
];

/**
 * App shell cho khu vực Candidate (profile/cv/saved-jobs/applications).
 * Thay vì dùng PortalTopbar (chỉ hợp với admin/employer), ứng viên sẽ thấy 
 * CandidateHomeHeader và SiteFooter để giao diện nhất quán.
 */
export function CandidatePortalShell({ children }: { children: ReactNode }) {
  const user = useCurrentUser("candidate");

  return (
    <div className="flex min-h-screen flex-col bg-surface-page">
      <CandidateHomeHeader />

      <div className="mx-auto flex w-full max-w-6xl flex-1 items-stretch border-x border-border-subtle bg-white">
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

        <div className="min-w-0 flex-1 bg-surface-page">{children}</div>
      </div>
      <SiteFooter />
    </div>
  );
}
