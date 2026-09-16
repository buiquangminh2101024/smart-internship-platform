"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { apiFetch } from "@/lib/api-client";
import { useEmployerMe } from "@/hooks/useEmployerMe";
import { useCurrentUser, useEmployerAuthStore } from "@/stores/auth-store";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { SideNav, type SideNavItem } from "./SideNav";
import { PortalTopbar, buildCrumbs } from "./PortalTopbar";
import { SocketProvider } from "@/components/realtime/SocketProvider";

// Bố cục theo ảnh mẫu `Screenshot 2026-09-12 134041.png` (panel 1 & 2): 4 mục
// điều hướng + nút "Đăng tin mới" ghim đáy sidebar. "Dashboard" tạm trỏ về
// danh sách tin (chưa có trang tổng quan riêng); "Ứng viên" thuộc Phase 8 nên
// để disable thay vì link chết.
const NAV_ITEMS: SideNavItem[] = [
  { label: "Tin tuyển dụng", icon: "briefcase", href: "/employer/jobs", matchNested: true },
  { label: "Tin nhắn", icon: "messages-square", href: "/employer/messages", matchNested: true },
  { label: "Hồ sơ công ty", icon: "building-2", href: "/employer/profile" },
  { label: "Gói dịch vụ", icon: "credit-card", href: "/employer/subscription", matchNested: true },
  { label: "Cài đặt", icon: "settings", href: "/employer/settings" },
];

const CRUMB_LABELS: Record<string, string> = {
  jobs: "Tin tuyển dụng",
  new: "Đăng tin mới",
  applications: "Ứng viên",
  messages: "Tin nhắn",
  profile: "Hồ sơ công ty",
  subscription: "Gói dịch vụ",
  notifications: "Thông báo",
  settings: "Cài đặt",
};

/**
 * App shell cho mọi trang trong `employer/(portal)`. `data-role="employer"` ở
 * thẻ ngoài cùng trỏ alias `brand-*` sang bảng màu Indigo, nên mọi component
 * bên trong (kể cả lồng sâu) tự lên đúng màu khu vực — xem AD-7.
 */
export function EmployerPortalShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useCurrentUser("employer");
  const { data: me } = useEmployerMe();
  const company = me?.company;

  async function handleLogout() {
    const refreshToken = useEmployerAuthStore.getState().refreshToken ?? undefined;
    try {
      await apiFetch("employer", "/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) });
    } catch {
      // Ưu tiên clear phía client ngay cả khi API logout thất bại.
    } finally {
      useEmployerAuthStore.getState().clear();
      router.push("/employer");
    }
  }

  return (
    <SocketProvider area="employer">
      <div data-role="employer" className="flex min-h-screen flex-col bg-surface-page">
        <PortalTopbar
          area="employer"
          roleLabel="Doanh nghiệp"
          homeHref="/employer/jobs"
          crumbs={buildCrumbs(pathname, { label: "Employer Portal", href: "/employer" }, CRUMB_LABELS)}
          userEmail={user?.email}
          accountHref="/employer/profile"
          onLogout={handleLogout}
        />

        <div className="flex flex-1 items-stretch">
          <SideNav
            items={NAV_ITEMS}
            header={
              <div className="grid gap-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-text-strong">
                  <Icon name="building-2" size={16} className="text-brand-600" />
                  <span className="truncate">{company?.name ?? "Employer Portal"}</span>
                </span>
                {company ? (
                  <Badge tone={company.isVerified ? "success" : "warning"}>
                    {company.isVerified ? "Đã xác minh" : "Chờ xác minh"}
                  </Badge>
                ) : null}
              </div>
            }
            footer={
              <Button as="a" href="/employer/jobs/new" icon="plus" fullWidth>
                Đăng tin mới
              </Button>
            }
          />

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </SocketProvider>
  );
}
