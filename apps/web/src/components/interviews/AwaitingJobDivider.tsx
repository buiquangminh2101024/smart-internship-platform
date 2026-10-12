"use client";

import { formatNumber } from "@/lib/dashboard-format";
import { TriStateCheckbox } from "./SelectionBar";

/**
 * Dải phân cách của một tin khi nhóm theo tin (D19), không đóng/mở:
 * `──( ☐ Tên tin · n hồ sơ )──────── Chỉ xem tin này`. Điện thoại bỏ vạch ngắn,
 * link và chữ "tiếp từ trang trước".
 */
export function AwaitingJobDivider({
  headingId,
  jobTitle,
  count,
  continued,
  checked,
  indeterminate,
  disabled,
  onToggle,
  onOnlyThisJob,
}: {
  /** id của `h3`, cho `aria-labelledby` của `section` bọc nhóm. */
  headingId: string;
  jobTitle: string;
  /** Tổng hồ sơ chờ của tin (mọi trang). */
  count: number;
  /** Tin bắt đầu từ trang trước. */
  continued: boolean;
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
  onOnlyThisJob: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="h-px w-4 flex-none bg-brand-300 max-[720px]:hidden" />
      <div className="flex min-w-0 items-center gap-2 rounded-full border border-brand-200 bg-brand-50 py-0.5 pr-3.5 pl-2.5">
        <TriStateCheckbox
          label={`Chọn các hồ sơ của tin ${jobTitle} trên trang này`}
          checked={checked}
          indeterminate={indeterminate}
          disabled={disabled}
          onChange={onToggle}
        />
        <h3 id={headingId} title={jobTitle} className="min-w-0 truncate text-sm font-bold text-brand-800">
          {jobTitle}
        </h3>
        <span className="flex-none text-[13px] whitespace-nowrap text-text-muted">
          <span aria-hidden>· </span>
          <span className="font-num tabular-nums">{formatNumber(count)}</span> hồ sơ
          {continued ? (
            <span className="max-[720px]:hidden">
              <span aria-hidden> · </span>tiếp từ trang trước
            </span>
          ) : null}
        </span>
      </div>
      <span aria-hidden className="h-px min-w-4 flex-1 bg-brand-200" />
      <button
        type="button"
        onClick={onOnlyThisJob}
        className="flex-none cursor-pointer rounded-md px-1 py-1.5 text-[13px] font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 max-[720px]:hidden"
      >
        Chỉ xem tin này
        <span className="sr-only">: {jobTitle}</span>
      </button>
    </div>
  );
}
