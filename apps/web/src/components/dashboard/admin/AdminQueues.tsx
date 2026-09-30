"use client";

import { Fragment, type ReactNode } from "react";
import type { AdminDashboardOverview } from "@sip/shared-types";
import type { ModerationQueue } from "@/hooks/useAdminDashboard";
import { formatNumber, formatWaited } from "@/lib/dashboard-format";
import { Icon } from "@/components/ui/Icon";
import { SplitBar, type SplitSegment } from "./AdminPanel";

export const QUEUE_META: Record<ModerationQueue, { title: string; icon: string; unit: string }> = {
  jobPosts: { title: "Tin chờ duyệt", icon: "clipboard-check", unit: "tin" },
  companies: { title: "Công ty chờ xác minh", icon: "building-2", unit: "công ty" },
  catalog: { title: "Danh mục chờ duyệt", icon: "tag", unit: "mục" },
};

export const QUEUE_ORDER: ModerationQueue[] = ["jobPosts", "companies", "catalog"];

/** Id của bàn duyệt — thẻ hàng chờ và nút "Bắt đầu duyệt" cuộn tới đây. */
export const MODERATION_DESK_ID = "admin-moderation-desk";

function segmentsOf(queue: ModerationQueue, queues: AdminDashboardOverview["queues"]): SplitSegment[] {
  if (queue === "jobPosts") {
    const w = queues.jobPosts.wait;
    return [
      { label: "Dưới 6 giờ", value: w.under6h, color: "bg-marigold-300" },
      { label: "6 – 24 giờ", value: w.sixTo24h, color: "bg-marigold-500" },
      { label: "Trên 24 giờ", value: w.over24h, color: "bg-marigold-800" },
    ];
  }
  if (queue === "companies") {
    const w = queues.companies.wait;
    return [
      { label: "Dưới 24 giờ", value: w.under24h, color: "bg-marigold-300" },
      { label: "1 – 2 ngày", value: w.oneToTwoDays, color: "bg-marigold-500" },
      { label: "Trên 2 ngày", value: w.over2Days, color: "bg-marigold-800" },
    ];
  }
  const c = queues.catalog;
  return [
    { label: "Kỹ năng", value: c.skills, color: "bg-brand-600" },
    { label: "Trường", value: c.universities, color: "bg-brand-400" },
    { label: "Ngành", value: c.majors, color: "bg-brand-200" },
  ];
}

/** "Tin cũ nhất đã chờ 20 giờ, yêu cầu công ty cũ nhất đã chờ 1 ngày, …" — bỏ vế của hàng chờ trống. */
function oldestSummary(queues: AdminDashboardOverview["queues"]): ReactNode {
  const parts: Array<[string, string]> = [];
  if (queues.jobPosts.oldestSince) parts.push(["tin cũ nhất đã chờ", formatWaited(queues.jobPosts.oldestSince)]);
  if (queues.companies.oldestSince)
    parts.push(["yêu cầu công ty cũ nhất đã chờ", formatWaited(queues.companies.oldestSince)]);
  if (queues.catalog.oldestSince) parts.push(["đề xuất danh mục cũ nhất", formatWaited(queues.catalog.oldestSince)]);
  if (parts.length === 0) return "Không có mục nào chờ duyệt.";
  return (
    <>
      {parts.map(([text, value], i) => (
        <Fragment key={text}>
          {i === 0 ? text.charAt(0).toUpperCase() + text.slice(1) : text} <b className="text-text-strong">{value}</b>
          {i < parts.length - 1 ? ", " : "."}
        </Fragment>
      ))}
    </>
  );
}

export interface AdminQueuesProps {
  queues: AdminDashboardOverview["queues"];
  selected: ModerationQueue;
  onSelect: (queue: ModerationQueue) => void;
}

/** "Hàng chờ": câu tóm tắt mốc chờ lâu nhất và ba thẻ; bấm thẻ thì chọn tab tương ứng của bàn duyệt. */
export function AdminQueues({ queues, selected, onSelect }: AdminQueuesProps) {
  return (
    <section aria-labelledby="admin-queues-title">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h2 id="admin-queues-title" className="text-base font-bold text-text-strong">
          Hàng chờ
        </h2>
        <p className="text-[13px] text-text-muted">{oldestSummary(queues)}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 @[900px]:grid-cols-3">
        {QUEUE_ORDER.map((queue) => (
          <QueueCard
            key={queue}
            queue={queue}
            total={queues[queue].total}
            oldestSince={queues[queue].oldestSince}
            segments={segmentsOf(queue, queues)}
            pressed={queue === selected}
            onClick={() => onSelect(queue)}
          />
        ))}
      </div>
    </section>
  );
}

function QueueCard({
  queue,
  total,
  oldestSince,
  segments,
  pressed,
  onClick,
}: {
  queue: ModerationQueue;
  total: number;
  oldestSince: string | null;
  segments: SplitSegment[];
  pressed: boolean;
  onClick: () => void;
}) {
  const meta = QUEUE_META[queue];
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-controls={MODERATION_DESK_ID}
      onClick={onClick}
      className={`flex cursor-pointer flex-col gap-3 rounded-[14px] border bg-surface-card p-4 text-left text-sm transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
        pressed
          ? "border-brand-300 shadow-[0_0_0_3px_var(--color-brand-50),0_1px_2px_rgba(11,31,27,0.05)]"
          : "border-border-subtle shadow-[0_1px_2px_rgba(11,31,27,0.05)] hover:border-border-default hover:shadow-[0_4px_14px_rgba(11,31,27,0.07)]"
      }`}
    >
      <span className="flex items-center gap-2.5">
        <span aria-hidden className="grid h-8 w-8 place-items-center rounded-[9px] bg-brand-50 text-brand-600">
          <Icon name={meta.icon} size={18} />
        </span>
        <span className="flex-1 font-bold text-text-strong">{meta.title}</span>
        <Icon name="chevron-right" size={16} className={pressed ? "text-brand-600" : "text-text-subtle"} />
      </span>
      <span className="flex items-end gap-3">
        <span>
          <span className="text-[32px] leading-none font-bold text-text-strong tabular-nums">{formatNumber(total)}</span>
          <span className="ml-1 text-[13px] text-text-muted">{meta.unit}</span>
        </span>
        <span className="ml-auto text-right leading-[1.3]">
          <span className="block text-xs text-text-muted">Chờ lâu nhất</span>
          {oldestSince ? (
            <span className="inline-flex items-center gap-1 font-bold text-marigold-800">
              <Icon name="clock" size={16} />
              {formatWaited(oldestSince)}
            </span>
          ) : (
            <span className="font-bold text-text-muted">Không có</span>
          )}
        </span>
      </span>
      <SplitBar
        segments={segments}
        label={queue === "catalog" ? "Theo loại danh mục" : "Theo thời gian chờ"}
      />
    </button>
  );
}
