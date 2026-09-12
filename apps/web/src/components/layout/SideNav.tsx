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
}

export interface SideNavProps {
  items: SideNavItem[];
  /** Khối tiêu đề trên cùng (tên công ty / "Admin Panel"). */
  header?: ReactNode;
  /** Khối dưới cùng, ghim xuống đáy — vd. nút "Đăng tin mới". */
  footer?: ReactNode;
}

/**
 * Điều hướng dọc của app shell — port từ `docs/template_ui/components/navigation/SideNav.jsx`
 * sang Tailwind + Next `Link`, thay `value`/`onChange` bằng `usePathname()` vì
 * mỗi mục ở đây là một route thật.
 *
 * Màu mục đang mở và viền trái dùng alias `brand-*` nên tự đổi theo `data-role`
 * mà app shell đặt ở thẻ bọc ngoài (indigo cho Employer, plum cho Admin — xem
 * AD-7); component không cần biết mình đang ở khu vực nào.
 */
export function SideNav({ items, header, footer }: SideNavProps) {
  const pathname = usePathname();

  function isActive(item: SideNavItem): boolean {
    if (!item.href) return false;
    return item.matchNested ? pathname.startsWith(item.href) : pathname === item.href;
  }

  return (
    <nav className="flex w-60 flex-none flex-col gap-1 border-r border-l-[3px] border-border-subtle border-l-brand-500 bg-surface-card px-3 py-5">
      {header ? <div className="px-2 pb-4">{header}</div> : null}

      {items.map((item) => {
        const label = (
          <>
            <Icon
              name={item.icon}
              size={18}
              className={isActive(item) ? "text-brand-600" : "text-text-muted"}
            />
            <span className="flex-1">{item.label}</span>
            {item.soon ? (
              <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[11px] font-medium text-text-subtle">
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
              className="flex min-h-[38px] cursor-not-allowed items-center gap-3 rounded-lg px-2 text-sm text-text-subtle"
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
            className={`flex min-h-[38px] items-center gap-3 rounded-lg px-2 text-sm transition-colors ${
              isActive(item)
                ? "bg-brand-50 font-medium text-brand-700"
                : "text-text-body hover:bg-surface-hover hover:text-text-strong"
            }`}
          >
            {label}
          </Link>
        );
      })}

      {footer ? <div className="mt-auto pt-4">{footer}</div> : null}
    </nav>
  );
}
