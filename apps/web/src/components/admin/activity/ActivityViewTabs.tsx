"use client";

import { useRef, type KeyboardEvent } from "react";
import type { ActivityView } from "@/lib/audit-activity";
import { formatNumber } from "@/lib/dashboard-format";

/*
 * Hai tab "Điểm chính" / "Danh sách hoạt động" (plan admin-activity-v2, M12–M14). Tab
 * gạch chân theo Admin bản D; mẫu tablist như ngăn kéo chi tiết: ←/→/Home/End, chỉ tab
 * đang chọn nằm trong thứ tự Tab. Nội dung hai tab do trang render (`viewPanelId`).
 */

const VIEWS: { key: ActivityView; label: string }[] = [
  { key: "highlights", label: "Điểm chính" },
  { key: "list", label: "Danh sách hoạt động" },
];

export function viewTabId(view: ActivityView): string {
  return `activity-view-tab-${view}`;
}

export function viewPanelId(view: ActivityView): string {
  return `activity-view-panel-${view}`;
}

export function ActivityViewTabs({
  view,
  onChange,
  attentionCount,
}: {
  view: ActivityView;
  onChange: (view: ActivityView) => void;
  /** Số quy tắc "Cần xem" đang khác 0; `undefined` khi Điểm chính chưa tải xong. */
  attentionCount: number | undefined;
}) {
  const tabRefs = useRef(new Map<ActivityView, HTMLButtonElement>());

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    const index = VIEWS.findIndex((item) => item.key === view);
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % VIEWS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + VIEWS.length) % VIEWS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = VIEWS.length - 1;
    if (next === null) return;
    event.preventDefault();
    const key = VIEWS[next]!.key;
    if (key !== view) onChange(key);
    tabRefs.current.get(key)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Cách xem nhật ký"
      onKeyDown={handleKey}
      className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border-subtle [scrollbar-width:none]"
    >
      {VIEWS.map((item) => {
        const selected = item.key === view;
        const badge = item.key === "highlights" && attentionCount ? attentionCount : 0;
        return (
          <button
            key={item.key}
            ref={(node) => {
              if (node) tabRefs.current.set(item.key, node);
              else tabRefs.current.delete(item.key);
            }}
            type="button"
            role="tab"
            id={viewTabId(item.key)}
            aria-selected={selected}
            aria-controls={viewPanelId(item.key)}
            aria-label={badge > 0 ? `${item.label}, ${formatNumber(badge)} quy tắc cần xem` : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              if (!selected) onChange(item.key);
            }}
            className={`-mb-px inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 border-b-2 px-3 text-sm font-bold whitespace-nowrap transition-colors duration-150 focus-visible:rounded-md focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none ${
              selected ? "border-brand-600 text-brand-700" : "border-transparent text-text-muted hover:text-text-strong"
            }`}
          >
            {item.label}
            {badge > 0 ? (
              <span
                aria-hidden
                className="inline-grid h-5 min-w-[22px] place-items-center rounded-full bg-marigold-100 px-[7px] text-xs font-bold text-marigold-800 tabular-nums"
              >
                {formatNumber(badge)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
