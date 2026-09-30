"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Icon } from "./Icon";

type Size = "sm" | "md" | "lg";

const sizeClasses: Record<Size, string> = {
  sm: "w-[min(480px,calc(100vw-32px))]",
  md: "w-[min(560px,calc(100vw-32px))]",
  lg: "w-[min(720px,calc(100vw-32px))]",
};

export interface DialogProps {
  open: boolean;
  /** Esc hoặc nút đóng. Không gọi khi `busy`. */
  onClose: () => void;
  /** id của tiêu đề (`DialogHeader`). */
  labelledBy: string;
  describedBy?: string;
  size?: Size;
  /** Toàn màn hình ở ≤ 480px (hộp thoại có nhiều trường nhập). */
  fullScreenOnMobile?: boolean;
  /** Đang gửi: chặn Esc để không đóng giữa chừng. */
  busy?: boolean;
  /** id của phần tử nhận focus khi mở; bỏ trống thì trình duyệt focus phần tử đầu tiên. */
  initialFocusId?: string;
  children: ReactNode;
}

/**
 * Khung hộp thoại dùng `<dialog>` gốc (`showModal`): trình duyệt lo lớp phủ,
 * bẫy focus, Esc và trả focus về nút đã mở khi đóng. Render tại chỗ (không
 * portal) để giữ `data-role` của khu vực — màu `brand-*` đúng theo actor.
 * Không đóng khi bấm ra ngoài để không mất dữ liệu đang nhập.
 */
export function Dialog({
  open,
  onClose,
  labelledBy,
  describedBy,
  size = "md",
  fullScreenOnMobile = false,
  busy = false,
  initialFocusId,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      if (initialFocusId) document.getElementById(initialFocusId)?.focus();
      document.body.style.overflow = "hidden";
    } else if (!open && dialog.open) {
      dialog.close();
      document.body.style.overflow = "";
    }
  }, [open, initialFocusId]);

  // Gỡ khoá cuộn nếu hộp thoại bị gỡ khỏi trang khi còn mở.
  useEffect(
    () => () => {
      document.body.style.overflow = "";
    },
    [],
  );

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(event) => {
        // Esc: trạng thái mở do React giữ, nên chặn đóng mặc định rồi báo lên.
        event.preventDefault();
        if (!busy) onClose();
      }}
      className={[
        "m-auto max-h-[calc(100dvh-32px)] max-w-none flex-col overflow-hidden rounded-xl bg-surface-card p-0 text-sm text-text-body",
        "shadow-[0_24px_64px_rgba(11,31,27,0.28)] open:flex backdrop:bg-[rgba(11,31,27,0.45)]",
        sizeClasses[size],
        fullScreenOnMobile
          ? "max-[480px]:m-0 max-[480px]:h-dvh max-[480px]:max-h-dvh max-[480px]:w-screen max-[480px]:rounded-none"
          : "",
      ].join(" ")}
    >
      {open ? children : null}
    </dialog>
  );
}

export function DialogHeader({
  titleId,
  title,
  subtitle,
  subtitleId,
  onClose,
  closeDisabled = false,
  titleRef,
  children,
}: {
  titleId: string;
  title: ReactNode;
  subtitle?: ReactNode;
  subtitleId?: string;
  /** Có thì hiện nút ✕. */
  onClose?: () => void;
  closeDisabled?: boolean;
  /** Để chuyển focus về tiêu đề (vd. khi đổi bước). */
  titleRef?: RefObject<HTMLHeadingElement | null>;
  /** Nội dung dưới tiêu đề (vd. thanh bước). */
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border-subtle px-6 pt-5 pb-3.5 max-[480px]:px-4 max-[480px]:pt-4 max-[480px]:pb-3">
      <div className="min-w-0 flex-1">
        <h2 ref={titleRef} id={titleId} tabIndex={-1} className="text-lg leading-[1.3] font-bold text-text-strong outline-none">
          {title}
        </h2>
        {subtitle ? (
          <p id={subtitleId} className="mt-0.5 text-text-muted">
            {subtitle}
          </p>
        ) : null}
        {children}
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          disabled={closeDisabled}
          aria-label="Đóng"
          className="-mt-2 -mr-3 grid h-10 w-10 flex-none cursor-pointer place-items-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="x" size={20} />
        </button>
      ) : null}
    </div>
  );
}

export function DialogBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-1 flex-col gap-4 overflow-auto px-6 pt-4 pb-5 max-[480px]:p-4 ${className}`}>{children}</div>
  );
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle bg-surface-card px-6 py-3 max-[480px]:px-4">
      {children}
    </div>
  );
}
