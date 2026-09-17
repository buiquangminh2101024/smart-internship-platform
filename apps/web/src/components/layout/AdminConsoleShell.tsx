"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { apiFetch } from "@/lib/api-client";
import { useAdminAuthStore, useCurrentUser } from "@/stores/auth-store";
import { Icon } from "@/components/ui/Icon";
import { SideNav, type SideNavItem } from "./SideNav";
import { PortalTopbar, buildCrumbs } from "./PortalTopbar";
import { SocketProvider } from "@/components/realtime/SocketProvider";

// Bố cục theo ảnh mẫu `Screenshot 2026-09-12 134326.png` (panel 1 & 2): header
// "Admin Panel / System Control" + 5 mục. "Tổng quan" tạm trỏ về hàng đợi
// kiểm duyệt vì `/admin` đang là trang đăng nhập bí mật (AD-1) nên console
// không thể có trang tổng quan ở đúng đường dẫn đó. "Người dùng" và "Báo cáo"
// chưa có module nên để disable.
const NAV_ITEMS: SideNavItem[] = [
  { label: "Tin tuyển dụng", icon: "clipboard-check", href: "/admin/jobs", matchNested: true },
  { label: "Nhà tuyển dụng", icon: "building-2", href: "/admin/companies", matchNested: true },
  { label: "Kỹ năng", icon: "sparkles", href: "/admin/skills", matchNested: true },
  { label: "Người dùng", icon: "users", soon: true },
  { label: "Báo cáo", icon: "flag", soon: true },
  { label: "Cài đặt", icon: "settings", href: "/admin/settings" },
];

const CRUMB_LABELS: Record<string, string> = {
  jobs: "Kiểm duyệt tin",
  companies: "Nhà tuyển dụng",
  skills: "Kỹ năng",
  notifications: "Thông báo",
  settings: "Cài đặt",
};

/**
 * App shell cho mọi trang trong `admin/(console)`. `data-role="admin"` ở thẻ
 * ngoài cùng trỏ alias `brand-*` sang bảng màu Plum, nên mọi component bên
 * trong (kể cả lồng sâu) tự lên đúng màu khu vực — xem AD-7.
 */
export function AdminConsoleShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useCurrentUser("admin");

  async function handleLogout() {
    const refreshToken = useAdminAuthStore.getState().refreshToken ?? undefined;
    try {
      await apiFetch("admin", "/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) });
    } catch {
      // Ưu tiên clear phía client ngay cả khi API logout thất bại.
    } finally {
      useAdminAuthStore.getState().clear();
      router.push("/admin");
    }
  }

  return (
    <SocketProvider area="admin">
      <div data-role="admin" className="flex min-h-screen flex-col bg-surface-page">
        <PortalTopbar
          area="admin"
          roleLabel="Quản trị"
          homeHref="/admin/jobs"
          crumbs={buildCrumbs(pathname, { label: "Admin Panel", href: "/admin" }, CRUMB_LABELS)}
          userEmail={user?.email}
          onLogout={handleLogout}
        />

        <div className="flex flex-1 items-stretch">
          <SideNav
            items={NAV_ITEMS}
            header={
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
                  <Icon name="shield-check" size={16} />
                </span>
                <span className="grid">
                  <span className="text-sm font-semibold text-brand-700">Admin Panel</span>
                  <span className="text-xs text-text-muted">System Control</span>
                </span>
              </div>
            }
          />

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </SocketProvider>
  );
}
