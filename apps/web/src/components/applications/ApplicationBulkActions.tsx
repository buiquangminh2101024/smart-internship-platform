"use client";

import { Icon } from "@/components/ui/Icon";
import { BATCH_MAX } from "@/lib/interview-format";

export type BulkAction = "REVIEWING" | "SHORTLISTED" | "SCHEDULE" | "REJECTED";

/** Số hồ sơ đã chọn mà mỗi thao tác sẽ tác động (D5). */
export type BulkCounts = Record<BulkAction, number>;

const BUTTONS: { action: BulkAction; label: string; icon: string; noneReason: string }[] = [
  { action: "REVIEWING", label: "Xem xét", icon: "check", noneReason: "Không có hồ sơ Chờ duyệt nào được chọn" },
  {
    action: "SHORTLISTED",
    label: "Vào danh sách rút gọn",
    icon: "list-checks",
    noneReason: "Không có hồ sơ Đang xem xét nào được chọn",
  },
  { action: "SCHEDULE", label: "Đặt lịch", icon: "calendar-plus", noneReason: "Không có hồ sơ chờ đặt lịch nào được chọn" },
  { action: "REJECTED", label: "Từ chối", icon: "x", noneReason: "Không có hồ sơ nào còn từ chối được" },
];

/**
 * Nút của thanh thao tác (truyền vào `SelectionBar` qua `actions`). Mỗi nút ghi
 * số hồ sơ sẽ bị tác động; số bằng 0 thì khoá và `title` nêu lý do. Nút khoá
 * dùng `aria-disabled` để vẫn nhận focus và đọc được lý do.
 */
export function ApplicationBulkActions({
  counts,
  busy,
  onAction,
}: {
  counts: BulkCounts;
  /** Thao tác đang chạy: khoá cả thanh. */
  busy: BulkAction | null;
  onAction: (action: BulkAction) => void;
}) {
  const scheduleOver = counts.SCHEDULE > BATCH_MAX;
  return (
    <>
      {scheduleOver ? (
        <span className="flex items-center gap-1.5 text-[13px] text-brand-200">
          <Icon name="info" size={14} />
          Tối đa {BATCH_MAX} ứng viên mỗi lần đặt lịch
        </span>
      ) : null}
      <div className="flex flex-wrap gap-2 max-[480px]:basis-full">
        {BUTTONS.map(({ action, label, icon, noneReason }) => {
          const count = counts[action];
          const reason =
            count === 0
              ? noneReason
              : action === "SCHEDULE" && scheduleOver
                ? `Tối đa ${BATCH_MAX} ứng viên mỗi lần`
                : undefined;
          const blocked = reason !== undefined || busy !== null;
          const reject = action === "REJECTED";
          return (
            <button
              key={action}
              type="button"
              aria-disabled={blocked || undefined}
              aria-busy={busy === action || undefined}
              title={reason}
              onClick={() => !blocked && onAction(action)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none max-[480px]:flex-[1_1_auto] max-[480px]:justify-center ${
                reject
                  ? "border-red-300/50 bg-transparent text-red-200 hover:bg-white/10"
                  : "border-transparent bg-white text-brand-800 hover:bg-brand-50"
              } ${blocked ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              {busy === action ? (
                <span
                  aria-hidden
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
                />
              ) : (
                <Icon name={icon} size={14} />
              )}
              {label}
              <span className="font-num font-bold tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
