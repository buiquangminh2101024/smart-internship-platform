"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { apiFetch } from "@/lib/api-client";
import { useCandidateAuthStore, useCurrentUser } from "@/stores/auth-store";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { SideNav, type SideNavItem } from "./SideNav";
import { MobileNavDrawer, useMobileNav } from "./MobileNavDrawer";

const NAV_ITEMS: SideNavItem[] = [
  { label: "Tổng quan", icon: "layout-dashboard", href: "/dashboard" },
  { label: "Hồ sơ ứng viên", icon: "user-round", href: "/profile" },
  { label: "Quản lý CV", icon: "file-text", href: "/cv" },
  { label: "Việc làm phù hợp", icon: "sparkles", href: "/recommended-jobs" },
  { label: "Việc làm đã lưu", icon: "bookmark", href: "/saved-jobs" },
  { label: "Ứng tuyển của tôi", href: "/applications", icon: "briefcase-business" },
  { label: "Lời mời ứng tuyển", icon: "mail", href: "/job-invitations" },
  { label: "Thông báo", icon: "bell", href: "/notifications" },
  { label: "Tin nhắn", icon: "message-square", href: "/messages" },
  { label: "Cài đặt", icon: "settings", href: "/settings" },
];

const PAGE_TITLES: Array<{ prefix: string; title: string; subtitle: string }> = [
  { prefix: "/dashboard", title: "Tổng quan ứng viên", subtitle: "Theo dõi tiến độ tìm kiếm cơ hội thực tập của bạn." },
  { prefix: "/profile", title: "Hồ sơ ứng viên", subtitle: "Cập nhật thông tin cá nhân, học vấn và kỹ năng nổi bật." },
  { prefix: "/cv", title: "Quản lý CV", subtitle: "Tạo mới hoặc quản lý các phiên bản CV ứng tuyển." },
  { prefix: "/recommended-jobs", title: "Việc làm phù hợp", subtitle: "Gợi ý vị trí thực tập theo chuyên ngành và kỹ năng." },
  { prefix: "/saved-jobs", title: "Việc làm đã lưu", subtitle: "Danh sách các tin thực tập bạn đã đánh dấu quan tâm." },
  { prefix: "/applications", title: "Ứng tuyển của tôi", subtitle: "Theo dõi trạng thái xử lý hồ sơ theo thời gian thực." },
  { prefix: "/job-invitations", title: "Lời mời ứng tuyển", subtitle: "Các lời mời phỏng vấn và ứng tuyển trực tiếp từ doanh nghiệp." },
  { prefix: "/notifications", title: "Thông báo", subtitle: "Cập nhật trạng thái hồ sơ, lịch phỏng vấn và lời mời mới." },
  { prefix: "/messages", title: "Tin nhắn", subtitle: "Trao đổi trực tiếp với nhà tuyển dụng." },
  { prefix: "/settings", title: "Cài đặt tài khoản", subtitle: "Quản lý bảo mật và thông báo việc làm." },
];

/**
 * App shell cho khu vực Candidate — chuẩn SaaS Workspace (Sidebar 256px + Topbar 64px).
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
  const pageMeta = PAGE_TITLES.find((p) => pathname.startsWith(p.prefix)) ?? {
    title: "Không gian ứng viên",
    subtitle: "InternHub — Kết nối thực tập, mở đầu sự nghiệp.",
  };

  const initials = (user?.email?.slice(0, 2) ?? "SV").toUpperCase();

  return (
    <div className="flex min-h-screen bg-surface-page">
      {!isMessagesPage && (
        <SideNav
          items={NAV_ITEMS}
          header={
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <Link href="/" className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white shadow-xs">
                  <Icon name="layers" size={18} />
                </span>
                <span className="text-[17px] font-extrabold tracking-tight text-text-strong">
                  Intern<span className="text-brand-500">Hub</span>
                </span>
              </Link>
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-bold text-brand-700">
                Sinh viên
              </span>
            </div>
          }
          footer={
            <div className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-surface-hover">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-brand-200 bg-brand-50 text-xs font-extrabold text-brand-700">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text-strong">Tài khoản ứng viên</p>
                <p className="truncate text-xs text-text-muted">{user?.email ?? "—"}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleLogout()}
                title="Đăng xuất"
                aria-label="Đăng xuất"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-red-50 hover:text-red-600 cursor-pointer"
              >
                <Icon name="log-out" size={16} />
              </button>
            </div>
          }
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky Workspace Topbar (64px) */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border-subtle bg-white/92 px-4 backdrop-blur-md sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            {isMessagesPage ? (
              <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5 pr-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white shadow-xs">
                  <Icon name="layers" size={18} />
                </span>
                <span className="text-[17px] font-extrabold tracking-tight text-text-strong">
                  Intern<span className="text-brand-500">Hub</span>
                </span>
              </Link>
            ) : (
              <button
                ref={mobileNav.buttonRef}
                type="button"
                aria-label="Mở menu điều hướng"
                aria-expanded={mobileNav.open}
                aria-controls={mobileNav.drawerId}
                onClick={mobileNav.show}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-text-body transition-colors hover:bg-surface-hover lg:hidden"
              >
                <Icon name="menu" size={20} />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-text-strong sm:text-lg">{pageMeta.title}</h2>
              <p className="hidden truncate text-xs text-text-muted sm:block">{pageMeta.subtitle}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <NotificationBell area="candidate" />
            <Link
              href="/messages"
              aria-label="Tin nhắn"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border-subtle bg-white text-text-muted transition-colors hover:bg-surface-hover hover:text-text-strong"
            >
              <Icon name="message-square" size={18} />
            </Link>
            <Button as="a" href="/jobs" size="sm" icon="search">
              <span className="hidden sm:inline">Tìm việc thực tập</span>
              <span className="sm:hidden">Tìm việc</span>
            </Button>
          </div>
        </header>

        <div className="min-w-0 flex-1 bg-surface-page">{children}</div>
      </div>

      <MobileNavDrawer
        id={mobileNav.drawerId}
        open={mobileNav.open}
        onClose={mobileNav.close}
        items={NAV_ITEMS}
        header={
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white">
              <Icon name="layers" size={18} />
            </span>
            <span className="grid">
              <span className="text-sm font-bold text-text-strong">InternHub</span>
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
