"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { apiFetch } from "@/lib/api-client";
import { useEmployerMe } from "@/hooks/useEmployerMe";
import { useEmployerDashboardOverview } from "@/hooks/useEmployerDashboard";
import { useCurrentUser, useEmployerAuthStore } from "@/stores/auth-store";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { MobileNavDrawer, useMobileNav } from "./MobileNavDrawer";
import { SideNav, pendingBadgeTone, type SideNavItem } from "./SideNav";
import { PortalTopbar, buildCrumbs } from "./PortalTopbar";
import { SocketProvider } from "@/components/realtime/SocketProvider";

// Bố cục theo ảnh mẫu `Screenshot 2026-09-12 134041.png` (panel 1 & 2): các mục
// điều hướng + nút "Đăng tin mới" ghim đáy sidebar. "Tổng quan" là dashboard
// AD-16 — số hồ sơ chờ xử lý hiện ngay trên mục này.
const NAV_ITEMS: SideNavItem[] = [
  { label: "Tổng quan", icon: "layout-dashboard", href: "/employer/dashboard" },
  { label: "Tin tuyển dụng", icon: "briefcase", href: "/employer/jobs", matchNested: true },
  { label: "Lịch phỏng vấn", icon: "calendar-days", href: "/employer/interviews" },
  { label: "Lời mời", icon: "send", href: "/employer/outreach" },
  { label: "Tin nhắn", icon: "messages-square", href: "/employer/messages", matchNested: true },
  { label: "Hồ sơ công ty", icon: "building-2", href: "/employer/profile" },
  { label: "Gói dịch vụ", icon: "credit-card", href: "/employer/subscription", matchNested: true },
  { label: "Cài đặt", icon: "settings", href: "/employer/settings" },
];

const CRUMB_LABELS: Record<string, string> = {
  dashboard: "Tổng quan",
  jobs: "Tin tuyển dụng",
  new: "Đăng tin mới",
  applications: "Ứng viên",
  interviews: "Lịch phỏng vấn",
  outreach: "Lời mời",
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
  // Cùng queryKey với trang Tổng quan nên không gọi API hai lần; chỉ gọi khi
  // công ty đã xác minh (trước đó portal chỉ mở trang hồ sơ công ty).
  const { data: overview } = useEmployerDashboardOverview(me?.stage === "ACTIVE");
  const pendingCount = overview?.applications.pendingCount ?? 0;
  const navItems = NAV_ITEMS.map((item) =>
    item.href === "/employer/dashboard"
      ? { ...item, badge: pendingCount, badgeLabel: `${pendingCount} hồ sơ chờ xử lý` }
      : item,
  );

  const mobileNav = useMobileNav();

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

  const newJobButton = (
    <Button as="a" href="/employer/jobs/new" icon="plus" fullWidth>
      Đăng tin mới
    </Button>
  );

  return (
    <SocketProvider area="employer">
      <div data-role="employer" className="flex min-h-screen flex-col bg-surface-page">
        {/* Ngăn kéo mở ⇒ topbar và nội dung phía sau `inert` (mobile-shell PLAN). */}
        <div inert={mobileNav.open} className="flex flex-1 flex-col">
          <PortalTopbar
            area="employer"
            roleLabel="Doanh nghiệp"
            homeHref="/employer/dashboard"
            crumbs={buildCrumbs(pathname, { label: "Employer Portal", href: "/employer" }, CRUMB_LABELS)}
            userEmail={user?.email}
            accountHref="/employer/profile"
            onLogout={handleLogout}
            menu={{
              open: mobileNav.open,
              onOpen: mobileNav.show,
              controlsId: mobileNav.drawerId,
              pendingTone: pendingBadgeTone(navItems),
            }}
            menuButtonRef={mobileNav.buttonRef}
          />

          <div className="flex flex-1 items-stretch">
            <SideNav items={navItems} header={<CompanyHeader company={company} />} footer={newJobButton} />

            <main className="min-w-0 flex-1">{children}</main>
          </div>
        </div>

        <MobileNavDrawer
          id={mobileNav.drawerId}
          open={mobileNav.open}
          onClose={mobileNav.close}
          items={navItems}
          header={<CompanyHeader company={company} wrap />}
          footer={newJobButton}
          roleLabel="Doanh nghiệp"
          homeHref="/employer/dashboard"
          userEmail={user?.email}
          accountHref="/employer/profile"
          onLogout={handleLogout}
        />
      </div>
    </SocketProvider>
  );
}

/** Tên công ty kèm huy hiệu xác minh. `wrap`: tên dài xuống tối đa 2 dòng (ngăn kéo) thay vì cắt. */
function CompanyHeader({
  company,
  wrap = false,
}: {
  company: { name: string; isVerified: boolean } | undefined;
  wrap?: boolean;
}) {
  return (
    <div className={`grid gap-1 ${wrap ? "justify-items-start" : ""}`}>
      <span className={`flex gap-2 text-sm font-semibold text-text-strong ${wrap ? "items-start" : "items-center"}`}>
        <Icon name="building-2" size={16} className={`flex-none text-brand-600 ${wrap ? "mt-0.5" : ""}`} />
        <span className={wrap ? "line-clamp-2 break-words" : "truncate"}>{company?.name ?? "Employer Portal"}</span>
      </span>
      {company ? (
        <Badge tone={company.isVerified ? "success" : "warning"}>
          {company.isVerified ? "Đã xác minh" : "Chờ xác minh"}
        </Badge>
      ) : null}
    </div>
  );
}
