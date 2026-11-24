"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { apiFetch } from "@/lib/api-client";
import { useCandidateAuthStore, useCurrentUser } from "@/stores/auth-store";
import { Icon } from "@/components/ui/Icon";
import { SideNav, type SideNavItem } from "./SideNav";
import { MobileNavDrawer, useMobileNav } from "./MobileNavDrawer";
import { CandidateHomeHeader } from "@/components/marketing/CandidateHomeHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";

// Điều hướng Candidate Portal — Phase 7 bật CV + Tin đã lưu (bỏ `soon`).
// Applications (Phase 8) vẫn để `soon`. Pine là màu brand mặc định (data-role
// không đặt thì alias brand-* về Pine — xem AD-7).
const NAV_ITEMS: SideNavItem[] = [
  { label: "Tổng quan", icon: "layout-dashboard", href: "/dashboard" },
  { label: "Hồ sơ ứng viên", icon: "user-round", href: "/profile" },
  { label: "Quản lý CV", icon: "file-text", href: "/cv" },
  { label: "Việc làm phù hợp", icon: "sparkles", href: "/recommended-jobs" },
  { label: "Việc làm đã lưu", icon: "bookmark", href: "/saved-jobs" },
  { label: "Ứng tuyển của tôi", href: "/applications", icon: "briefcase-business" },
  { label: "Lời mời ứng tuyển", icon: "mail", href: "/job-invitations" },
  { label: "Cài đặt", icon: "settings", href: "/settings" },
];

/**
 * App shell cho khu vực Candidate (profile/cv/saved-jobs/applications).
 * Thay vì dùng PortalTopbar (chỉ hợp với admin/employer), ứng viên sẽ thấy 
 * CandidateHomeHeader và SiteFooter để giao diện nhất quán.
 */
export function CandidatePortalShell({ children }: { children: ReactNode }) {
  const user = useCurrentUser("candidate");
  const router = useRouter();
  const mobileNav = useMobileNav();

  const pathname = usePathname();

  async function handleLogout() {
    const refreshToken = useCandidateAuthStore.getState().refreshToken ?? undefined;
    try {
      await apiFetch("candidate", "/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) });
    } catch {
      // Xóa session phía client ngay cả khi yêu cầu logout thất bại.
    } finally {
      useCandidateAuthStore.getState().clear();
      router.refresh();
    }
  }

  // Hide the shell for the CV editor to give it full screen
  if (pathname.startsWith("/cv/editor")) {
    return <>{children}</>;
  }

  const isMessagesPage = pathname.startsWith("/messages");

  return (
    <div className="flex min-h-screen flex-col bg-surface-page">
      <CandidateHomeHeader />

      {/* Nút ☰ mở ngăn kéo điều hướng — chỉ hiện dưới lg (khi SideNav ẩn). */}
      {!isMessagesPage && (
        <div className="flex items-center border-b border-border-subtle px-4 py-2 lg:hidden">
          <button
            ref={mobileNav.buttonRef}
            type="button"
            aria-label="Mở menu điều hướng"
            aria-expanded={mobileNav.open}
            aria-controls={mobileNav.drawerId}
            onClick={mobileNav.show}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-text-body transition-colors hover:bg-surface-hover"
          >
            <Icon name="menu" size={22} />
          </button>
          <span className="ml-2 text-sm font-medium text-text-strong">Tài khoản ứng viên</span>
        </div>
      )}

      <div className={`mx-auto flex w-full ${isMessagesPage ? 'max-w-none border-x-0' : 'max-w-6xl border-x'} flex-1 items-stretch border-border-subtle bg-white`}>
        {!isMessagesPage && (
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
        )}

        <div className="min-w-0 flex-1 bg-surface-page">{children}</div>
      </div>
      {!isMessagesPage && <SiteFooter />}

      <MobileNavDrawer
        id={mobileNav.drawerId}
        open={mobileNav.open}
        onClose={mobileNav.close}
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
        roleLabel="Ứng viên"
        homeHref="/"
        userEmail={user?.email}
        accountHref="/profile"
        onLogout={handleLogout}
      />
    </div>
  );
}
