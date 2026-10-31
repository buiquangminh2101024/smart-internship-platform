"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

export interface DrawerTab<T extends string> {
  key: T;
  label: string;
}

/**
 * Ngăn kéo chi tiết bên phải (rộng tối đa 480px, toàn màn hình dưới `lg`), dùng
 * `<dialog>` gốc với `showModal`: trình duyệt lo lớp phủ, bẫy focus và Esc.
 * Render tại chỗ (không portal) để giữ màu `brand-*` của khu vực Admin. Trang
 * lo việc trả focus về dòng đã mở.
 */
export function ActivityDetailDrawer<T extends string>({
  open,
  onClose,
  title,
  subtitle,
  tabs,
  tab,
  onTabChange,
  actions,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode | undefined;
  /** Bỏ trống thì không có hàng tab. */
  tabs?: DrawerTab<T>[] | undefined;
  tab?: T;
  onTabChange?: (tab: T) => void;
  /** Nút phụ ở đầu ngăn kéo (vd. "Sao chép liên kết tới dòng này"). */
  actions?: ReactNode | undefined;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const tabRefs = useRef(new Map<T, HTMLButtonElement>());

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      document.body.style.overflow = "hidden";
    } else if (!open && dialog.open) {
      dialog.close();
      document.body.style.overflow = "";
    }
  }, [open]);

  useEffect(
    () => () => {
      document.body.style.overflow = "";
    },
    [],
  );

  function handleTabKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!tabs || !tab || !onTabChange) return;
    const index = tabs.findIndex((item) => item.key === tab);
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    const key = tabs[next]!.key;
    onTabChange(key);
    tabRefs.current.get(key)?.focus();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="activity-drawer-title"
      onCancel={(event) => {
        // Esc: trạng thái mở do React giữ, nên chặn đóng mặc định rồi báo lên.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Bấm lớp phủ (vùng ngoài khung) thì đóng; không có gì đang nhập nên không sợ mất dữ liệu.
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-screen max-w-none flex-col overflow-hidden bg-surface-card p-0 text-sm text-text-body shadow-[-12px_0_40px_rgba(11,31,27,0.18)] open:flex backdrop:bg-[rgba(11,31,27,0.45)] lg:w-[480px]"
    >
      {open ? (
        <>
          <div className="flex flex-none items-start gap-3 border-b border-border-subtle px-5 pt-4 pb-3">
            <div className="min-w-0 flex-1">
              <h2 id="activity-drawer-title" className="text-lg leading-[1.3] font-bold text-text-strong">
                {title}
              </h2>
              {subtitle ? <p className="mt-0.5 text-[13px] text-text-muted">{subtitle}</p> : null}
              {actions ? <div className="mt-2 flex flex-wrap gap-2">{actions}</div> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng ngăn kéo"
              className="-mt-1 -mr-2 grid h-10 w-10 flex-none cursor-pointer place-items-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-strong focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <Icon name="x" size={20} />
            </button>
          </div>

          {tabs && tab && onTabChange ? (
            <div
              role="tablist"
              aria-label="Nội dung ngăn kéo"
              onKeyDown={handleTabKey}
              className="flex flex-none gap-1 overflow-x-auto border-b border-border-subtle px-3"
            >
              {tabs.map((item) => {
                const selected = item.key === tab;
                return (
                  <button
                    key={item.key}
                    ref={(node) => {
                      if (node) tabRefs.current.set(item.key, node);
                      else tabRefs.current.delete(item.key);
                    }}
                    type="button"
                    role="tab"
                    id={`activity-tab-${item.key}`}
                    aria-selected={selected}
                    aria-controls="activity-tabpanel"
                    tabIndex={selected ? 0 : -1}
                    onClick={() => onTabChange(item.key)}
                    className={`-mb-px h-11 cursor-pointer border-b-2 px-2.5 text-[13px] font-bold whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none ${
                      selected ? "border-brand-600 text-brand-700" : "border-transparent text-text-muted hover:text-text-strong"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div
            id="activity-tabpanel"
            role={tabs ? "tabpanel" : undefined}
            aria-labelledby={tabs && tab ? `activity-tab-${tab}` : undefined}
            tabIndex={tabs ? 0 : undefined}
            className="min-h-0 flex-1 overflow-y-auto px-5 py-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
          >
            {children}
          </div>
        </>
      ) : null}
    </dialog>
  );
}
