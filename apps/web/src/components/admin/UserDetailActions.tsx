"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { AdminUserAccount } from "@sip/shared-types";
import { Icon } from "@/components/ui/Icon";
import { DashButton } from "@/components/dashboard/DashButton";

export type UserDetailAction = "suspend" | "reactivate" | "revoke" | "activate" | "guide";

interface ActionItem {
  key: UserDetailAction;
  label: string;
  icon: string;
  /** Có thì nút bị tắt, câu này giải thích vì sao. */
  disabledNote?: string;
}

/**
 * Nút chỉ có khi API cho phép (plan FE, quyết định 4). Phần tử đầu là nút chính
 * theo trạng thái: Khoá (`ACTIVE`), Kích hoạt (`PENDING_VERIFICATION`), Mở khoá
 * (`SUSPENDED`). Tài khoản quản trị không có thao tác nào (E8).
 */
function actionsFor(account: AdminUserAccount): ActionItem[] {
  if (account.role === "ADMIN") return [];
  if (account.status === "SUSPENDED") return [{ key: "reactivate", label: "Mở khoá", icon: "lock-open" }];

  const suspend: ActionItem = { key: "suspend", label: "Khoá tài khoản", icon: "lock" };
  const guide: ActionItem = {
    key: "guide",
    label: "Gửi hướng dẫn đặt lại mật khẩu",
    icon: "key-round",
    ...(account.hasPassword ? {} : { disabledNote: "Tài khoản chỉ đăng nhập bằng Google" }),
  };
  if (account.status === "PENDING_VERIFICATION") {
    return [{ key: "activate", label: "Kích hoạt thủ công", icon: "user-check" }, suspend, guide];
  }
  return [suspend, { key: "revoke", label: "Buộc đăng xuất", icon: "log-out" }, guide];
}

const PRIMARY_VARIANT: Record<UserDetailAction, "primary" | "danger"> = {
  suspend: "danger",
  reactivate: "primary",
  activate: "primary",
  revoke: "danger",
  guide: "primary",
};

/** Nhóm nút ở đầu trang chi tiết: nút chính để ngoài, còn lại vào "Thao tác khác". */
export function UserDetailActions({
  account,
  onAction,
}: {
  account: AdminUserAccount;
  onAction: (action: UserDetailAction) => void;
}) {
  const items = actionsFor(account);
  const [primary, ...rest] = items;
  if (!primary) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DashButton
        variant={PRIMARY_VARIANT[primary.key]}
        icon={primary.icon}
        onClick={() => onAction(primary.key)}
      >
        {primary.label}
      </DashButton>
      {rest.length > 0 ? <MoreActions items={rest} onAction={onAction} /> : null}
    </div>
  );
}

/**
 * "Thao tác khác": nút mở / đóng danh sách nút (disclosure, không phải `role="menu"`
 * nên Tab đi qua từng nút như thường). Esc, bấm ra ngoài hoặc focus rời khỏi
 * khối thì đóng; chọn một mục thì trả focus về nút mở trước khi mở hộp thoại,
 * để đóng hộp thoại xong focus quay lại đúng chỗ.
 */
function MoreActions({ items, onAction }: { items: ActionItem[]; onAction: (action: UserDetailAction) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    rootRef.current?.querySelector<HTMLButtonElement>("[data-more-item]")?.focus();
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-border-default bg-surface-card px-4 text-sm font-semibold whitespace-nowrap text-text-strong transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none"
      >
        Thao tác khác
        <Icon name="chevron-down" size={16} className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <ul
          id={listId}
          className="absolute top-full right-0 z-30 mt-1.5 grid w-[min(300px,calc(100vw-32px))] gap-0.5 rounded-xl border border-border-subtle bg-surface-card p-1.5 shadow-[0_12px_32px_rgba(11,31,27,0.14)]"
        >
          {items.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                data-more-item
                // `aria-disabled` thay vì `disabled`: vẫn Tab tới được để nghe lý do bị tắt.
                aria-disabled={item.disabledNote !== undefined || undefined}
                aria-describedby={item.disabledNote ? `${listId}-${item.key}-note` : undefined}
                onClick={() => {
                  if (item.disabledNote) return;
                  setOpen(false);
                  triggerRef.current?.focus();
                  onAction(item.key);
                }}
                className={`grid w-full cursor-pointer grid-cols-[18px_minmax(0,1fr)] items-start gap-x-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent ${
                  item.key === "suspend" || item.key === "revoke" ? "text-red-700" : "text-text-strong"
                }`}
              >
                <Icon name={item.icon} size={18} className={`mt-px ${item.disabledNote ? "text-text-subtle" : ""}`} />
                <span className={`font-medium ${item.disabledNote ? "text-text-subtle" : ""}`}>{item.label}</span>
                {item.disabledNote ? (
                  <span id={`${listId}-${item.key}-note`} className="col-start-2 text-[13px] text-text-muted">
                    {item.disabledNote}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
