"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { AuthArea } from "@/lib/auth-area";
import { NotificationBell } from "./NotificationBell";

export interface Crumb {
  label: string;
  /** Bỏ trống ở mục cuối (trang đang mở) để render dạng text. */
  href?: string;
}

/**
 * Dựng breadcrumb từ pathname. `labels` map từng segment sang nhãn tiếng Việt;
 * segment không có trong map được coi là id động (`/jobs/<uuid>`) và hiển thị
 * "Chi tiết".
 */
export function buildCrumbs(pathname: string, root: Crumb, labels: Record<string, string>): Crumb[] {
  const rootHref = root.href ?? "/";
  const rest = pathname.startsWith(rootHref) ? pathname.slice(rootHref.length) : pathname;
  const segments = rest.split("/").filter(Boolean);

  const crumbs: Crumb[] = [root];
  let href = rootHref;
  for (const segment of segments) {
    href = `${href}/${segment}`;
    crumbs.push({ label: labels[segment] ?? "Chi tiết", href });
  }
  // Mục cuối là trang đang mở — không cần link về chính nó.
  const last = crumbs[crumbs.length - 1];
  if (last && crumbs.length > 1) delete last.href;
  return crumbs;
}

export interface PortalTopbarProps {
  /** Nhãn phụ cạnh logo: "Doanh nghiệp" / "Quản trị". */
  roleLabel: string;
  /** Quyết định store token + trang danh sách thông báo dùng cho chuông. */
  area: AuthArea;
  homeHref: string;
  crumbs: Crumb[];
  userEmail?: string | undefined;
  /** Link tới trang tài khoản/hồ sơ; bỏ trống thì email chỉ là text. */
  accountHref?: string | undefined;
  onLogout: () => void;
}

/**
 * Thanh trên của app shell. Bản tối giản so với ảnh mẫu: **không** có ô tìm
 * kiếm toàn cục (chưa có API); gồm logo, breadcrumb, chuông thông báo (Phase 10),
 * email và đăng xuất.
 *
 * Màu thương hiệu (logo, chip role) dùng alias `brand-*`, đổi theo `data-role`
 * của app shell bọc ngoài — xem AD-7.
 */
export function PortalTopbar({
  roleLabel,
  area,
  homeHref,
  crumbs,
  userEmail,
  accountHref,
  onLogout,
}: PortalTopbarProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-border-subtle bg-white/95 backdrop-blur">
      <div className="flex h-16 items-center gap-6 px-6">
        <Link href={homeHref} className="flex items-center gap-2 text-lg font-semibold text-brand-700">
          InternHub
          <span className="rounded-md bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
            {roleLabel}
          </span>
        </Link>

        <nav aria-label="Breadcrumb" className="hidden flex-1 items-center gap-1 text-sm text-text-muted md:flex">
          {crumbs.map((crumb, index) => (
            <span key={crumb.label + index} className="flex items-center gap-1">
              {index > 0 ? <Icon name="chevron-right" size={14} className="text-text-subtle" /> : null}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-text-strong">
                  {crumb.label}
                </Link>
              ) : (
                <span className="font-medium text-text-strong">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <NotificationBell area={area} />
          {userEmail ? (
            accountHref ? (
              <Button as="a" href={accountHref} variant="ghost" size="sm" icon="circle-user">
                {userEmail}
              </Button>
            ) : (
              <span className="flex items-center gap-2 px-2 text-sm text-text-body">
                <Icon name="circle-user" size={16} />
                {userEmail}
              </span>
            )
          ) : null}
          <Button variant="ghost" size="sm" onClick={onLogout}>
            Đăng xuất
          </Button>
        </div>
      </div>
    </header>
  );
}
