"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useCandidateAuthStore, useCurrentUser } from "@/stores/auth-store";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { NotificationBell } from "@/components/layout/NotificationBell";

const NAV_LINKS = [
  { label: "Việc thực tập", href: "/jobs" },
  { label: "Công ty", href: "/" },
  { label: "Cẩm nang", href: "/" },
  { label: "Dành cho doanh nghiệp", href: "/employer" },
];

const ACCOUNT_LINKS = [
  { label: "Tổng quan", href: "/", icon: "layout-dashboard" },
  { label: "Quản lý hồ sơ", href: "/profile", icon: "user-round" },
  { label: "Quản lý CV", href: "/cv", icon: "file-text" },
  { label: "Việc làm đã lưu", href: "/saved-jobs", icon: "bookmark" },
  { label: "Quản lý tìm việc", href: "/applications", icon: "briefcase-business" },
  { label: "Tin nhắn", href: "/messages", icon: "messages-square" },
];

export function CandidateHomeHeader() {
  const router = useRouter();
  const user = useCurrentUser("candidate");
  const hasHydrated = useCandidateAuthStore((state) => state.hasHydrated);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsAccountMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsAccountMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  async function handleLogout() {
    const refreshToken = useCandidateAuthStore.getState().refreshToken ?? undefined;
    try {
      await apiFetch("candidate", "/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) });
    } catch {
      // Xóa session phía client ngay cả khi yêu cầu logout thất bại.
    } finally {
      setIsAccountMenuOpen(false);
      useCandidateAuthStore.getState().clear();
      router.refresh();
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border-subtle bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center gap-8 px-6">
        <Link href="/" className="text-lg font-semibold text-pine-800">InternHub</Link>
        <nav className="hidden flex-1 gap-6 md:flex" aria-label="Điều hướng chính">
          {NAV_LINKS.map((link) => (
            <Link key={link.label} href={link.href} className="text-sm text-text-body hover:text-pine-700">{link.label}</Link>
          ))}
        </nav>
        {!hasHydrated ? (
          <div className="ml-auto h-9 w-10" aria-hidden />
        ) : user ? (
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell area="candidate" />
            <div ref={menuRef} className="relative">
              <button
                type="button"
                aria-label="Mở menu tài khoản"
                aria-haspopup="menu"
                aria-expanded={isAccountMenuOpen}
                onClick={() => setIsAccountMenuOpen((open) => !open)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-default text-text-body transition-colors hover:border-pine-300 hover:bg-pine-50 hover:text-pine-700 focus:outline-none focus:ring-2 focus:ring-pine-200"
              >
                <Icon name="user-round" size={19} />
              </button>
              {isAccountMenuOpen ? (
                <div role="menu" className="absolute right-0 top-12 z-30 w-72 overflow-hidden rounded-xl border border-border-subtle bg-white py-2 shadow-lg">
                  <div className="border-b border-border-subtle px-4 py-3">
                    <p className="text-xs font-semibold tracking-wide text-text-subtle uppercase">Tài khoản ứng viên</p>
                    <p className="mt-1 truncate text-sm text-text-body">{user.email}</p>
                  </div>
                  <div className="p-2">
                    {ACCOUNT_LINKS.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        role="menuitem"
                        onClick={() => setIsAccountMenuOpen(false)}
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-text-body transition-colors hover:bg-pine-50 hover:text-pine-800"
                      >
                        <Icon name={item.icon} size={17} />
                        {item.label}
                      </Link>
                    ))}
                  </div>
                  <div className="border-t border-border-subtle p-2">
                    <Link
                      href="/notifications"
                      role="menuitem"
                      onClick={() => setIsAccountMenuOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-text-body transition-colors hover:bg-pine-50 hover:text-pine-800"
                    >
                      <Icon name="bell" size={17} />
                      <span className="flex-1">Thông báo</span>
                    </Link>
                    <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-text-subtle" aria-disabled="true">
                      <Icon name="settings" size={17} />
                      <span className="flex-1">Cài đặt</span>
                      <span className="text-xs">Sắp có</span>
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleLogout()}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                    >
                      <Icon name="log-out" size={17} />
                      Đăng xuất
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="ml-auto flex items-center gap-2">
            <Button as="a" href="/login" variant="ghost">Đăng nhập</Button>
            <Button as="a" href="/register">Tạo hồ sơ miễn phí</Button>
          </div>
        )}
      </div>
    </header>
  );
}