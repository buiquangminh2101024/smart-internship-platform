"use client";

import { Fragment } from "react";
import type { AuditActivityStats } from "@sip/shared-types";
import { formatNumber } from "@/lib/dashboard-format";
import { Icon } from "@/components/ui/Icon";

type Flow = AuditActivityStats["jobPostFlow"];

/** Bộ lọc mà một nhánh đặt: một hành động, kèm cờ gửi lại với hai nhánh gửi duyệt. */
export interface FlowSelection {
  action: string;
  resubmit: boolean | null;
}

interface Branch extends FlowSelection {
  key: string;
  label: string;
  value: number;
}

interface Column {
  title: string;
  branches: Branch[];
}

function columnsOf(flow: Flow): Column[] {
  return [
    {
      title: "Vào hàng chờ",
      branches: [
        { key: "first", label: "Gửi duyệt lần đầu", value: flow.submittedFirst, action: "JOB_POST_SUBMITTED", resubmit: false },
        { key: "resubmit", label: "Gửi lại sau từ chối", value: flow.submittedResubmit, action: "JOB_POST_SUBMITTED", resubmit: true },
        { key: "auto", label: "Tự đăng", value: flow.autoPublished, action: "JOB_POST_AUTO_PUBLISHED", resubmit: null },
      ],
    },
    {
      title: "Admin quyết định",
      branches: [
        { key: "approved", label: "Duyệt", value: flow.approved, action: "JOB_POST_APPROVED", resubmit: null },
        { key: "rejected", label: "Từ chối", value: flow.rejected, action: "JOB_POST_REJECTED", resubmit: null },
      ],
    },
    {
      title: "Sau khi đăng",
      branches: [{ key: "retracted", label: "Đã hạ (gỡ tin)", value: flow.retracted, action: "JOB_POST_RETRACTED", resubmit: null }],
    },
  ];
}

function BranchButton({
  branch,
  max,
  pressed,
  onToggle,
}: {
  branch: Branch;
  max: number;
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={`grid w-full cursor-pointer gap-1.5 rounded-lg border px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none ${
        pressed ? "border-brand-300 bg-brand-50" : "border-border-subtle hover:bg-surface-hover"
      }`}
    >
      <span className="flex items-center gap-2 text-[13px]">
        <span className={`flex-1 font-semibold ${pressed ? "text-brand-800" : "text-text-strong"}`}>{branch.label}</span>
        <b className="text-sm text-text-strong tabular-nums">{formatNumber(branch.value)}</b>
      </span>
      <span aria-hidden className="block h-2 overflow-hidden rounded-full bg-surface-hover">
        <span
          className="block h-full rounded-full bg-audit-job"
          style={{ width: max > 0 ? `${Math.max((branch.value / max) * 100, branch.value > 0 ? 2 : 0)}%` : "0%" }}
        />
      </span>
    </button>
  );
}

/**
 * Dòng chảy tin tuyển dụng trong khoảng ngày (L32): ba cột "Vào hàng chờ → Admin
 * quyết định → Sau khi đăng". Mỗi nhánh là nút lọc danh sách theo hành động đó;
 * "Còn chờ duyệt lúc này" là số hiện tại của hàng chờ, không lọc được.
 */
export function JobPostFlow({
  flow,
  pending,
  selected,
  onSelect,
}: {
  flow: Flow;
  /** Số tin đang chờ duyệt lúc này (hàng chờ của dashboard); `undefined` khi chưa tải. */
  pending: number | undefined;
  selected: FlowSelection | null;
  onSelect: (selection: FlowSelection | null) => void;
}) {
  const columns = columnsOf(flow);
  const max = Math.max(0, ...columns.flatMap((column) => column.branches.map((branch) => branch.value)));

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:gap-3">
        {columns.map((column, index) => (
          <Fragment key={column.title}>
            {index > 0 ? (
              <span aria-hidden className="hidden self-center text-text-subtle lg:block">
                <Icon name="chevron-right" size={20} />
              </span>
            ) : null}
            <div role="group" aria-labelledby={`flow-col-${index}`} className="grid content-start gap-1.5">
              <h3 id={`flow-col-${index}`} className="text-[13px] font-semibold text-text-muted">{column.title}</h3>
              {column.branches.map((branch) => {
                const pressed = selected?.action === branch.action && selected.resubmit === branch.resubmit;
                return (
                  <BranchButton
                    key={branch.key}
                    branch={branch}
                    max={max}
                    pressed={pressed}
                    onToggle={() => onSelect(pressed ? null : { action: branch.action, resubmit: branch.resubmit })}
                  />
                );
              })}
              {index === 1 ? (
                // Marigold chỉ dành cho "chờ duyệt"; số này không lọc được nên không phải nút.
                <div className="flex items-center gap-2 rounded-lg border border-marigold-300 bg-marigold-100 px-3 py-2 text-[13px]">
                  <Icon name="hourglass" size={14} className="flex-none text-marigold-800" />
                  <span className="flex-1 font-semibold text-marigold-800">Còn chờ duyệt lúc này</span>
                  <b className="text-sm text-text-strong tabular-nums">
                    {pending === undefined ? "–" : formatNumber(pending)}
                  </b>
                </div>
              ) : null}
            </div>
          </Fragment>
        ))}
      </div>

      <p className="border-t border-border-subtle pt-3 text-[13px] text-text-body">
        Từ chối → gửi lại: <b className="text-text-strong tabular-nums">{formatNumber(flow.submittedResubmit)}</b> lượt
        gửi lại trên <b className="text-text-strong tabular-nums">{formatNumber(flow.rejected)}</b> lượt bị từ chối.
      </p>
    </div>
  );
}
