"use client";

import Link from "next/link";
import { useState, type KeyboardEvent } from "react";
import type { AuditActivityItem } from "@sip/shared-types";
import { actionLabel, entityHref } from "@/lib/audit-activity";
import { formatNumber, formatVnDate, formatVnTime } from "@/lib/dashboard-format";
import { Icon } from "@/components/ui/Icon";
import { BlockError } from "@/components/dashboard/BlockState";
import { DashButton } from "@/components/dashboard/DashButton";
import { ActorCell, GroupSwatch } from "./ActivityMeta";

const SKELETON_ROWS = 8;

export function activityRowDomId(id: string): string {
  return `activity-row-${id}`;
}

/** Nút mở chi tiết của một dòng (để trang trả focus / nhảy tới dòng). */
export function focusActivityRow(id: string): boolean {
  const button = document.querySelector<HTMLButtonElement>(`#${CSS.escape(activityRowDomId(id))} [data-row-button]`);
  if (!button) return false;
  button.focus({ preventScroll: true });
  button.scrollIntoView({ block: "center", behavior: "auto" });
  return true;
}

/**
 * Một dòng nhật ký. Cả dòng là một nút mở ngăn kéo chi tiết (nút phủ kín dòng);
 * link đối tượng nằm trên nút. Roving tabindex: chỉ dòng đang chọn có `tabIndex=0`,
 * ↑/↓ di chuyển giữa các dòng (do `ActivityList` xử lý).
 */
