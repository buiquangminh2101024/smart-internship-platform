"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Icon } from "@/components/ui/Icon";
import { PortalLogo } from "./PortalTopbar";
import { SideNavList, type SideNavItem } from "./SideNav";

// Ngăn kéo điều hướng dưới `lg` cho Employer và Admin —
// docs/05-frontend/phases/mobile-shell/PLAN.md, bản mẫu docs/temp/ui-compare/mobile-nav-drawer.html.

const DESKTOP_QUERY = "(min-width: 1024px)";
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Trạng thái mở/đóng của ngăn kéo, dùng ở shell. Tự đóng khi đổi route và khi
 * màn hình rộng ra ≥ 1024px. `close()` là đóng do người dùng nên trả focus về nút ☰.
 */
export function useMobileNav() {
  const pathname = usePathname();
  const drawerId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [openPathname, setOpenPathname] = useState(pathname);

  // Đổi route (kể cả nút Back của trình duyệt) ⇒ đóng, điều chỉnh ngay trong render.
  if (openPathname !== pathname) {
    setOpenPathname(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const query = window.matchMedia(DESKTOP_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, [open]);

  // Trả focus sau khi commit, lúc phần trang phía sau đã hết `inert`.
  useEffect(() => {
    if (open || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    buttonRef.current?.focus();
  }, [open]);

  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => {
    restoreFocusRef.current = true;
    setOpen(false);
  }, []);

  return { open, show, close, drawerId, buttonRef };
}

export interface MobileNavDrawerProps {
  id: string;
  open: boolean;
  onClose: () => void;
  items: SideNavItem[];
  /** Cùng khối tiêu đề với `SideNav`. */
  header?: ReactNode;
  /** Cùng khối đáy với `SideNav` — vd. nút "Đăng tin mới". */
  footer?: ReactNode;
  roleLabel: string;
  homeHref: string;
  userEmail?: string | undefined;
  /** Link tới trang tài khoản/hồ sơ; bỏ trống thì email chỉ là text. */
  accountHref?: string | undefined;
  onLogout: () => void;
}

const ACCOUNT_ROW =
  "flex min-h-11 min-w-0 items-center gap-3 rounded-lg px-2.5 text-sm text-text-body focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500";

export function MobileNavDrawer({
  id,
  open,
  onClose,
  items,
  header,
  footer,
  roleLabel,
  homeHref,
  userEmail,
  accountHref,
  onLogout,
}: MobileNavDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();

    // Màn thấp: cuộn danh sách để mục đang mở nằm trong tầm nhìn.
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (list && active) {
      const top = active.offsetTop - list.offsetTop;
      const bottom = top + active.offsetHeight;
      if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 8;
      else if (top < list.scrollTop) list.scrollTop = Math.max(0, top - 8);
    }

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    // Khoá cuộn trang phía sau, cùng cách `ConfirmDialog`.
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = "unset";
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  // Focus chỉ đi vòng trong ngăn kéo.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // Chọn một link bất kỳ (kể cả trang đang mở, khi route không đổi) ⇒ đóng.
  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("a[href]")) onClose();
  }

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-text-strong/45 transition-opacity duration-200 motion-reduce:transition-none lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label="Menu điều hướng"
        inert={!open}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85%] flex-col border-r border-l-[3px] border-border-subtle border-l-brand-500 bg-surface-card shadow-[0_10px_30px_rgba(11,31,27,0.18)] motion-reduce:[transition:none] lg:hidden ${
          open
            ? "visible translate-x-0 [transition:translate_200ms_cubic-bezier(0.2,0.8,0.2,1)]"
            : "invisible -translate-x-full [transition:translate_200ms_cubic-bezier(0.2,0.8,0.2,1),visibility_0s_linear_200ms]"
        }`}
      >
        <div className="flex h-16 flex-none items-center justify-between gap-2 border-b border-border-subtle pr-3 pl-4">
          <PortalLogo homeHref={homeHref} roleLabel={roleLabel} />
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Đóng menu"
            onClick={onClose}
            className="inline-grid h-10 w-10 flex-none cursor-pointer place-items-center rounded-lg text-text-body transition-colors hover:bg-brand-50 hover:text-brand-700"
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        {header ? <div className="flex-none px-5 pt-4 pb-3">{header}</div> : null}

        <nav
          ref={listRef}
          aria-label="Điều hướng chính"
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pt-1 pb-2"
        >
          <SideNavList items={items} size="drawer" />
        </nav>

        <div className="grid flex-none grid-cols-[minmax(0,1fr)] gap-2 border-t border-border-subtle px-3 pt-3 pb-4">
          {footer}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
            {userEmail ? (
              accountHref ? (
                <Link
                  href={accountHref}
                  title={userEmail}
                  className={`${ACCOUNT_ROW} transition-colors hover:bg-surface-hover hover:text-text-strong`}
                >
                  <Icon name="circle-user" size={18} className="flex-none text-text-muted" />
                  <span className="truncate">{userEmail}</span>
                </Link>
              ) : (
                <span title={userEmail} className={ACCOUNT_ROW}>
                  <Icon name="circle-user" size={18} className="flex-none text-text-muted" />
                  <span className="truncate">{userEmail}</span>
                </span>
              )
            ) : null}
            <button
              type="button"
              onClick={onLogout}
              className={`${ACCOUNT_ROW} cursor-pointer transition-colors hover:bg-surface-hover hover:text-text-strong`}
            >
              <Icon name="log-out" size={18} className="flex-none text-text-muted" />
              Đăng xuất
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
