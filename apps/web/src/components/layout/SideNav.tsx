"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

export interface SideNavItem {
  label: string;
  icon: string;
  /** Đích điều hướng. Bỏ trống khi mục thuộc phase sau (`soon`). */
  href?: string;
  /** Tính năng chưa xây (Phase 8/10) — render disable kèm nhãn "Sắp có". */
  soon?: boolean;
  /**
   * Khớp cả route con (`/employer/jobs/new` vẫn tô sáng mục "Tin tuyển dụng").
   * Mặc định chỉ khớp chính xác `href`.
   */
  matchNested?: boolean;
  /** Số việc đang chờ ở mục này; 0 hoặc bỏ trống thì không hiện. */
  badge?: number;
  /** `attention` = marigold (việc chờ người xử lý, dùng ở Admin); mặc định theo màu khu vực. */
  badgeTone?: "brand" | "attention";
  /** Nhãn đọc cho trình đọc màn hình, vd. "19 hồ sơ chờ xử lý". Mặc định chỉ đọc số. */
  badgeLabel?: string;
}

export interface SideNavProps {
  items: SideNavItem[];
  /** Khối tiêu đề trên cùng (tên công ty / "Admin Panel"). */
  header?: ReactNode;
  /** Khối dưới cùng, ghim xuống đáy — vd. nút "Đăng tin mới". */
  footer?: ReactNode;
}

/**
 * Tông chấm trên nút ☰ của topbar khi có mục còn việc chờ (`badge > 0`):
 * `attention` nếu có mục marigold, còn lại theo màu khu vực; `null` khi không có việc chờ.
 */
export function pendingBadgeTone(items: SideNavItem[]): "brand" | "attention" | null {
  const pending = items.filter((item) => item.badge);
  if (pending.length === 0) return null;
  return pending.some((item) => item.badgeTone === "attention") ? "attention" : "brand";
}

/**
 * Danh sách mục điều hướng, dùng chung cho sidebar (`rail`, mục cao 38px) và
 * ngăn kéo trên điện thoại (`drawer`, mục cao 44px — vùng chạm đủ lớn).
 */
export function SideNavList({ items, size = "rail" }: { items: SideNavItem[]; size?: "rail" | "drawer" }) {
  const pathname = usePathname();
  const drawer = size === "drawer";
  const row = drawer
    ? "flex min-h-11 items-center gap-3 rounded-lg px-2.5 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
    : "flex min-h-[38px] items-center gap-3 rounded-lg px-2 text-sm";
  const pill = drawer ? "text-[13px]" : "text-xs";

  function isActive(item: SideNavItem): boolean {
    if (!item.href) return false;
    return item.matchNested ? pathname.startsWith(item.href) : pathname === item.href;
  }

  return items.map((item) => {
    const label = (
      <>
        <Icon
          name={item.icon}
          size={18}
          className={isActive(item) ? "text-brand-600" : "text-text-muted"}
        />
        <span className="flex-1">{item.label}</span>
        {item.badge ? (
          <>
            <span
              aria-hidden
              className={`min-w-6 rounded-full px-1.5 py-0.5 text-center font-mono font-semibold tabular-nums ${pill} ${
                item.badgeTone === "attention" ? "bg-marigold-100 text-marigold-800" : "bg-brand-100 text-brand-800"
              }`}
            >
              {item.badge > 99 ? "99+" : item.badge}
            </span>
            <span className="sr-only">, {item.badgeLabel ?? item.badge}</span>
          </>
        ) : null}
        {item.soon ? (
          <span
            className={`rounded-full bg-surface-hover px-2 py-0.5 font-medium text-text-subtle ${
              drawer ? "text-[13px]" : "text-[11px]"
            }`}
          >
            Sắp có
          </span>
        ) : null}
      </>
    );

    if (item.soon || !item.href) {
      return (
        <span
          key={item.label}
          aria-disabled
          title="Tính năng sẽ có ở phase sau"
          className={`${row} cursor-not-allowed text-text-subtle`}
        >
          {label}
        </span>
      );
    }

    return (
      <Link
        key={item.label}
        href={item.href}
        aria-current={isActive(item) ? "page" : undefined}
        className={`${row} transition-colors ${
          isActive(item)
            ? "bg-brand-50 font-medium text-brand-700 shadow-[inset_3px_0_0_var(--color-brand-600)]"
            : "text-text-body hover:bg-surface-hover hover:text-text-strong"
        }`}
      >
        {label}
      </Link>
    );
  });
}

/**
 * Điều hướng dọc của app shell — port từ `docs/template_ui/components/navigation/SideNav.jsx`
 * sang Tailwind + Next `Link`, thay `value`/`onChange` bằng `usePathname()` vì
 * mỗi mục ở đây là một route thật. Chỉ hiện từ `lg` (1024px); hẹp hơn thì
 * `MobileNavDrawer` thay thế (docs/05-frontend/phases/mobile-shell/PLAN.md).
 *
 * Màu mục đang mở và viền trái dùng alias `brand-*` nên tự đổi theo `data-role`
 * mà app shell đặt ở thẻ bọc ngoài (indigo cho Employer, plum cho Admin — xem
 * AD-7); component không cần biết mình đang ở khu vực nào.
 */
export function SideNav({ items, header, footer }: SideNavProps) {
  return (
    <nav className="hidden w-60 flex-none flex-col gap-1 border-r border-l-[3px] border-border-subtle border-l-brand-500 bg-surface-card px-3 py-5 lg:flex">
      {header ? <div className="px-2 pb-4">{header}</div> : null}

      <SideNavList items={items} />

      {footer ? <div className="mt-auto pt-4">{footer}</div> : null}
    </nav>
  );
}