export function ActivityRow({
  item,
  tabbable,
  active,
  highlighted,
  onOpen,
  onFocusRow,
}: {
  item: AuditActivityItem;
  tabbable: boolean;
  /** Dòng đang mở trong ngăn kéo. */
  active: boolean;
  /** Vừa nhảy tới từ hành trình: tô nổi 1,5 giây. */
  highlighted: boolean;
  onOpen: (item: AuditActivityItem) => void;
  onFocusRow: () => void;
}) {
  const link = entityHref(item);
  const label = actionLabel(item.action, item.resubmit);

  return (
    <li
      id={activityRowDomId(item.id)}
      className={`relative grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-border-subtle px-4 py-3 transition-colors duration-200 first:border-t-0 motion-reduce:transition-none lg:grid-cols-[96px_minmax(0,200px)_minmax(0,1fr)_auto] lg:gap-x-4 ${
        highlighted ? "bg-brand-100" : active ? "bg-brand-50" : "hover:bg-surface-hover"
      }`}
    >
      <button
        type="button"
        data-row-button
        tabIndex={tabbable ? 0 : -1}
        aria-current={active || undefined}
        onClick={() => onOpen(item)}
        onFocus={onFocusRow}
        className="absolute inset-0 z-0 cursor-pointer rounded-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
      >
        <span className="sr-only">
          Xem chi tiết: {label} lúc {formatVnTime(item.createdAt)} ngày {formatVnDate(item.createdAt)}
        </span>
      </button>

      <time
        dateTime={item.createdAt}
        className="pointer-events-none row-span-3 grid content-start font-num text-[13px] text-text-body tabular-nums lg:row-span-1"
      >
        <span className="font-semibold text-text-strong">{formatVnTime(item.createdAt)}</span>
        <span className="text-text-muted">{formatVnDate(item.createdAt)}</span>
      </time>

      <div className="pointer-events-none min-w-0 text-[13px] lg:text-sm">
        <ActorCell item={item} />
      </div>

      <div className="pointer-events-none col-start-2 grid min-w-0 gap-1 lg:col-start-3">
        <p className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-text-strong">
          <GroupSwatch group={item.group} size={20} />
          <span className="truncate">{label}</span>
          {item.ip ? (
            <span className="ml-1 font-num text-[13px] font-normal text-text-muted tabular-nums">IP {item.ip}</span>
          ) : null}
        </p>
        <p className="text-sm text-text-body [overflow-wrap:anywhere]">{item.summary}</p>
        {item.reason ? (
          <p className="rounded-r-md border-l-[3px] border-red-600 bg-red-50 px-2.5 py-1 text-[13px] text-text-body">
            Lý do: {item.reason}
          </p>
        ) : null}
      </div>

      <div className="col-start-2 flex items-start lg:col-start-4 lg:justify-end">
        {link ? (
          <Link
            href={link.href}
            tabIndex={-1}
            className="relative z-10 inline-flex items-center gap-1 rounded-md py-0.5 text-[13px] font-semibold whitespace-nowrap text-brand-700 hover:underline"
          >
            {link.label}
            <Icon name="arrow-up-right" size={14} />
          </Link>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Danh sách nhật ký dạng gọn, mới nhất trước, tải thêm theo lô 50. Có đủ trạng
 * thái đang tải (8 dòng khung), lỗi, rỗng.
 */
export function ActivityList({
  items,
  total,
  status,
  dimmed,
  hasMore,
  loadingMore,
  activeId,
  highlightId,
  hasFilters,
  archived,
  onOpen,
  onLoadMore,
  onRetry,
  retrying,
  onClearFilters,
}: {
  items: AuditActivityItem[];
  total: number | undefined;
  status: "pending" | "error" | "success";
  /** Đang tải theo bộ lọc mới, còn hiện kết quả cũ. */
  dimmed: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  activeId: string | null;
  highlightId: string | null;
  hasFilters: boolean;
  archived: boolean;
  onOpen: (item: AuditActivityItem) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  retrying: boolean;
  onClearFilters: () => void;
}) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const tabbableId = items.some((item) => item.id === focusId) ? focusId : (items[0]?.id ?? null);

  function handleKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-row-button]"));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next = buttons[event.key === "ArrowDown" ? Math.min(index + 1, buttons.length - 1) : Math.max(index - 1, 0)];
    next?.focus();
    next?.scrollIntoView({ block: "nearest" });
  }

  let body;
  if (status === "pending") {
    body = (
      <ul aria-hidden>
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <li
            key={index}
            className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 border-t border-border-subtle px-4 py-3.5 first:border-t-0 lg:grid-cols-[96px_200px_minmax(0,1fr)_auto]"
          >
            <span className="h-9 rounded bg-surface-hover motion-safe:animate-pulse" />
            <span className="h-9 rounded bg-surface-hover motion-safe:animate-pulse" />
            <span className="hidden h-9 rounded bg-surface-hover motion-safe:animate-pulse lg:block" />
            <span className="hidden h-5 w-16 rounded bg-surface-hover motion-safe:animate-pulse lg:block" />
          </li>
        ))}
      </ul>
    );
  } else if (status === "error") {
    body = (
      <div className="p-4">
        <BlockError what="nhật ký" onRetry={onRetry} retrying={retrying} />
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <div className="grid justify-items-start gap-3 px-5 py-8">
        <p className="text-sm text-text-body">
          {archived
            ? "Không có dòng nào trong nhật ký đã lưu trữ khớp bộ lọc. Nhật ký chỉ được chuyển sang lưu trữ khi cũ hơn thời hạn giữ."
            : "Không có sự kiện nào khớp bộ lọc. Bạn thử bỏ bớt bộ lọc hoặc mở rộng khoảng ngày."}
        </p>
        {hasFilters ? (
          <DashButton variant="secondary" size="sm" icon="x" onClick={onClearFilters}>
            Bỏ lọc
          </DashButton>
        ) : null}
      </div>
    );
  } else {
    body = (
      <>
        <ul
          aria-label="Các sự kiện, mới nhất trước. Dùng mũi tên lên xuống để chuyển dòng."
          onKeyDown={handleKeyDown}
          className={`transition-opacity duration-150 motion-reduce:transition-none ${dimmed ? "opacity-60" : ""}`}
          aria-busy={dimmed || undefined}
        >
          {items.map((item) => (
            <ActivityRow
              key={item.id}
              item={item}
              tabbable={item.id === tabbableId}
              active={item.id === activeId}
              highlighted={item.id === highlightId}
              onOpen={onOpen}
              onFocusRow={() => setFocusId(item.id)}
            />
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-4 py-3">
          <p className="text-[13px] text-text-muted" aria-live="polite">
            Đang xem <b className="text-text-strong tabular-nums">{formatNumber(items.length)}</b>
            {total !== undefined ? (
              <>
                {" "}
                / <b className="text-text-strong tabular-nums">{formatNumber(total)}</b>
              </>
            ) : null}{" "}
            sự kiện
          </p>
          {hasMore ? (
            <DashButton variant="secondary" size="sm" icon="chevrons-down" loading={loadingMore} onClick={onLoadMore}>
              Tải thêm 50 dòng
            </DashButton>
          ) : null}
        </div>
      </>
    );
  }

  return body;
}
