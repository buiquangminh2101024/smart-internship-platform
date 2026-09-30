import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { formatNumber } from "@/lib/dashboard-format";

export interface TaskGroupProps {
  /** id của khối — dùng cho liên kết neo (vd. nút của banner). */
  id?: string;
  title: string;
  count: number;
  /**
   * `attention` (mặc định): việc đang chờ người xử lý — viền trên và số đếm
   * marigold. `brand`: nhóm thông tin (vd. lịch phỏng vấn sắp tới).
   */
  tone?: "attention" | "brand";
  /** Câu hiện khi không có hàng nào: nêu sự thật rồi gợi ý bước tiếp. */
  emptyText: string;
  /** Liên kết "Xem tất cả N …" khi còn nhiều hơn số hàng đang hiện. */
  footer?: ReactNode;
  /** Hàng công cụ giữa đầu khối và danh sách (vd. "Chọn tất cả"). */
  toolbar?: ReactNode;
  children?: ReactNode;
}

/** Nhóm "việc cần làm" (bản C): thẻ trắng viền trên 3px, hàng nền xám bo 8px. */
export function TaskGroup({ id, title, count, tone = "attention", emptyText, footer, toolbar, children }: TaskGroupProps) {
  const headingId = id ? `${id}-title` : undefined;
  const hasRows = Boolean(children) && (!Array.isArray(children) || children.length > 0);
  const attention = tone === "attention";

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`flex scroll-mt-24 flex-col gap-3 rounded-xl border border-t-[3px] border-border-subtle bg-surface-card p-4 text-sm ${
        attention ? "border-t-marigold-500" : "border-t-brand-600"
      }`}
    >
      <header className="flex items-center justify-between gap-3">
        <h3 id={headingId} className="text-base font-bold text-text-strong">
          {title}
        </h3>
        <span
          className={`inline-flex h-[26px] min-w-[34px] items-center justify-center rounded-full px-2 font-num text-[15px] font-bold tabular-nums ${
            attention ? "bg-marigold-100 text-marigold-800" : "bg-brand-100 text-brand-700"
          }`}
        >
          {formatNumber(count)}
        </span>
      </header>
      {hasRows && toolbar ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-2 text-text-muted">
          {toolbar}
        </div>
      ) : null}
      {hasRows ? <ul className="flex flex-col gap-2">{children}</ul> : <p className="text-text-muted">{emptyText}</p>}
      {footer ? <div className="mt-2 font-semibold">{footer}</div> : null}
    </section>
  );
}

export interface TaskRowProps {
  /** Ô "mặt": chữ cái đầu tên ứng viên / công ty. Bỏ trống thì dùng `icon`. */
  initials?: string;
  icon?: string;
  title: ReactNode;
  meta?: ReactNode;
  /** Trạng thái sau khi đã xử lý. */
  badge?: ReactNode;
  actions?: ReactNode;
  /** Hàng đã xử lý: nhạt đi, giữ chỗ tới lần tải lại. */
  done?: boolean;
  /** Ô chọn đầu hàng (chọn nhiều để lên lịch hàng loạt). */
  select?: ReactNode;
  selected?: boolean;
}

export function TaskRow({ initials, icon, title, meta, badge, actions, done = false, select, selected = false }: TaskRowProps) {
  return (
    <li
      // Có ô chọn: khoảng cách hẹp hơn để ô chọn + mặt + tên còn chung một dòng ở màn hẹp.
      className={`flex flex-wrap items-center justify-between gap-y-2 rounded-lg border p-3 ${select ? "gap-x-3" : "gap-x-4"} ${
        done
          ? "border-border-subtle bg-surface-card"
          : selected
            ? "border-brand-200 bg-brand-50"
            : "border-transparent bg-surface-page"
      }`}
    >
      {select}
      {initials !== undefined ? (
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-[13px] font-bold text-brand-700"
        >
          {initials}
        </span>
      ) : icon ? (
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border-subtle bg-surface-card text-text-muted"
        >
          <Icon name={icon} size={16} />
        </span>
      ) : null}
      <div className={`flex min-w-0 flex-col ${select ? "flex-[1_1_140px]" : "flex-[1_1_180px]"}`}>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 font-bold text-text-strong">{title}</span>
          {badge}
        </div>
        {meta ? <div className="text-text-muted">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </li>
  );
}

/** Nhãn trạng thái trong hàng (cao 22px, chữ 13px đậm). */
export function TaskBadge({ tone, children }: { tone: "brand" | "danger" | "warning" | "success"; children: ReactNode }) {
  const toneClass =
    tone === "brand"
      ? "bg-brand-100 text-brand-700"
      : tone === "danger"
        ? "bg-red-100 text-red-700"
        : tone === "success"
          ? "bg-success-100 text-success-700"
          : "bg-marigold-100 text-marigold-800";
  return (
    <span className={`inline-flex h-[22px] items-center rounded-full px-2 text-[13px] font-bold whitespace-nowrap ${toneClass}`}>
      {children}
    </span>
  );
}
